"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Wallet {
  id: string;
  address: string;
  label: string | null;
  addedAt: string;
}

interface WalletListProps {
  onChange?: (wallets: Wallet[]) => void;
}

export function WalletList({ onChange }: WalletListProps) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function fetchWallets() {
    const res = await fetch("/api/wallets");
    if (res.ok) {
      const { wallets } = await res.json();
      setWallets(wallets);
      onChange?.(wallets);
    }
  }

  useEffect(() => {
    fetchWallets();
  }, []);

  async function handleRemove(wallet: Wallet) {
    setRemovingId(wallet.id);
    try {
      await fetch(`/api/wallets/${wallet.address}`, { method: "DELETE" });
      await fetchWallets();
    } finally {
      setRemovingId(null);
    }
  }

  if (wallets.length === 0) {
    return <p className="text-sm text-muted-foreground">No wallets added yet.</p>;
  }

  return (
    <ul className="space-y-2">
      {wallets.map((wallet) => (
        <li
          key={wallet.id}
          className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-card"
        >
          <div className="min-w-0">
            {wallet.label && (
              <p className="text-sm font-medium truncate">{wallet.label}</p>
            )}
            <p className="text-xs font-mono text-muted-foreground truncate">
              {wallet.address}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleRemove(wallet)}
            disabled={removingId === wallet.id}
            className="shrink-0 text-destructive hover:text-destructive"
          >
            {removingId === wallet.id ? "..." : "Remove"}
          </Button>
        </li>
      ))}
    </ul>
  );
}
