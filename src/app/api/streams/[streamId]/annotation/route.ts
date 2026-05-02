// src/app/api/streams/[streamId]/annotation/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-user, per-stream annotation CRUD — custom name + freeform notes.
//
// Accepts BOTH web (iron-session cookie) and mobile (Bearer token) auth so
// the same endpoint serves the dashboard and the mobile app. Web auth runs
// first (zero network overhead — just cookie decryption); falls through to
// Bearer token validation if the cookie is absent.
//
// Endpoints:
//   GET    → returns the user's annotation for this stream, or { annotation: null }
//   PUT    → upsert; body { customName?: string|null, notes?: string|null }
//   DELETE → remove the annotation row entirely
//
// Length caps (enforced server-side):
//   customName ≤ 80 chars (renders inline next to amounts)
//   notes      ≤ 200 chars (deliberate v1 cap — short context, not journals)
//
// streamId is validated only as "non-empty + matches the canonical
// {protocol}-{chainId}-{nativeId} shape". We don't verify the stream
// actually exists in our cache — annotations are user data, persistence
// shouldn't depend on whether we currently track the underlying stream.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import {
  getUserByAddress,
  getStreamAnnotation,
  upsertStreamAnnotation,
  deleteStreamAnnotation,
  STREAM_ANNOTATION_NAME_MAX,
  STREAM_ANNOTATION_NOTES_MAX,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

// ─── Auth ────────────────────────────────────────────────────────────────────
//
// Resolve a userId from EITHER the web iron-session cookie OR a mobile
// Bearer token. Returns null when both fail. Centralised here so the
// three handlers (GET/PUT/DELETE) share one auth path.
async function resolveUserId(req: NextRequest): Promise<string | null> {
  // Web cookie first — cheaper (no DB round-trip if absent).
  try {
    const session = await getSession();
    if (session.address) {
      const user = await getUserByAddress(session.address);
      if (user) return user.id;
    }
  } catch {
    // session decode can throw on malformed cookies — fall through to bearer
  }

  // Mobile bearer token.
  const token = extractBearerToken(req);
  if (token) {
    const userId = await validateMobileToken(token);
    if (userId) return userId;
  }

  return null;
}

// ─── streamId validation ────────────────────────────────────────────────────
//
// VestingStream.id format is "{protocol}-{chainId}-{nativeId}". Protocols
// are alphanumeric + hyphens (`uncx-vm`, `jupiter-lock`); chainId is a
// base-10 integer; nativeId varies (numeric, base58, hex). Cheap regex
// guard rejects obvious junk (path traversal, sql-injection probes,
// random URL fragments) without trying to parse exactly.
const STREAM_ID_RE = /^[a-z0-9-]+-\d+-[A-Za-z0-9_-]+$/;

function validateStreamId(raw: string): string | null {
  if (!raw || raw.length > 200) return null;
  if (!STREAM_ID_RE.test(raw)) return null;
  return raw;
}

// ─── Body validation ────────────────────────────────────────────────────────

interface PutBody {
  customName?: string | null;
  notes?:      string | null;
}

function parsePutBody(raw: unknown): { ok: true; body: { customName: string | null; notes: string | null } } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = raw as PutBody;

  // customName: undefined → leave unset (means "null" on upsert);
  //             "" or null → clear; non-empty → set.
  let customName: string | null = null;
  if (typeof b.customName === "string") {
    const trimmed = b.customName.trim();
    if (trimmed.length > STREAM_ANNOTATION_NAME_MAX) {
      return { ok: false, error: `customName exceeds ${STREAM_ANNOTATION_NAME_MAX} characters` };
    }
    customName = trimmed.length > 0 ? trimmed : null;
  } else if (b.customName !== null && b.customName !== undefined) {
    return { ok: false, error: "customName must be string or null" };
  }

  let notes: string | null = null;
  if (typeof b.notes === "string") {
    // Don't trim notes — leading/trailing whitespace might be meaningful in
    // a multi-line note. Just enforce the length cap on the raw string.
    if (b.notes.length > STREAM_ANNOTATION_NOTES_MAX) {
      return { ok: false, error: `notes exceeds ${STREAM_ANNOTATION_NOTES_MAX} characters` };
    }
    notes = b.notes.length > 0 ? b.notes : null;
  } else if (b.notes !== null && b.notes !== undefined) {
    return { ok: false, error: "notes must be string or null" };
  }

  return { ok: true, body: { customName, notes } };
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ streamId: string }> },
) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { streamId: rawId } = await params;
  const streamId = validateStreamId(decodeURIComponent(rawId));
  if (!streamId) return NextResponse.json({ error: "Invalid streamId" }, { status: 400 });

  const annotation = await getStreamAnnotation(userId, streamId);
  return NextResponse.json({ annotation });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ streamId: string }> },
) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { streamId: rawId } = await params;
  const streamId = validateStreamId(decodeURIComponent(rawId));
  if (!streamId) return NextResponse.json({ error: "Invalid streamId" }, { status: 400 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parsePutBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Both fields null → just delete the row entirely. Keeps the table sparse.
  if (parsed.body.customName === null && parsed.body.notes === null) {
    await deleteStreamAnnotation(userId, streamId);
    return NextResponse.json({ annotation: null });
  }

  const annotation = await upsertStreamAnnotation({
    userId,
    streamId,
    customName: parsed.body.customName,
    notes:      parsed.body.notes,
  });
  return NextResponse.json({ annotation });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ streamId: string }> },
) {
  const userId = await resolveUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { streamId: rawId } = await params;
  const streamId = validateStreamId(decodeURIComponent(rawId));
  if (!streamId) return NextResponse.json({ error: "Invalid streamId" }, { status: 400 });

  await deleteStreamAnnotation(userId, streamId);
  return NextResponse.json({ ok: true });
}
