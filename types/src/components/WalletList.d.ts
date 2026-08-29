interface Wallet {
    id: string;
    address: string;
    label: string | null;
    addedAt: string;
}
interface WalletListProps {
    onChange?: (wallets: Wallet[]) => void;
}
export declare function WalletList({ onChange }: WalletListProps): import("react/jsx-runtime").JSX.Element;
export {};
