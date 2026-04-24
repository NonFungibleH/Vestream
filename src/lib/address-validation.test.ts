import { describe, it, expect } from "vitest";
import { detectEcosystem, isValidWalletAddress, isValidSolanaAddress, isValidEvmAddress, normaliseAddress, addressesEqual } from "./address-validation";

describe("address-validation", () => {
  describe("detectEcosystem", () => {
    it("detects EVM checksum addresses", () => {
      expect(detectEcosystem("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe("evm");
    });
    it("detects EVM lowercase addresses", () => {
      expect(detectEcosystem("0xd8da6bf26964af9d7eed9e03e53415d37aa96045")).toBe("evm");
    });
    it("detects Solana base58 pubkeys", () => {
      expect(detectEcosystem("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")).toBe("solana");
      expect(detectEcosystem("GwsPP9HHhCvEQeu3HTFzsVL6DEtnnYw4ALEtA3fMBC9Q")).toBe("solana");
    });
    it("returns null for garbage", () => {
      expect(detectEcosystem("not-an-address")).toBeNull();
      expect(detectEcosystem("0x")).toBeNull();
      expect(detectEcosystem("0xinvalid")).toBeNull();
      expect(detectEcosystem("")).toBeNull();
    });
    it("rejects EVM-length but wrong-charset strings", () => {
      expect(detectEcosystem("0xzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")).toBeNull();
    });
    it("rejects Solana-length but invalid pubkeys", () => {
      expect(detectEcosystem("1".repeat(44))).toBeNull(); // too-uniform, not on curve
    });
  });

  describe("isValidWalletAddress", () => {
    it("accepts both EVM and Solana", () => {
      expect(isValidWalletAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045")).toBe(true);
      expect(isValidWalletAddress("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")).toBe(true);
    });
    it("rejects garbage", () => {
      expect(isValidWalletAddress("not-an-address")).toBe(false);
    });
  });

  describe("normaliseAddress", () => {
    it("lowercases EVM", () => {
      expect(normaliseAddress("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"))
        .toBe("0xd8da6bf26964af9d7eed9e03e53415d37aa96045");
    });
    it("preserves Solana case", () => {
      const sol = "GwsPP9HHhCvEQeu3HTFzsVL6DEtnnYw4ALEtA3fMBC9Q";
      expect(normaliseAddress(sol)).toBe(sol);
    });
  });

  describe("addressesEqual", () => {
    it("matches EVM across casing", () => {
      expect(addressesEqual(
        "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
        "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
      )).toBe(true);
    });
    it("solana is case-sensitive", () => {
      expect(addressesEqual("GwsPP9HHhCvEQeu3HTFzsVL6DEtnnYw4ALEtA3fMBC9Q",
                            "gwspp9hhhcveqeu3htfzsvl6detnnyw4aletа3fmbc9q")).toBe(false);
    });
    it("empty strings never match", () => {
      expect(addressesEqual("", "")).toBe(false);
    });
  });
});
