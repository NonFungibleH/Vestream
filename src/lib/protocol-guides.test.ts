import { describe, it, expect } from "vitest";
import { PROTOCOL_GUIDE_SLUGS, protocolGuides } from "./protocol-guides";
import { getArticle } from "./articles";
import { listProtocols } from "./protocol-constants";

describe("protocol guides", () => {
  it("points only at articles that exist", () => {
    for (const [protocol, slugs] of Object.entries(PROTOCOL_GUIDE_SLUGS)) {
      for (const s of [slugs.explainer, slugs.howTo]) {
        if (s) expect(getArticle(s), `${protocol} → ${s}`).toBeDefined();
      }
    }
  });

  it("gives every public protocol at least one guide", () => {
    for (const p of listProtocols()) {
      expect(protocolGuides(p.slug).length, p.slug).toBeGreaterThan(0);
    }
  });

  it("strips the year tag from link text", () => {
    const g = protocolGuides("jupiter-lock")[0];
    expect(g.title).not.toMatch(/\(\d{4}\)$/);
  });
});
