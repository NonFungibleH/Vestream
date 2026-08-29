import * as React from 'react';

/**
 * CopyableCode — from vestr@0.1.0.
 */
export interface CopyableCodeProps {
code: string;
  /** Small uppercase eyebrow above the block (e.g. "claude_desktop_config.json"). */
  label?: string;
}

export declare const CopyableCode: React.ComponentType<CopyableCodeProps>;
