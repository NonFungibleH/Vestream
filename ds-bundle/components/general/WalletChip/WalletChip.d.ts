import * as React from 'react';

/**
 * WalletChip — from vestr@0.1.0.
 */
export interface WalletChipProps {
address: string;
  open: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onDisconnect: () => void;
}

export declare const WalletChip: React.ComponentType<WalletChipProps>;
