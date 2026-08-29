declare const TIERS: {
    readonly pro: {
        readonly label: "Pro";
        readonly gradient: "#1CB8B8";
        readonly accent: "#1CB8B8";
        readonly features: readonly ["Up to 3 wallet addresses", "All blockchains (ETH, BSC, Base & more)", "All vesting protocols", "Email unlock alerts", "Advanced analytics"];
    };
    readonly fund: {
        readonly label: "Fund";
        readonly gradient: "#2DB36A";
        readonly accent: "#2DB36A";
        readonly features: readonly ["Everything in Pro", "CSV & PDF portfolio exports", "iCal calendar integration", "Slack & webhook alerts", "Team workspace", "Unlimited wallet addresses"];
    };
};
type TierKey = keyof typeof TIERS;
export declare function UpsellModal({ featureName, requiredTier, onClose, }: {
    featureName: string;
    requiredTier: TierKey;
    onClose: () => void;
}): import("react/jsx-runtime").JSX.Element;
export {};
