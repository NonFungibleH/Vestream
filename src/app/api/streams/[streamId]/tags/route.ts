// src/app/api/streams/[streamId]/tags/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Per-user, per-stream tag management. Sister to /api/streams/[streamId]/annotation.
//
// Endpoints:
//   GET    → returns the user's tags for this stream as an array
//   PUT    → REPLACE the full tag set; body { tags: [{tag, color?}, ...] }
//   DELETE → remove all tags for this stream
//
// Caps (server-enforced):
//   tag value     ≤ 30 chars
//   tags / stream ≤ 10 distinct
//   color         must be #RRGGBB hex if provided
//
// Tag values are lowercase-normalised + trimmed at this layer so
// "Salary" / "salary" / " SALARY " all collapse to "salary" — prevents
// proliferation of case variants in users' personal taxonomies.
//
// Auth: same dual-auth pattern as the annotation endpoint (web cookie OR
// mobile Bearer token).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { extractBearerToken, validateMobileToken } from "@/lib/mobile-auth";
import {
  getUserByAddress,
  getStreamTags,
  setStreamTags,
  deleteStreamTags,
  STREAM_TAG_VALUE_MAX,
  STREAM_TAG_PER_STREAM_MAX,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

// ─── Auth (mirrors annotation route) ────────────────────────────────────────

async function resolveUserId(req: NextRequest): Promise<string | null> {
  try {
    const session = await getSession();
    if (session.address) {
      const user = await getUserByAddress(session.address);
      if (user) return user.id;
    }
  } catch { /* fall through */ }

  const token = extractBearerToken(req);
  if (token) {
    const userId = await validateMobileToken(token);
    if (userId) return userId;
  }
  return null;
}

// streamId regex matches the canonical VestingStream.id format —
// `{protocol}-{chainId}-{nativeId}`. Same as the annotation route.
const STREAM_ID_RE = /^[a-z0-9-]+-\d+-[A-Za-z0-9_-]+$/;

function validateStreamId(raw: string): string | null {
  if (!raw || raw.length > 200) return null;
  if (!STREAM_ID_RE.test(raw)) return null;
  return raw;
}

// ─── Tag value normalisation ────────────────────────────────────────────────
//
// Lowercase + trim. Allows letters, digits, spaces, hyphens, underscores,
// ampersands. Rejects anything else (no emojis, no slashes, no quotes —
// keeps tag values URL-safe and consistent).
const TAG_VALUE_RE = /^[a-z0-9 \-_&]+$/;
const COLOR_HEX_RE = /^#[0-9a-fA-F]{6}$/;

function normaliseTag(raw: string): string | null {
  const lower = raw.trim().toLowerCase();
  if (lower.length === 0) return null;
  if (lower.length > STREAM_TAG_VALUE_MAX) return null;
  if (!TAG_VALUE_RE.test(lower)) return null;
  return lower;
}

interface PutBody {
  tags?: Array<{ tag?: string; color?: string | null }>;
}

function parsePutBody(raw: unknown):
  | { ok: true; body: Array<{ tag: string; color: string | null }> }
  | { ok: false; error: string }
{
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const b = raw as PutBody;
  if (b.tags === undefined) return { ok: true, body: [] };
  if (!Array.isArray(b.tags)) return { ok: false, error: "tags must be an array" };
  if (b.tags.length > STREAM_TAG_PER_STREAM_MAX) {
    return { ok: false, error: `Too many tags (max ${STREAM_TAG_PER_STREAM_MAX} per stream)` };
  }

  const out: Array<{ tag: string; color: string | null }> = [];
  for (const entry of b.tags) {
    if (typeof entry !== "object" || entry === null) {
      return { ok: false, error: "Each tag entry must be an object" };
    }
    if (typeof entry.tag !== "string") {
      return { ok: false, error: "tag must be a string" };
    }
    const tag = normaliseTag(entry.tag);
    if (!tag) {
      return {
        ok: false,
        error: `Invalid tag "${entry.tag}" — must be ${STREAM_TAG_VALUE_MAX} chars or fewer, alphanumeric + spaces/hyphens/underscores/ampersands`,
      };
    }
    let color: string | null = null;
    if (entry.color !== undefined && entry.color !== null) {
      if (typeof entry.color !== "string" || !COLOR_HEX_RE.test(entry.color)) {
        return { ok: false, error: `Invalid color "${entry.color}" — must be #RRGGBB hex` };
      }
      color = entry.color.toLowerCase();
    }
    out.push({ tag, color });
  }
  return { ok: true, body: out };
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

  const tags = await getStreamTags(userId, streamId);
  return NextResponse.json({ tags });
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

  const tags = await setStreamTags(userId, streamId, parsed.body);
  return NextResponse.json({ tags });
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

  await deleteStreamTags(userId, streamId);
  return NextResponse.json({ ok: true });
}
