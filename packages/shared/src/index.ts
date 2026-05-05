// Public barrel for @mirrars/shared.
//
// Types + Zod schemas only. Consumers: apps/server (runtime), apps/web (types
// only via its own local types folder — this barrel is not imported there).
//
// Explicit named re-exports (not `export *`) so CJS→ESM named-export
// detection works statically — `export *` compiles to a runtime
// `__exportStar` that Node can't analyse at parse time.

export {
  researchContextSchema,
  researchQuestionSchema,
  questionCategorySchema,
  studyPatchSchema,
} from './types/research-context.type';
export type {
  ResearchContext,
  ResearchQuestion,
  QuestionCategory,
  StudyPatch,
} from './types/research-context.type';

export {
  studySchema,
  studyStatusSchema,
  studyChatMessageSchema,
  studyResultsSchema,
} from './types/study.type';
export type {
  Study,
  StudyStatus,
  StudyChatMessage,
  StudyResults,
} from './types/study.type';

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
  emailStatusSchema,
  EMBEDDING_DIMS,
} from './types/contact.type';
export type { Contact, ContactSummary, EmailStatus } from './types/contact.type';

export {
  studyCandidateSchema,
  candidateStatusSchema,
  candidateSourceSchema,
} from './types/candidate.type';
export type {
  StudyCandidate,
  CandidateStatus,
  CandidateSource,
} from './types/candidate.type';
