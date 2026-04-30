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
  | 'brief.list'
  | 'brief.detail'
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

export type EntityKind = 'brief' | 'candidate' | 'contact' | 'interview' | 'job';

export type ScopeEntity = {
  kind: EntityKind;
  id: string;
  name?: string;
};

/**
 * Flat list of entities a turn surfaced. Round-trips on assistant turns.
 * Lists contribute one entity per item; details contribute the focal
 * entity plus its parent (e.g. candidate.detail → candidate + brief).
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
  list_briefs: 'brief.list',
  get_brief: 'brief.detail',
  create_brief: 'brief.detail',
  update_brief: 'brief.detail',
  preview_brief: 'brief.detail',
  list_candidates_for_brief: 'candidate.list',
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
 * Project an artifact into the entities the agent should treat as
 * "in scope" on subsequent turns. Defensive against unknown shapes —
 * everything optional, missing fields silently skipped.
 */
export function artifactToRef(artifact: Artifact): ArtifactRef {
  const entities: ScopeEntity[] = [];
  const data = artifact.data;

  switch (artifact.type) {
    case 'brief.list': {
      // Wire shape: BriefListItem[]
      forEachItem(data, (item) => {
        const id = pickString(item.briefId);
        const name = pickString(item.productName);
        if (id) entities.push({ kind: 'brief', id, name });
      });
      break;
    }
    case 'brief.detail': {
      // Wire shape from get_brief / create_brief / update_brief:
      // `{ briefId, researchContext, createdAt }`. preview_brief returns
      // a draft without a briefId — we skip the entity in that case.
      const obj = pickObject(data) ?? {};
      const id = pickString(obj.briefId);
      const ctx = pickObject(obj.researchContext);
      const product = pickObject(ctx?.product);
      const name = pickString(product?.name);
      if (id) entities.push({ kind: 'brief', id, name });
      break;
    }
    case 'candidate.list': {
      // Wire shape: { briefId, briefName, candidates: [...] } OR legacy array
      const obj = pickObject(data);
      const briefId = pickString(obj?.briefId);
      const briefName = pickString(obj?.briefName);
      if (briefId) entities.push({ kind: 'brief', id: briefId, name: briefName });
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
      const briefId = pickString(obj?.briefId);
      const briefName = pickString(obj?.briefName);
      const contact = pickObject(obj?.contact);
      const candidateName = pickString(contact?.name);
      if (candidateId) entities.push({ kind: 'candidate', id: candidateId, name: candidateName });
      if (briefId) entities.push({ kind: 'brief', id: briefId, name: briefName });
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
      const briefId = pickString(obj?.briefId);
      const briefName = pickString(obj?.briefName);
      if (briefId) entities.push({ kind: 'brief', id: briefId, name: briefName });
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
      const briefId = pickString(obj?.briefId);
      const briefName = pickString(obj?.briefName);
      const contactName = pickString(obj?.contactName);
      if (interviewId) entities.push({ kind: 'interview', id: interviewId, name: contactName });
      if (briefId) entities.push({ kind: 'brief', id: briefId, name: briefName });
      break;
    }
    case 'job.status': {
      const obj = pickObject(data);
      const jobId = pickString(obj?.jobId);
      const briefId = pickString(obj?.briefId);
      const briefName = pickString(obj?.briefName);
      if (jobId) entities.push({ kind: 'job', id: jobId });
      if (briefId) entities.push({ kind: 'brief', id: briefId, name: briefName });
      break;
    }
    case 'dashboard': {
      // Capture every brief + interview the dashboard surfaces so the
      // agent can resolve subsequent name-based references without a
      // re-list (e.g. user types "approve Tania" right after seeing the
      // dashboard's recent-interviews row).
      const obj = pickObject(data) ?? {};
      const recentBriefs = Array.isArray(obj.recentBriefs)
        ? (obj.recentBriefs as unknown[])
        : [];
      for (const raw of recentBriefs) {
        const item = pickObject(raw);
        const id = pickString(item?.briefId);
        const name = pickString(item?.productName);
        if (id) entities.push({ kind: 'brief', id, name });
      }
      const pendingByBrief = Array.isArray(obj.pendingByBrief)
        ? (obj.pendingByBrief as unknown[])
        : [];
      for (const raw of pendingByBrief) {
        const item = pickObject(raw);
        const id = pickString(item?.briefId);
        const name = pickString(item?.briefName);
        if (id) entities.push({ kind: 'brief', id, name });
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
  brief: 'briefId',
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
