import type { ReactNode } from 'react';
import type { PillAction } from '@/lib/api';

/**
 * Common props passed to every card renderer. `result` is the typed
 * artifact data (cast inside each renderer), `error` is reserved for
 * future inline-error variants, `onAction` lets cards/pills dispatch
 * structured actions (tool execution, free-typed prompts, externals)
 * without knowing about endpoints.
 */
export type CardRendererProps = {
  result: unknown;
  error: string | null;
  onAction: (action: PillAction) => void;
};

export type CardRenderer = (props: CardRendererProps) => ReactNode;

export type { PillAction };
