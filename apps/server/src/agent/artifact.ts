/**
 * One artifact per assistant turn. The agent loop produces many tool
 * calls (lookups, retries, validation flubs); only the LAST successful
 * call that returns a known entity shape becomes the user-facing
 * artifact. Everything else stays internal mechanism.
 *
 * Tool calls are NOT exposed on the wire — `toolCalls` was removed from
 * `/chat` response. Diagnostic logging still captures them server-side.
 *
 * Each artifact also yields a structured `ArtifactRef` — a flat list of
 * (kind, id, name) entities the user could now reference. It round-trips
 * with the assistant turn so future turns get an "Entities in scope"
 * block assembled across the conversation. Works uniformly for list,
 * detail, and mutation artifacts.
 */

import type { ToolCallRecord } from './run-agent';

export type ArtifactType =
  | 'study.list'
  | 'study.detail'
  | 'candidate.list'
  | 'candidate.detail'
  | 'candidate.mutation'
  | 'contact.list'
  | 'contact.detail'
  | 'interview.list'
  | 'interview.detail'
  | 'job.status'
  | 'dashboard';

export type Artifact = {
  type: ArtifactType;
  data: unknown;
};

export type EntityKind = 'study' | 'candidate' | 'contact' | 'interview' | 'job';

export type ScopeEntity = {
  kind: EntityKind;
  id: string;
  name?: string;
};

/**
 * Flat list of entities a turn surfaced. Round-trips on assistant turns.
 * Lists contribute one entity per item; details contribute the focal
 * entity plus its parent (e.g. candidate.detail → candidate + study).
 */
export type ArtifactRef = {
  type: ArtifactType;
  entities: ScopeEntity[];
};

/**
 * Single source of truth for which tool produces which artifact view.
 * If a tool name isn't here, its result never surfaces as an artifact.
 */
const TOOL_TO_ARTIFACT_TYPE: Record<string, ArtifactType> = {
  list_studies: 'study.list',
  get_study: 'study.detail',
  // `create_study` and `update_study` are intentionally NOT in this map.
  // They're internal mechanism in the iterative draft flow — every time
  // the user adds a piece of info, the agent calls update_study to layer
  // it onto the row. Surfacing a study.detail card after each call would
  // spam the chat with redundant cards and visually interrupt what's
  // really a continuous conversation.
  //
  // The user-facing path to view a study is `preview_study({ studyId })`
  // (during drafting) or `get_study({ studyId })` (after / for editing).
  // Both still surface their results as cards.
  preview_study: 'study.detail',
  list_candidates_for_study: 'candidate.list',
  get_candidate: 'candidate.detail',
  approve_candidate: 'candidate.mutation',
  reject_candidate: 'candidate.mutation',
  invite_candidate: 'candidate.mutation',
  list_contacts: 'contact.list',
  get_contact: 'contact.detail',
  list_interviews: 'interview.list',
  get_interview: 'interview.detail',
  find_candidates: 'job.status',
  get_job_status: 'job.status',
  get_dashboard: 'dashboard',
};

export function pickArtifact(toolCalls: ToolCallRecord[]): Artifact | null {
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    const call = toolCalls[i];
    if (call.error) continue;
    const type = TOOL_TO_ARTIFACT_TYPE[call.name];
    if (!type) continue;
    return { type, data: call.result };
  }
  return null;
}

/**
 * Tools that touch a study but DON'T produce a visible card. Their
 * results still need to flow into `artifactRef.entities` so future
 * turns know which study is in scope (otherwise the agent picks
 * stale ids from earlier list/get calls and `update_study` fails
 * with "Study not found").
 *
 * Kept separate from `TOOL_TO_ARTIFACT_TYPE` because `pickArtifact`
 * MUST NOT return these — they'd render as redundant cards.
 */
const SCOPE_ONLY_STUDY_TOOLS: Record<string, ArtifactType> = {
  create_study: 'study.detail',
  update_study: 'study.detail',
};

/**
 * Build the artifactRef for a turn. Two layers:
 *   1. The visible artifact (if any) contributes its entities.
 *   2. Scope-only tools (create_study / update_study) ALSO contribute
 *      — their studyId enters the chain even when no card renders.
 *
 * Returns null only when nothing in the turn referenced an entity.
 */
export function buildArtifactRef(
  artifact: Artifact | null,
  toolCalls: ToolCallRecord[],
): ArtifactRef | null {
  const entities: ScopeEntity[] = [];
  let primaryType: ArtifactType | null = null;

  if (artifact) {
    const fromArtifact = artifactToRef(artifact);
    entities.push(...fromArtifact.entities);
    primaryType = fromArtifact.type;
  }

  for (const call of toolCalls) {
    if (call.error) continue;
    const scopeType = SCOPE_ONLY_STUDY_TOOLS[call.name];
    if (!scopeType) continue;
    const fromCall = artifactToRef({ type: scopeType, data: call.result });
    entities.push(...fromCall.entities);
    if (!primaryType) primaryType = scopeType;
  }

  if (entities.length === 0) return null;

  // Dedupe by (kind, id), keeping the last occurrence (most recent
  // wins for name updates). Preserves overall last-seen order.
  const seen = new Map<string, ScopeEntity>();
  for (const e of entities) seen.set(`${e.kind}:${e.id}`, e);
  return { type: primaryType ?? 'study.detail', entities: Array.from(seen.values()) };
}

/**
 * Project an artifact into the entities the agent should treat as
 * "in scope" on subsequent turns. Defensive against unknown shapes —
 * everything optional, missing fields silently skipped.
 */
export function artifactToRef(artifact: Artifact): ArtifactRef {
  const entities: ScopeEntity[] = [];
  const data = artifact.data;

  switch (artifact.type) {
    case 'study.list': {
      // Wire shape: StudyListItem[]
      forEachItem(data, (item) => {
        const id = pickString(item.studyId);
        const name = pickString(item.productName);
        if (id) entities.push({ kind: 'study', id, name });
      });
      break;
    }
    case 'study.detail': {
      // Wire shape from get_study / create_study / update_study:
      // `{ studyId, researchContext, createdAt }`. preview_study returns
      // a draft without a studyId — we skip the entity in that case.
      const obj = pickObject(data) ?? {};
      const id = pickString(obj.studyId);
      const ctx = pickObject(obj.researchContext);
      const product = pickObject(ctx?.product);
      const name = pickString(product?.name);
      if (id) entities.push({ kind: 'study', id, name });
      break;
    }
    case 'candidate.list': {
      // Wire shape: { studyId, studyName, candidates: [...] } OR legacy array
      const obj = pickObject(data);
      const studyId = pickString(obj?.studyId);
      const studyName = pickString(obj?.studyName);
      if (studyId) entities.push({ kind: 'study', id: studyId, name: studyName });
      const items = Array.isArray(obj?.candidates)
        ? (obj?.candidates as unknown[])
        : Array.isArray(data)
          ? (data as unknown[])
          : [];
      for (const raw of items) {
        const item = pickObject(raw);
        const id = pickString(item?.candidateId);
        const contact = pickObject(item?.contact);
        const name = pickString(contact?.name);
        if (id) entities.push({ kind: 'candidate', id, name });
      }
      break;
    }
    case 'candidate.detail':
    case 'candidate.mutation': {
      const obj = pickObject(data);
      const candidateId = pickString(obj?.candidateId);
      const studyId = pickString(obj?.studyId);
      const studyName = pickString(obj?.studyName);
      const contact = pickObject(obj?.contact);
      const candidateName = pickString(contact?.name);
      if (candidateId) entities.push({ kind: 'candidate', id: candidateId, name: candidateName });
      if (studyId) entities.push({ kind: 'study', id: studyId, name: studyName });
      break;
    }
    case 'contact.list': {
      forEachItem(data, (item) => {
        const id = pickString(item.id);
        const name = pickString(item.name);
        if (id) entities.push({ kind: 'contact', id, name });
      });
      break;
    }
    case 'contact.detail': {
      // Wire shape from get_contact: `{ contactId, name, ... }`.
      const obj = pickObject(data);
      const id = pickString(obj?.contactId);
      const name = pickString(obj?.name);
      if (id) entities.push({ kind: 'contact', id, name });
      break;
    }
    case 'interview.list': {
      const obj = pickObject(data);
      const studyId = pickString(obj?.studyId);
      const studyName = pickString(obj?.studyName);
      if (studyId) entities.push({ kind: 'study', id: studyId, name: studyName });
      const items = Array.isArray(obj?.interviews)
        ? (obj?.interviews as unknown[])
        : Array.isArray(data)
          ? (data as unknown[])
          : [];
      for (const raw of items) {
        const item = pickObject(raw);
        const id = pickString(item?.interviewId);
        const name = pickString(item?.contactName);
        if (id) entities.push({ kind: 'interview', id, name });
      }
      break;
    }
    case 'interview.detail': {
      const obj = pickObject(data);
      const interviewId = pickString(obj?.interviewId);
      const studyId = pickString(obj?.studyId);
      const studyName = pickString(obj?.studyName);
      const contactName = pickString(obj?.contactName);
      if (interviewId) entities.push({ kind: 'interview', id: interviewId, name: contactName });
      if (studyId) entities.push({ kind: 'study', id: studyId, name: studyName });
      break;
    }
    case 'job.status': {
      const obj = pickObject(data);
      const jobId = pickString(obj?.jobId);
      const studyId = pickString(obj?.studyId);
      const studyName = pickString(obj?.studyName);
      if (jobId) entities.push({ kind: 'job', id: jobId });
      if (studyId) entities.push({ kind: 'study', id: studyId, name: studyName });
      break;
    }
    case 'dashboard': {
      // Capture every study + interview the dashboard surfaces so the
      // agent can resolve subsequent name-based references without a
      // re-list (e.g. user types "approve Tania" right after seeing the
      // dashboard's recent-interviews row).
      const obj = pickObject(data) ?? {};
      const recentStudies = Array.isArray(obj.recentStudies)
        ? (obj.recentStudies as unknown[])
        : [];
      for (const raw of recentStudies) {
        const item = pickObject(raw);
        const id = pickString(item?.studyId);
        const name = pickString(item?.productName);
        if (id) entities.push({ kind: 'study', id, name });
      }
      const pendingByStudy = Array.isArray(obj.pendingByStudy)
        ? (obj.pendingByStudy as unknown[])
        : [];
      for (const raw of pendingByStudy) {
        const item = pickObject(raw);
        const id = pickString(item?.studyId);
        const name = pickString(item?.studyName);
        if (id) entities.push({ kind: 'study', id, name });
      }
      const recentInterviews = Array.isArray(obj.recentInterviews)
        ? (obj.recentInterviews as unknown[])
        : [];
      for (const raw of recentInterviews) {
        const item = pickObject(raw);
        const id = pickString(item?.interviewId);
        const name = pickString(item?.contactName);
        if (id) entities.push({ kind: 'interview', id, name });
      }
      break;
    }
    default: {
      const _exhaustive: never = artifact.type;
      void _exhaustive;
    }
  }

  return { type: artifact.type, entities };
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function pickObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function forEachItem(
  data: unknown,
  fn: (item: Record<string, unknown>) => void,
): void {
  if (!Array.isArray(data)) return;
  for (const raw of data) {
    const obj = pickObject(raw);
    if (obj) fn(obj);
  }
}

const ID_FIELD: Record<EntityKind, string> = {
  study: 'studyId',
  candidate: 'candidateId',
  contact: 'contactId',
  interview: 'interviewId',
  job: 'jobId',
};

/**
 * Render a list of `ArtifactRef`s into a compact "Entities in scope"
 * block. Walks refs in conversation order, dedupes by (kind, id) keeping
 * the LATEST occurrence (so a re-fetch with an updated name wins), and
 * emits the result most-recent-first so the agent treats top entries as
 * "currently active."
 */
export function renderEntitiesInScope(refs: ArtifactRef[]): string {
  type Indexed = ScopeEntity & { lastSeenIdx: number };
  const seen = new Map<string, Indexed>();
  refs.forEach((ref, i) => {
    for (const e of ref.entities) {
      const key = `${e.kind}:${e.id}`;
      seen.set(key, { ...e, lastSeenIdx: i });
    }
  });
  if (seen.size === 0) return '';
  // Most recent first.
  const ordered = Array.from(seen.values()).sort(
    (a, b) => b.lastSeenIdx - a.lastSeenIdx,
  );
  const lines = ordered.map((e) => {
    const idField = ID_FIELD[e.kind];
    const namePart = e.name ? ` "${e.name}"` : '';
    return `- ${e.kind}${namePart} (${idField}=${e.id})`;
  });
  return `Entities in scope (most recent first):\n${lines.join('\n')}`;
}
