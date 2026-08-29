import type { FAQItem } from "@/lib/vesting/token-faq";
interface Props {
    /** Ordered FAQ list from buildTokenFAQ(). Rendered verbatim and also
     *  serialised into the JSON-LD block. */
    items: FAQItem[];
    /** Passed to the heading so the section has a token-specific title that
     *  matches the rest of the page. */
    symbol: string;
}
export declare function TokenFAQ({ items, symbol }: Props): import("react/jsx-runtime").JSX.Element | null;
export {};
