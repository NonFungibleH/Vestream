import * as React from 'react';

/**
 * Input — from vestr@0.1.0.
 */
export interface InputProps {
type?: React.HTMLInputTypeAttribute;
  placeholder?: string;
  value?: string | number;
  defaultValue?: string | number;
  disabled?: boolean;
  className?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}

export declare const Input: React.ComponentType<InputProps>;
