"use client";

import { useState } from "react";
import { isValidWalletAddress } from "@/lib/address-validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface WalletInputProps {
  onAdd: () => void;
}

export function WalletInput({ onAdd }: WalletInputProps) {
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isValidWalletAddress(address)) {
      setError("Enter a valid wallet address (EVM 0x… or Solana pubkey)");
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, label: label || undefined }),
      });

      if (res.status === 409) {
        setError("Wallet already added");
        return;
      }

      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? "Failed to add wallet");
        return;
      }

      setAddress("");
      setLabel("");
      onAdd();
    } catch {
      setError("Network error");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <Label htmlFor="address">Wallet Address</Label>
        <Input
          id="address"
          placeholder="0x… or Solana pubkey"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="font-mono mt-1"
        />
      </div>
      <div>
        <Label htmlFor="label">Label (optional)</Label>
        <Input
          id="label"
          placeholder="e.g. Team vesting wallet"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="mt-1"
        />
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <Button type="submit" disabled={isLoading || !address}>
        {isLoading ? "Adding..." : "Add Wallet"}
      </Button>
    </form>
  );
}
