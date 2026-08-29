import * as React from 'react';

/**
 * Button — from vestr@0.1.0.
 */
export interface ButtonProps {
variant?: "default" | "secondary" | "destructive" | "outline" | "ghost" | "link";
  size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
  /** Render as the child element instead of a <button> (Radix Slot). */
  asChild?: boolean;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  children?: React.ReactNode;
}

export declare const Button: React.ComponentType<ButtonProps>;
