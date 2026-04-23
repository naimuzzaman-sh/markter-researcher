// Public barrel export for @market-researcher/shared.
// Shared by apps/api, apps/web (types only), and apps/mcp.
//
// We use explicit named re-exports (rather than `export * from './x'`) so that
// Node's CJS→ESM named-export detection sees every symbol statically. When
// this module is built to CommonJS and imported from the ESM MCP server, any
// `export *` re-export compiles to a runtime `__exportStar(...)` call that
// Node can't analyse at parse time — consumers get "does not provide an
// export named X" errors. Listing names explicitly keeps the CJS output
// statically traceable and the ESM interop clean.

// Zod schemas + inferred TypeScript types
export {
  researchContextSchema,
  researchQuestionSchema,
  questionCategorySchema,
  briefPatchSchema,
} from './types/research-context.type';
export type {
  ResearchContext,
  ResearchQuestion,
  QuestionCategory,
  BriefPatch,
} from './types/research-context.type';

export { briefSchema } from './types/brief.type';
export type { Brief } from './types/brief.type';

export {
  callAnalysisSchema,
  sentimentSchema,
} from './types/call-analysis.type';
export type { CallAnalysis, Sentiment } from './types/call-analysis.type';

export { savedInterviewSchema } from './types/saved-interview.type';
export type {
  SavedInterview,
  InterviewSummary,
  InterviewDetail,
} from './types/saved-interview.type';

export type {
  CallRecord,
  CallStatus,
  TranscriptEntry,
} from './types/call-record.type';

export {
  chatMessageSchema,
  setupSessionSchema,
} from './types/setup-session.type';
export type { ChatMessage, SetupSession } from './types/setup-session.type';

export {
  agentJobSchema,
  agentJobKindSchema,
  agentJobStatusSchema,
} from './types/agent-job.type';
export type {
  AgentJob,
  AgentJobKind,
  AgentJobStatus,
} from './types/agent-job.type';

export {
  contactSchema,
  contactSummarySchema,
  EMBEDDING_DIMS,
} from './types/contact.type';
export type { Contact, ContactSummary } from './types/contact.type';

export {
  briefCandidateSchema,
  candidateStatusSchema,
  candidateSourceSchema,
} from './types/candidate.type';
export type {
  BriefCandidate,
  CandidateStatus,
  CandidateSource,
} from './types/candidate.type';

// Domain services (plain classes — consumers wrap with @Injectable as needed)
export { SupabaseService, type AuthUser } from './supabase.service';
export { BriefsService } from './briefs.service';
export { AgentJobsService } from './agent-jobs.service';
export { ContactsService } from './contacts.service';
export { CandidatesService } from './candidates.service';

// Reusable prompt guidance (used by both the web's Gemini and the MCP's tool descriptions)
export { BRIEF_SETUP_GUIDANCE } from './brief-setup-guidance';

// Logger contract
export { type SharedLogger, defaultLogger } from './logger';
