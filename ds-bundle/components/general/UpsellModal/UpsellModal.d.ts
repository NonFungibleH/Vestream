import * as React from 'react';

/**
 * UpsellModal — from vestr@0.1.0.
 */
export interface UpsellModalProps {
featureName: string;
  requiredTier: "pro" | "fund";
  onClose: () => void;
}

export declare const UpsellModal: React.ComponentType<UpsellModalProps>;
