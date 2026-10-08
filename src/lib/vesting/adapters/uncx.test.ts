import { describe, it, expect } from "vitest";
import { uncxLockIdFromEntity } from "./uncx";

describe("uncxLockIdFromEntity", () => {
  it("takes the real lock id from the entity id, not the subgraph's lockID field", () => {
    // After a transfer/split the subgraph stamps the new entity with the
    // PARENT's lockID; the entity id (locker + id) carries the true one.
    expect(uncxLockIdFromEntity("0xdba68f07d1b7ca219f78ae8582c213d975c25caf9399", "17")).toBe("9399");
  });
  it("falls back when the entity id is not in the expected shape", () => {
    expect(uncxLockIdFromEntity("weird-id", "17")).toBe("17");
  });
});
