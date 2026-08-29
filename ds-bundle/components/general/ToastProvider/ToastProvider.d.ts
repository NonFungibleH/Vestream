import * as React from 'react';

/**
 * ToastProvider — from vestr@0.1.0.
 */
export interface ToastProviderProps {
/** App subtree that can call useToast(). */
  children: React.ReactNode;
}

export declare const ToastProvider: React.ComponentType<ToastProviderProps>;
