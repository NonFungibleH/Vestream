import { type ReactNode } from "react";
type ToastKind = "success" | "error" | "info";
interface ToastApi {
    show: (msg: string, kind?: ToastKind) => void;
    success: (msg: string) => void;
    error: (msg: string) => void;
    info: (msg: string) => void;
}
/** Safe to call outside a provider – falls back to a no-op (logs in dev). */
export declare function useToast(): ToastApi;
export declare function ToastProvider({ children }: {
    children: ReactNode;
}): import("react/jsx-runtime").JSX.Element;
export {};
