import { z } from 'zod';
import { researchContextSchema } from './research-context.type';

/**
 * Lifecycle states a brief can be in:
 *   draft  — being assembled in chat. researchContext may be partial.
 *            Visible in list views with a draft badge so the user can
 *            click in and resume the conversation.
 *   active — fully populated, confirmed via preview, candidate
 *            discovery / interviews can run against it.
 */
const briefStatusSchema = z.enum(['draft', 'active']);
type BriefStatus = z.infer<typeof briefStatusSchema>;

/**
 * Persisted chat turn anchored to a brief. Mirrors the in-memory
 * `Turn` shape on the web client. `artifact` / `artifactRef` are
 * intentionally typed as `unknown` here — their shapes live in the
 * server's agent layer and we want the persistence layer to be a
 * structural pass-through, not a deep-validating mirror.
 */
const briefChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  artifact: z.unknown().optional(),
  artifactRef: z.unknown().optional(),
});
type BriefChatMessage = z.infer<typeof briefChatMessageSchema>;

/**
 * Aggregated findings across all completed interviews for a brief.
 * Re-computed (and overwritten) by the server after every interview
 * end. Null until the first interview completes successfully.
 */
const briefResultsSchema = z.object({
  /** 1–2 paragraph human-readable synthesis. */
  summary: z.string(),
  /** Recurring topics across interviews (3–7). */
  themes: z.array(z.string()),
  /** Concrete pain points interviewees expressed (3–7). */
  painPoints: z.array(z.string()),
  /** Quotes / moments suggesting product-market fit or its absence (2–5). */
  pmfSignalsObserved: z.array(z.string()),
  /** Suggested next steps for the researcher (2–4). */
  recommendations: z.array(z.string()),
  /** How many interviews fed into this synthesis. */
  interviewCount: z.number().int().nonnegative(),
  /** ISO timestamp of when this results payload was generated. */
  lastUpdated: z.string(),
});
type BriefResults = z.infer<typeof briefResultsSchema>;

const briefSchema = z.object({
  id: z.string().min(1),
  // For drafts this may be partial — the runtime is intentionally loose
  // here. Strict validation happens at the active-promotion point.
  researchContext: researchContextSchema,
  status: briefStatusSchema,
  chatHistory: z.array(briefChatMessageSchema).default([]),
  /** Synthesis from completed interviews. Null until the first one. */
  results: briefResultsSchema.nullable(),
  createdAt: z.date(),
});

type Brief = z.infer<typeof briefSchema>;

export {
  briefSchema,
  briefStatusSchema,
  briefChatMessageSchema,
  briefResultsSchema,
};
export type { Brief, BriefStatus, BriefChatMessage, BriefResults };
