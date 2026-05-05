# Dynamic Chat Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw markdown enumeration in the AgentChat assistant turn with structured editorial-style cards rendered from tool results, while preserving chat as the primary interaction model.

**Architecture:** Client-side tool-name registry — `apps/web/src/components/agent-cards/registry.tsx` maps each `ChatToolCall.name` to a typed React renderer. AgentChat dispatches each tool call through the registry after rendering the assistant's prose lead-in. Cards expose action pills that call `onPromptSelect(text)` to append a synthetic user turn (visible in the transcript). Server change is limited to two tool denormalizations and one prompt edit.

**Tech Stack:** React 19, TypeScript (strict), Tailwind v4, Vitest, React Testing Library, Hono server, Zod, `@mirrars/shared` entity types.

**Reference spec:** `docs/superpowers/specs/2026-04-27-dynamic-chat-cards-design.md`

**Working branch:** continue on the current branch (`feat/server-rewrite`).

---

## File Structure

```
apps/web/
  vitest.config.ts                    NEW   vitest+RTL config
  src/test/setup.ts                   NEW   testing-library jest-dom setup
  src/components/agent-cards/         NEW   all card renderers + primitives
    index.ts
    registry.tsx
    types.ts
    Panel.tsx                Panel.test.tsx
    StatusPill.tsx           StatusPill.test.tsx
    SentimentPill.tsx        SentimentPill.test.tsx
    ActionPill.tsx           ActionPill.test.tsx
    format-source.ts         format-source.test.ts
    format-relative-time.ts  format-relative-time.test.ts
    BriefList.tsx            BriefList.test.tsx
    BriefDetail.tsx          BriefDetail.test.tsx
    CandidateList.tsx        CandidateList.test.tsx
    CandidateDetail.tsx      CandidateDetail.test.tsx
    ContactList.tsx          ContactList.test.tsx
    ContactDetail.tsx        ContactDetail.test.tsx
    InterviewList.tsx        InterviewList.test.tsx
    InterviewDetail.tsx      InterviewDetail.test.tsx
    JobStatus.tsx            JobStatus.test.tsx
    MutationConfirm.tsx      MutationConfirm.test.tsx
    EmptyState.tsx           EmptyState.test.tsx
    ErrorPanel.tsx           ErrorPanel.test.tsx
  src/components/AgentChat.tsx        MODIFY   drop tool chips, add registry dispatch + onPromptSelect
  src/components/AgentChat.test.tsx   NEW      integration test

apps/server/
  src/tools/list-candidates-for-brief.ts        MODIFY   return contact summary alongside candidate
  src/tools/list-candidates-for-brief.test.ts   NEW      asserts denormalized shape (file may need creating)
  src/tools/list-interviews.ts                  MODIFY   return briefName + contactName
  src/tools/list-interviews.test.ts             NEW      asserts denormalized shape
  src/db/candidates.ts                          MODIFY   add listCandidatesForBriefWithContact join helper
  src/db/interviews.ts                          MODIFY   add briefName + contactName to listInterviewsByOwner
  src/agent/prompts.ts                          MODIFY   append "no enumeration" rule to UNIVERSAL_SYSTEM_PROMPT
```

---

## Phase 0 — Web Testing Infrastructure (precondition)

The web workspace currently has no `test` script. Phase 0 sets up Vitest + React Testing Library so subsequent phases can do TDD.

### Task 0.1: Add Vitest + RTL deps and config

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/test/setup.ts`
- Create: `apps/web/src/test/sanity.test.ts` (deleted at end of task — proves the harness works)

- [ ] **Step 1: Install deps**

```bash
pnpm --dir apps/web add -D vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/node
```

- [ ] **Step 2: Add `test` scripts to `apps/web/package.json`**

In the `"scripts"` block, after the existing `start` script, add:

```json
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
```

- [ ] **Step 3: Create `apps/web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx'],
    },
  },
});
```

- [ ] **Step 4: Create `apps/web/src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 5: Add Vitest globals to `apps/web/tsconfig.json`**

Open `apps/web/tsconfig.json` and add `"vitest/globals"` and `"@testing-library/jest-dom"` to `compilerOptions.types` (creating the array if absent).

- [ ] **Step 6: Write a sanity test to prove the harness works**

`apps/web/src/test/sanity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('vitest harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Run + verify**

```bash
pnpm --dir apps/web test
```

Expected: 1 test passes.

- [ ] **Step 8: Delete the sanity test**

```bash
rm apps/web/src/test/sanity.test.ts
```

- [ ] **Step 9: Update root test runner reference**

The root `pnpm test` script already runs `pnpm --recursive --workspace-concurrency=1 test`. Confirm:

```bash
pnpm test 2>&1 | tail -10
```

Expected: shared + server + web all pass; web shows "0 test files / 0 tests" (since we just deleted the sanity test).

- [ ] **Step 10: Commit**

```bash
git add apps/web/package.json apps/web/vitest.config.ts apps/web/src/test/setup.ts apps/web/tsconfig.json pnpm-lock.yaml
git commit -m "chore(web): add Vitest + React Testing Library harness"
```

---

## Phase 1 — Server Tool Denormalization

Cards need `contact.name` (candidate list) and `briefName` + `contactName` (interview list). Both tools currently return raw FK references. This phase adds joined fields without removing existing fields (additive change, MCP-safe).

### Task 1.1: Denormalize `list_candidates_for_brief`

**Files:**
- Modify: `apps/server/src/db/candidates.ts`
- Modify: `apps/server/src/tools/list-candidates-for-brief.ts`
- Create: `apps/server/src/tools/list-candidates-for-brief.test.ts`

- [ ] **Step 1: Write a failing test for the denormalized return shape**

Create `apps/server/src/tools/list-candidates-for-brief.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';
import { listCandidatesForBriefTool } from './list-candidates-for-brief';

vi.mock('../db/candidates', () => ({
  briefBelongsToOwner: vi.fn(async () => true),
  listCandidatesForBriefWithContact: vi.fn(async () => [
    {
      candidate: {
        id: 'c1',
        briefId: 'b1',
        contactId: 'p1',
        status: 'pending_review',
        source: 'discovery',
        matchScore: 0.87,
        interviewId: null,
        createdAt: new Date('2026-04-20T10:00:00Z'),
        updatedAt: new Date('2026-04-20T10:00:00Z'),
      },
      contact: {
        id: 'p1',
        name: 'Tania Reyes',
        title: 'Senior PM',
        linkedinUrl: 'https://linkedin.com/in/taniareyes',
        companyName: 'Stripe',
      },
    },
  ]),
}));

const cfg: Config = {
  port: 3001, nodeEnv: 'test', webOrigins: [], webOrigin: 'http://localhost:5173',
  supabaseUrl: 'x', supabaseAnonKey: 'x', geminiApiKey: 'x', exaApiKey: 'x',
  openaiApiKey: 'x', elevenlabsApiKey: 'x', elevenlabsVoiceId: 'x', elevenlabsWebhookSecret: 'x',
};

describe('listCandidatesForBriefTool', () => {
  it('returns candidates with embedded contact summary', async () => {
    const ctx = { userId: 'u1', supabase: {} as SupabaseClient, config: cfg };
    const result = await listCandidatesForBriefTool.execute({ briefId: 'b1' }, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].candidateId).toBe('c1');
    expect(result[0].contact).toEqual({
      id: 'p1',
      name: 'Tania Reyes',
      title: 'Senior PM',
      linkedinUrl: 'https://linkedin.com/in/taniareyes',
      companyName: 'Stripe',
    });
  });

  it('returns [] when caller does not own the brief', async () => {
    const { briefBelongsToOwner } = await import('../db/candidates');
    vi.mocked(briefBelongsToOwner).mockResolvedValueOnce(false);
    const ctx = { userId: 'u1', supabase: {} as SupabaseClient, config: cfg };
    const result = await listCandidatesForBriefTool.execute({ briefId: 'b1' }, ctx);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test, see fail**

```bash
pnpm --dir apps/server test list-candidates-for-brief
```

Expected: FAIL — `listCandidatesForBriefWithContact` is not exported from `../db/candidates`.

- [ ] **Step 3: Add the join helper to `apps/server/src/db/candidates.ts`**

Append after the existing `listCandidatesForBrief` function:

```ts
import type { ContactSummary } from '@mirrars/shared';

type CandidateWithContactRow = CandidateRow & {
  contact: {
    id: string;
    name: string;
    title: string | null;
    linkedin_url: string | null;
    company_name: string | null;
  } | null;
};

export async function listCandidatesForBriefWithContact(
  client: SupabaseClient,
  briefId: string,
  limit: number,
): Promise<Array<{ candidate: BriefCandidate; contact: ContactSummary }>> {
  const { data, error } = await client
    .from('brief_candidates')
    .select(
      `${COLS}, contact:contacts(id, name, title, linkedin_url, company_name)`,
    )
    .eq('brief_id', briefId)
    .order('match_score', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new AppError('upstream', `Failed to list candidates: ${error.message}`);

  return ((data ?? []) as CandidateWithContactRow[])
    .filter((row) => row.contact !== null)
    .map((row) => ({
      candidate: rowToCandidate(row),
      contact: {
        id: row.contact!.id,
        name: row.contact!.name,
        title: row.contact!.title,
        linkedinUrl: row.contact!.linkedin_url,
        companyName: row.contact!.company_name,
      },
    }));
}
```

- [ ] **Step 4: Update the tool to consume the new helper**

Replace the body of `apps/server/src/tools/list-candidates-for-brief.ts` `execute`:

```ts
import { z } from 'zod';
import {
  briefBelongsToOwner,
  listCandidatesForBriefWithContact,
} from '../db/candidates';
import type { Tool } from './types';

const inputSchema = z.object({
  briefId: z.string().uuid(),
  limit: z.number().int().positive().max(100).optional(),
});

export const listCandidatesForBriefTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'list_candidates_for_brief',
  description:
    'List candidates for a brief, with embedded contact summary (name/title/company). Each has `status` (discovered/pending_review/approved/contacted/scheduled/interviewed/rejected). Use `approve_candidate` / `reject_candidate` to advance.',
  inputSchema,
  async execute(args, ctx) {
    const owns = await briefBelongsToOwner(ctx.supabase, args.briefId, ctx.userId);
    if (!owns) return [];
    const rows = await listCandidatesForBriefWithContact(
      ctx.supabase,
      args.briefId,
      args.limit ?? 20,
    );
    return rows.map(({ candidate: c, contact }) => ({
      candidateId: c.id,
      briefId: c.briefId,
      contactId: c.contactId,
      status: c.status,
      source: c.source,
      matchScore: c.matchScore,
      interviewId: c.interviewId,
      createdAt: c.createdAt.toISOString(),
      contact,
    }));
  },
};
```

- [ ] **Step 5: Run test, see pass**

```bash
pnpm --dir apps/server test list-candidates-for-brief
```

Expected: 2 tests pass.

- [ ] **Step 6: Run full server suite**

```bash
pnpm --dir apps/server test
```

Expected: all tests pass (including the new ones).

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/db/candidates.ts apps/server/src/tools/list-candidates-for-brief.ts apps/server/src/tools/list-candidates-for-brief.test.ts
git commit -m "feat(server): denormalize list_candidates_for_brief with contact summary"
```

### Task 1.2: Denormalize `list_interviews`

**Files:**
- Modify: `apps/server/src/db/interviews.ts`
- Modify: `apps/server/src/tools/list-interviews.ts`
- Create: `apps/server/src/tools/list-interviews.test.ts`

- [ ] **Step 1: Write a failing test**

Create `apps/server/src/tools/list-interviews.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';
import { listInterviewsTool } from './list-interviews';

vi.mock('../db/interviews', () => ({
  listInterviewsByOwner: vi.fn(async () => [
    {
      interviewId: 'i1',
      briefId: 'b1',
      briefName: 'OpenAI Platform',
      contactName: 'Tania Reyes',
      status: 'completed',
      durationSecs: 512,
      overallSentiment: 'positive',
      completedAt: new Date('2026-04-23T14:00:00Z'),
    },
  ]),
}));

const cfg: Config = {
  port: 3001, nodeEnv: 'test', webOrigins: [], webOrigin: 'http://localhost:5173',
  supabaseUrl: 'x', supabaseAnonKey: 'x', geminiApiKey: 'x', exaApiKey: 'x',
  openaiApiKey: 'x', elevenlabsApiKey: 'x', elevenlabsVoiceId: 'x', elevenlabsWebhookSecret: 'x',
};

describe('listInterviewsTool', () => {
  it('returns interviews with briefName + contactName', async () => {
    const ctx = { userId: 'u1', supabase: {} as SupabaseClient, config: cfg };
    const result = await listInterviewsTool.execute({}, ctx);
    expect(result).toHaveLength(1);
    expect(result[0].briefName).toBe('OpenAI Platform');
    expect(result[0].contactName).toBe('Tania Reyes');
    expect(result[0].overallSentiment).toBe('positive');
  });

  it('serializes completedAt to ISO string', async () => {
    const ctx = { userId: 'u1', supabase: {} as SupabaseClient, config: cfg };
    const result = await listInterviewsTool.execute({}, ctx);
    expect(typeof result[0].completedAt).toBe('string');
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
pnpm --dir apps/server test list-interviews
```

Expected: FAIL — `briefName`/`contactName` not present on returned shape.

- [ ] **Step 3: Update `listInterviewsByOwner` in `apps/server/src/db/interviews.ts`**

Find the existing `listInterviewsByOwner` function. Update the SELECT and the return shape to include brief name + contact name (resolved through the `brief_candidates → contacts` chain):

```ts
type InterviewListRow = {
  id: string;
  brief_id: string | null;
  status: 'completed' | 'failed';
  duration_secs: number | null;
  analysis: { overallSentiment?: 'positive' | 'neutral' | 'negative' } | null;
  completed_at: string | null;
  briefs: { research_context: { product?: { name?: string } } | null } | null;
  brief_candidate: { contact: { name: string } | null } | null;
};

export type InterviewSummaryWithNames = InterviewSummary & {
  briefName: string | null;
  contactName: string | null;
};

export async function listInterviewsByOwner(
  client: SupabaseClient,
  ownerId: string,
  briefId: string | undefined,
  limit: number,
): Promise<InterviewSummaryWithNames[]> {
  let query = client
    .from('interviews')
    .select(
      `id, brief_id, status, duration_secs, analysis, completed_at,
       briefs!inner(owner_id, research_context),
       brief_candidate:brief_candidates!interview_id(contact:contacts(name))`,
    )
    .eq('briefs.owner_id', ownerId);

  if (briefId) query = query.eq('brief_id', briefId);

  const { data, error } = await query
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw new AppError('upstream', `Failed to list interviews: ${error.message}`);

  return ((data ?? []) as InterviewListRow[]).map((row) => ({
    interviewId: row.id,
    briefId: row.brief_id,
    briefName: row.briefs?.research_context?.product?.name ?? null,
    contactName: row.brief_candidate?.contact?.name ?? null,
    status: row.status,
    durationSecs: row.duration_secs,
    overallSentiment: row.analysis?.overallSentiment ?? null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  }));
}
```

If TypeScript complains about the `briefs` SELECT containing `owner_id`, leave the inner-join unchanged but extend the row type accordingly.

- [ ] **Step 4: Update `apps/server/src/tools/list-interviews.ts`**

Open the file. The tool already calls `listInterviewsByOwner` and serializes. Add `briefName` and `contactName` to the returned wire object. Replace the `.map((iv) => ({ ... }))` block with:

```ts
return rows.map((iv) => ({
  interviewId: iv.interviewId,
  briefId: iv.briefId,
  briefName: iv.briefName,
  contactName: iv.contactName,
  status: iv.status,
  durationSecs: iv.durationSecs,
  overallSentiment: iv.overallSentiment,
  completedAt: iv.completedAt ? iv.completedAt.toISOString() : null,
}));
```

Also update the tool's `description` string to mention `briefName` + `contactName`.

- [ ] **Step 5: Run test, see pass**

```bash
pnpm --dir apps/server test list-interviews
```

Expected: 2 tests pass.

- [ ] **Step 6: Run full server suite + typecheck**

```bash
pnpm --dir apps/server test && pnpm --dir apps/server typecheck
```

Expected: all green. If typecheck flags the SELECT typing in `interviews.ts`, narrow the row type explicitly with `as InterviewListRow[]` after the `.select()`.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/db/interviews.ts apps/server/src/tools/list-interviews.ts apps/server/src/tools/list-interviews.test.ts
git commit -m "feat(server): denormalize list_interviews with briefName + contactName"
```

---

## Phase 2 — Shared Primitives + Format Helpers

Build the leaf components first. Each is independently testable. Co-locate `*.test.tsx` next to the source per CLAUDE.md §15.

### Task 2.1: `format-source.ts`

**Files:**
- Create: `apps/web/src/components/agent-cards/format-source.ts`
- Create: `apps/web/src/components/agent-cards/format-source.test.ts`

- [ ] **Step 1: Failing test**

`apps/web/src/components/agent-cards/format-source.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatSource } from './format-source';

describe('formatSource', () => {
  it('discovery + linkedin → "from LinkedIn"', () => {
    expect(formatSource({ source: 'discovery' }, { linkedinUrl: 'https://linkedin.com/in/x' })).toBe('from LinkedIn');
  });
  it('discovery + no linkedin → "from web search"', () => {
    expect(formatSource({ source: 'discovery' }, { linkedinUrl: null })).toBe('from web search');
  });
  it('manual → "added manually"', () => {
    expect(formatSource({ source: 'manual' }, { linkedinUrl: null })).toBe('added manually');
  });
  it('import → "imported"', () => {
    expect(formatSource({ source: 'import' }, { linkedinUrl: null })).toBe('imported');
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
pnpm --dir apps/web test format-source
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`apps/web/src/components/agent-cards/format-source.ts`:

```ts
import type { BriefCandidate, ContactSummary } from '@mirrars/shared';

export function formatSource(
  candidate: Pick<BriefCandidate, 'source'>,
  contact: Pick<ContactSummary, 'linkedinUrl'>,
): string {
  if (candidate.source === 'manual') return 'added manually';
  if (candidate.source === 'import') return 'imported';
  return contact.linkedinUrl ? 'from LinkedIn' : 'from web search';
}
```

- [ ] **Step 4: Run, see pass**

```bash
pnpm --dir apps/web test format-source
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/agent-cards/format-source.ts apps/web/src/components/agent-cards/format-source.test.ts
git commit -m "feat(web): add formatSource helper"
```

### Task 2.2: `format-relative-time.ts`

**Files:**
- Create: `apps/web/src/components/agent-cards/format-relative-time.ts`
- Create: `apps/web/src/components/agent-cards/format-relative-time.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime } from './format-relative-time';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('< 1 minute → "just now"', () => {
    expect(formatRelativeTime(new Date('2026-04-27T11:59:30Z'))).toBe('just now');
  });
  it('minutes', () => {
    expect(formatRelativeTime(new Date('2026-04-27T11:55:00Z'))).toBe('5 minutes ago');
  });
  it('singular minute', () => {
    expect(formatRelativeTime(new Date('2026-04-27T11:59:00Z'))).toBe('1 minute ago');
  });
  it('hours', () => {
    expect(formatRelativeTime(new Date('2026-04-27T08:00:00Z'))).toBe('4 hours ago');
  });
  it('days', () => {
    expect(formatRelativeTime(new Date('2026-04-25T12:00:00Z'))).toBe('2 days ago');
  });
  it('weeks', () => {
    expect(formatRelativeTime(new Date('2026-04-13T12:00:00Z'))).toBe('2 weeks ago');
  });
  it('months', () => {
    expect(formatRelativeTime(new Date('2026-01-27T12:00:00Z'))).toBe('3 months ago');
  });
  it('null returns empty string', () => {
    expect(formatRelativeTime(null)).toBe('');
  });
  it('accepts ISO string input', () => {
    expect(formatRelativeTime('2026-04-27T11:55:00Z')).toBe('5 minutes ago');
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
pnpm --dir apps/web test format-relative-time
```

- [ ] **Step 3: Implement**

`apps/web/src/components/agent-cards/format-relative-time.ts`:

```ts
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

export function formatRelativeTime(input: Date | string | null | undefined): string {
  if (!input) return '';
  const then = typeof input === 'string' ? new Date(input).getTime() : input.getTime();
  const diff = Date.now() - then;
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) {
    const n = Math.floor(diff / MINUTE);
    return `${n} minute${n === 1 ? '' : 's'} ago`;
  }
  if (diff < DAY) {
    const n = Math.floor(diff / HOUR);
    return `${n} hour${n === 1 ? '' : 's'} ago`;
  }
  if (diff < WEEK) {
    const n = Math.floor(diff / DAY);
    return `${n} day${n === 1 ? '' : 's'} ago`;
  }
  if (diff < MONTH) {
    const n = Math.floor(diff / WEEK);
    return `${n} week${n === 1 ? '' : 's'} ago`;
  }
  const n = Math.floor(diff / MONTH);
  return `${n} month${n === 1 ? '' : 's'} ago`;
}
```

- [ ] **Step 4: Run, see pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/agent-cards/format-relative-time.ts apps/web/src/components/agent-cards/format-relative-time.test.ts
git commit -m "feat(web): add formatRelativeTime helper"
```

### Task 2.3: `StatusPill`

**Files:**
- Create: `apps/web/src/components/agent-cards/StatusPill.tsx`
- Create: `apps/web/src/components/agent-cards/StatusPill.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it('renders label uppercased', () => {
    const { getByText } = render(<StatusPill kind="candidate" value="pending_review" />);
    expect(getByText('PENDING REVIEW')).toBeInTheDocument();
  });

  it('uses amber tone for pending_review', () => {
    const { container } = render(<StatusPill kind="candidate" value="pending_review" />);
    expect(container.firstChild).toHaveClass('text-amber-700');
  });

  it('uses emerald for approved', () => {
    const { container } = render(<StatusPill kind="candidate" value="approved" />);
    expect(container.firstChild).toHaveClass('text-emerald-700');
  });

  it('uses red for rejected', () => {
    const { container } = render(<StatusPill kind="candidate" value="rejected" />);
    expect(container.firstChild).toHaveClass('text-destructive');
  });

  it('uses muted for archived brief', () => {
    const { container } = render(<StatusPill kind="brief" value="archived" />);
    expect(container.firstChild).toHaveClass('text-muted-foreground');
  });
});
```

- [ ] **Step 2: Run, see fail**

- [ ] **Step 3: Implement**

`apps/web/src/components/agent-cards/StatusPill.tsx`:

```tsx
type Kind = 'brief' | 'candidate' | 'interview';

type Color = 'amber' | 'emerald' | 'muted' | 'red';

const COLOR_CLASS: Record<Color, string> = {
  amber: 'text-amber-700 border-amber-700/40',
  emerald: 'text-emerald-700 border-emerald-700/40',
  muted: 'text-muted-foreground border-border',
  red: 'text-destructive border-destructive/40',
};

function pillColor(kind: Kind, value: string): Color {
  if (kind === 'brief') {
    if (value === 'draft') return 'amber';
    if (value === 'active') return 'emerald';
    return 'muted';
  }
  if (kind === 'candidate') {
    if (value === 'pending_review' || value === 'discovered' || value === 'scheduled') return 'amber';
    if (value === 'approved' || value === 'contacted') return 'emerald';
    if (value === 'rejected') return 'red';
    return 'muted';
  }
  // interview
  if (value === 'failed') return 'red';
  if (value === 'completed') return 'emerald';
  return 'muted';
}

export function StatusPill({ kind, value }: { kind: Kind; value: string }) {
  const color = pillColor(kind, value);
  const label = value.replace(/_/g, ' ').toUpperCase();
  return (
    <span
      className={`inline-flex items-center font-mono text-[10px] tracking-[0.15em] uppercase border rounded-full px-2 py-0.5 ${COLOR_CLASS[color]}`}
    >
      {label}
    </span>
  );
}
```

- [ ] **Step 4: Run, see pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/agent-cards/StatusPill.tsx apps/web/src/components/agent-cards/StatusPill.test.tsx
git commit -m "feat(web): add StatusPill primitive"
```

### Task 2.4: `SentimentPill`

**Files:**
- Create: `apps/web/src/components/agent-cards/SentimentPill.tsx`
- Create: `apps/web/src/components/agent-cards/SentimentPill.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SentimentPill } from './SentimentPill';

describe('SentimentPill', () => {
  it('positive → emerald + label', () => {
    const { container, getByText } = render(<SentimentPill value="positive" />);
    expect(getByText('POSITIVE')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('text-emerald-700');
  });
  it('neutral → muted', () => {
    const { container } = render(<SentimentPill value="neutral" />);
    expect(container.firstChild).toHaveClass('text-muted-foreground');
  });
  it('negative → red', () => {
    const { container } = render(<SentimentPill value="negative" />);
    expect(container.firstChild).toHaveClass('text-destructive');
  });
});
```

- [ ] **Step 2: Run, see fail**

- [ ] **Step 3: Implement**

`apps/web/src/components/agent-cards/SentimentPill.tsx`:

```tsx
type Sentiment = 'positive' | 'neutral' | 'negative';

const COLOR: Record<Sentiment, string> = {
  positive: 'text-emerald-700 border-emerald-700/40',
  neutral: 'text-muted-foreground border-border',
  negative: 'text-destructive border-destructive/40',
};

export function SentimentPill({ value }: { value: Sentiment }) {
  return (
    <span
      className={`inline-flex items-center font-mono text-[10px] tracking-[0.15em] uppercase border rounded-full px-2 py-0.5 ${COLOR[value]}`}
    >
      {value.toUpperCase()}
    </span>
  );
}
```

- [ ] **Step 4: Run, see pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/agent-cards/SentimentPill.tsx apps/web/src/components/agent-cards/SentimentPill.test.tsx
git commit -m "feat(web): add SentimentPill primitive"
```

### Task 2.5: `ActionPill`

**Files:**
- Create: `apps/web/src/components/agent-cards/ActionPill.tsx`
- Create: `apps/web/src/components/agent-cards/ActionPill.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActionPill } from './ActionPill';

describe('ActionPill', () => {
  it('prompt mode: click invokes onPromptSelect with text', async () => {
    const onPromptSelect = vi.fn();
    const { getByRole } = render(
      <ActionPill prompt="Approve Tania" onPromptSelect={onPromptSelect}>Approve</ActionPill>,
    );
    await userEvent.click(getByRole('button'));
    expect(onPromptSelect).toHaveBeenCalledWith('Approve Tania');
  });

  it('href mode: renders an anchor with target="_blank"', () => {
    const { getByRole } = render(
      <ActionPill href="https://linkedin.com/in/x" onPromptSelect={() => {}}>Open LinkedIn</ActionPill>,
    );
    const link = getByRole('link');
    expect(link).toHaveAttribute('href', 'https://linkedin.com/in/x');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('mailto mode: renders an anchor with mailto:', () => {
    const { getByRole } = render(
      <ActionPill mailto="x@y.com" onPromptSelect={() => {}}>Email</ActionPill>,
    );
    expect(getByRole('link')).toHaveAttribute('href', 'mailto:x@y.com');
  });

  it('solid variant adds bg-foreground class', () => {
    const { getByRole } = render(
      <ActionPill prompt="x" onPromptSelect={() => {}} variant="solid">Go</ActionPill>,
    );
    expect(getByRole('button')).toHaveClass('bg-foreground');
  });

  it('danger variant adds destructive border', () => {
    const { getByRole } = render(
      <ActionPill prompt="x" onPromptSelect={() => {}} variant="danger">Reject</ActionPill>,
    );
    expect(getByRole('button')).toHaveClass('text-destructive');
  });
});
```

- [ ] **Step 2: Run, see fail**

- [ ] **Step 3: Implement**

`apps/web/src/components/agent-cards/ActionPill.tsx`:

```tsx
import type { ReactNode } from 'react';

type Variant = 'outline' | 'solid' | 'danger';

type Common = {
  children: ReactNode;
  variant?: Variant;
  onPromptSelect: (text: string) => void;
};

type PromptProps = Common & { prompt: string; href?: never; mailto?: never };
type HrefProps = Common & { href: string; prompt?: never; mailto?: never };
type MailtoProps = Common & { mailto: string; prompt?: never; href?: never };

type Props = PromptProps | HrefProps | MailtoProps;

const BASE =
  'inline-flex items-center justify-center rounded-full px-4 py-2 font-mono text-[10px] tracking-[0.2em] uppercase border transition-colors';

const VARIANT: Record<Variant, string> = {
  outline: 'border-foreground/40 text-foreground hover:bg-foreground/5',
  solid: 'border-foreground bg-foreground text-background hover:bg-accent',
  danger: 'border-destructive/50 text-destructive hover:bg-destructive/5',
};

export function ActionPill(props: Props) {
  const { children, variant = 'outline' } = props;
  const cls = `${BASE} ${VARIANT[variant]}`;

  if ('href' in props && props.href) {
    return (
      <a className={cls} href={props.href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  if ('mailto' in props && props.mailto) {
    return (
      <a className={cls} href={`mailto:${props.mailto}`}>
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      onClick={() => props.onPromptSelect((props as PromptProps).prompt)}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 4: Run, see pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/agent-cards/ActionPill.tsx apps/web/src/components/agent-cards/ActionPill.test.tsx
git commit -m "feat(web): add ActionPill primitive"
```

### Task 2.6: `Panel`

**Files:**
- Create: `apps/web/src/components/agent-cards/Panel.tsx`
- Create: `apps/web/src/components/agent-cards/Panel.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Panel } from './Panel';

describe('Panel', () => {
  it('renders kicker, title, subtitle, body, actions', () => {
    const { getByText } = render(
      <Panel
        kicker="BRIEF"
        title="OpenAI Platform"
        subtitle="OpenAI · Developer tools"
        actions={<button type="button">Find candidates</button>}
      >
        <p>Body content here</p>
      </Panel>,
    );
    expect(getByText('BRIEF')).toBeInTheDocument();
    expect(getByText('OpenAI Platform')).toBeInTheDocument();
    expect(getByText('OpenAI · Developer tools')).toBeInTheDocument();
    expect(getByText('Body content here')).toBeInTheDocument();
    expect(getByText('Find candidates')).toBeInTheDocument();
  });

  it('omits optional slots cleanly', () => {
    const { container, queryByText } = render(<Panel kicker="X" title="Y">body</Panel>);
    expect(queryByText('—')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="actions"]')).toBeNull();
  });

  it('supports a click handler on the panel root (for clickable list cards)', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const onClick = (await import('vitest')).vi.fn();
    const { getByRole } = render(
      <Panel kicker="X" title="Y" onClick={onClick} role="button">body</Panel>,
    );
    await userEvent.click(getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, see fail**

- [ ] **Step 3: Implement**

`apps/web/src/components/agent-cards/Panel.tsx`:

```tsx
import type { ReactNode, MouseEventHandler } from 'react';

type Props = {
  kicker: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onClick?: MouseEventHandler<HTMLDivElement>;
  role?: string;
  variant?: 'default' | 'tight' | 'error' | 'empty';
};

const VARIANT_BG: Record<NonNullable<Props['variant']>, string> = {
  default: 'border-border/60 bg-card',
  tight: 'border-border/60 bg-card',
  error: 'border-destructive/40 bg-destructive/5',
  empty: 'border-dashed border-border bg-transparent',
};

const VARIANT_PADDING: Record<NonNullable<Props['variant']>, string> = {
  default: 'p-6',
  tight: 'p-4',
  error: 'p-4',
  empty: 'p-6 text-center',
};

export function Panel({
  kicker,
  title,
  subtitle,
  children,
  actions,
  onClick,
  role,
  variant = 'default',
}: Props) {
  const interactive = onClick !== undefined;
  return (
    <div
      role={role}
      onClick={onClick}
      tabIndex={interactive ? 0 : undefined}
      className={`border ${VARIANT_BG[variant]} ${VARIANT_PADDING[variant]} ${
        interactive ? 'cursor-pointer transition-colors hover:border-foreground/40' : ''
      }`}
    >
      <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
        {kicker}
      </div>
      <h2
        className="font-serif text-2xl mt-1 leading-tight tracking-tight"
        style={{ fontVariationSettings: "'opsz' 36" }}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="font-serif italic text-muted-foreground text-base mt-1">{subtitle}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
      {actions && (
        <div
          data-slot="actions"
          className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border/60"
        >
          {actions}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run, see pass**

- [ ] **Step 5: Run typecheck + lint to confirm primitives compile**

```bash
pnpm --dir apps/web typecheck && pnpm --dir apps/web lint
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/agent-cards/Panel.tsx apps/web/src/components/agent-cards/Panel.test.tsx
git commit -m "feat(web): add Panel primitive"
```

---

## Phase 3 — Brief End-to-End + AgentChat Wiring

This phase proves the registry pattern. By the end, asking the agent for `list_briefs` or `get_brief` renders cards instead of markdown.

### Task 3.1: Registry scaffolding (`types.ts`, `registry.tsx`, `index.ts`)

**Files:**
- Create: `apps/web/src/components/agent-cards/types.ts`
- Create: `apps/web/src/components/agent-cards/registry.tsx`
- Create: `apps/web/src/components/agent-cards/index.ts`

No tests here yet — registry contents are exercised by per-tool tests in later tasks. The structural test happens in Task 3.4 (AgentChat dispatch).

- [ ] **Step 1: Create `types.ts`**

```ts
import type { ReactNode } from 'react';
import type { ChatToolCall } from '@/lib/api';

export type CardRendererProps = {
  result: unknown;
  error: string | null;
  onPromptSelect: (text: string) => void;
};

export type CardRenderer = (props: CardRendererProps) => ReactNode;

export type ToolCall = ChatToolCall;
```

- [ ] **Step 2: Create `registry.tsx` (initially empty map + placeholder dispatch)**

```tsx
import type { ReactNode } from 'react';
import type { CardRenderer, ToolCall } from './types';
import { ErrorPanel } from './ErrorPanel';

const registry: Record<string, CardRenderer> = {
  // populated by later tasks
};

export function dispatchToolCall(
  call: ToolCall,
  onPromptSelect: (text: string) => void,
): ReactNode {
  if (call.error) {
    return (
      <ErrorPanel
        toolName={call.name}
        error={call.error}
        onPromptSelect={onPromptSelect}
      />
    );
  }
  const renderer = registry[call.name];
  if (!renderer) return null;
  return renderer({ result: call.result, error: null, onPromptSelect });
}

export function registerRenderer(name: string, renderer: CardRenderer): void {
  registry[name] = renderer;
}
```

- [ ] **Step 3: Create a placeholder `ErrorPanel` (real impl in Task 5.4)**

`apps/web/src/components/agent-cards/ErrorPanel.tsx`:

```tsx
import { Panel } from './Panel';
import { ActionPill } from './ActionPill';

type Props = {
  toolName: string;
  error: string;
  onPromptSelect: (text: string) => void;
};

export function ErrorPanel({ toolName, error, onPromptSelect }: Props) {
  const message = error.length > 280 ? `${error.slice(0, 280)}…` : error;
  return (
    <Panel
      kicker={`⚠ ERROR · ${toolName.replace(/_/g, ' ').toUpperCase()}`}
      title="Something went wrong"
      variant="error"
      actions={
        <ActionPill prompt="List briefs" onPromptSelect={onPromptSelect}>
          List briefs
        </ActionPill>
      }
    >
      <p className="font-serif text-base text-foreground">{message}</p>
    </Panel>
  );
}
```

(We'll improve recovery-pill selection in Task 5.4. For now this is the minimum needed by `dispatchToolCall`.)

- [ ] **Step 4: Create `index.ts` barrel**

```ts
export { dispatchToolCall, registerRenderer } from './registry';
export type { CardRenderer, CardRendererProps, ToolCall } from './types';
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --dir apps/web typecheck
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/agent-cards/types.ts apps/web/src/components/agent-cards/registry.tsx apps/web/src/components/agent-cards/index.ts apps/web/src/components/agent-cards/ErrorPanel.tsx
git commit -m "feat(web): scaffold agent-cards registry + types"
```

### Task 3.2: `BriefDetail`

**Files:**
- Create: `apps/web/src/components/agent-cards/BriefDetail.tsx`
- Create: `apps/web/src/components/agent-cards/BriefDetail.test.tsx`

- [ ] **Step 1: Build a fixture helper for brief shape**

The `get_brief` tool returns the `Brief` shape (`@mirrars/shared`). For tests, define a fixture in the test file (no shared fixtures package yet).

- [ ] **Step 2: Failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BriefDetail } from './BriefDetail';

const fixture = {
  id: 'b1',
  ownerId: 'u1',
  status: 'active' as const,
  researchContext: {
    company: { name: 'OpenAI', industry: 'Developer tools', description: 'AI infra' },
    product: {
      name: 'OpenAI Platform',
      description: 'API, Assistants, fine-tuning',
      keyFeatures: ['ChatGPT', 'API', 'Assistants'],
      targetAudience: 'PMs and engineers shipping LLM features',
    },
    research: {
      objective: 'Understand user satisfaction and validate demand for new features.',
      questions: [
        { id: 'q1', text: 'Role + product context?', followUp: 'Tenure?', category: 'background' as const },
        { id: 'q2', text: 'Walk me through your last integration.', followUp: '', category: 'usage' as const },
      ],
      concerns: ['scope creep'],
      productMarketFit: { hypothesis: 'PMs need better tracing', signals: ['willing to pay'] },
    },
    interviewSettings: { maxDurationMinutes: 8, tone: 'friendly-professional', language: 'en' },
  },
  createdAt: new Date('2026-04-25T10:00:00Z'),
  updatedAt: new Date('2026-04-25T10:00:00Z'),
};

describe('BriefDetail', () => {
  it('renders product name as title', () => {
    const { getByText } = render(
      <BriefDetail result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText('OpenAI Platform')).toBeInTheDocument();
  });

  it('does not render the brief id', () => {
    const { queryByText } = render(
      <BriefDetail result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(queryByText('b1')).not.toBeInTheDocument();
  });

  it('renders objective, target audience, key features, and questions', () => {
    const { getByText } = render(
      <BriefDetail result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText(/Understand user satisfaction/)).toBeInTheDocument();
    expect(getByText(/PMs and engineers/)).toBeInTheDocument();
    expect(getByText('ChatGPT')).toBeInTheDocument();
    expect(getByText(/Walk me through your last integration/)).toBeInTheDocument();
  });

  it('omits hypothesis section when empty', () => {
    const noHypothesis = {
      ...fixture,
      researchContext: {
        ...fixture.researchContext,
        research: { ...fixture.researchContext.research, productMarketFit: { hypothesis: '', signals: [] } },
      },
    };
    const { queryByText } = render(
      <BriefDetail result={noHypothesis} error={null} onPromptSelect={() => {}} />,
    );
    expect(queryByText('HYPOTHESIS')).not.toBeInTheDocument();
  });

  it('Find candidates pill triggers onPromptSelect with brief name', async () => {
    const onPromptSelect = vi.fn();
    const { getByText } = render(
      <BriefDetail result={fixture} error={null} onPromptSelect={onPromptSelect} />,
    );
    await userEvent.click(getByText('Find candidates →'));
    expect(onPromptSelect).toHaveBeenCalledWith('Find candidates for OpenAI Platform');
  });
});
```

- [ ] **Step 3: Run, see fail**

- [ ] **Step 4: Implement**

`apps/web/src/components/agent-cards/BriefDetail.tsx`:

```tsx
import type { Brief } from '@mirrars/shared';
import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import { formatRelativeTime } from './format-relative-time';
import type { CardRendererProps } from './types';

export function BriefDetail({ result, onPromptSelect }: CardRendererProps) {
  const brief = result as Brief;
  const ctx = brief.researchContext;
  const productName = ctx.product.name;
  const subtitle = `${ctx.company.name} · ${ctx.company.industry} · created ${formatRelativeTime(brief.createdAt)}`;
  const hypothesis = ctx.research.productMarketFit?.hypothesis;
  const signals = ctx.research.productMarketFit?.signals ?? [];
  const concerns = ctx.research.concerns ?? [];

  return (
    <Panel
      kicker="BRIEF"
      title={productName}
      subtitle={subtitle}
      actions={
        <>
          <ActionPill
            variant="solid"
            prompt={`Find candidates for ${productName}`}
            onPromptSelect={onPromptSelect}
          >
            Find candidates →
          </ActionPill>
          <ActionPill
            prompt={`List candidates for ${productName}`}
            onPromptSelect={onPromptSelect}
          >
            View candidates
          </ActionPill>
          <ActionPill
            prompt={`List interviews for ${productName}`}
            onPromptSelect={onPromptSelect}
          >
            View interviews
          </ActionPill>
          <ActionPill
            prompt={`Edit brief: ${productName}`}
            onPromptSelect={onPromptSelect}
          >
            Edit brief
          </ActionPill>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="OBJECTIVE" emphasized>{ctx.research.objective}</Field>
        <Field label="TARGET AUDIENCE">{ctx.product.targetAudience}</Field>
        <Field label="PRODUCT">{ctx.product.description}</Field>
        <FieldList label={`KEY FEATURES · ${ctx.product.keyFeatures.length}`} items={ctx.product.keyFeatures} numbered />
        <div>
          <FieldLabel>QUESTIONS · {ctx.research.questions.length}</FieldLabel>
          <ol className="mt-2 space-y-3">
            {ctx.research.questions.map((q, i) => (
              <li key={q.id} className="flex gap-3">
                <span className="font-mono text-xs text-muted-foreground pt-1.5 w-6 shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <p className="font-serif text-base leading-relaxed">{q.text}</p>
                  <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground mt-1">
                    {q.category.replace(/-/g, ' ')}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        {hypothesis && <Field label="HYPOTHESIS">{hypothesis}</Field>}
        {signals.length > 0 && <FieldList label={`PMF SIGNALS · ${signals.length}`} items={signals} />}
        {concerns.length > 0 && <FieldList label={`CONCERNS · ${concerns.length}`} items={concerns} />}
      </div>
    </Panel>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
      {children}
    </div>
  );
}

function Field({
  label,
  children,
  emphasized,
}: {
  label: string;
  children: React.ReactNode;
  emphasized?: boolean;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <p
        className={`mt-1.5 font-serif leading-relaxed ${emphasized ? 'text-lg' : 'text-base'}`}
        style={emphasized ? { fontVariationSettings: "'opsz' 24" } : undefined}
      >
        {children}
      </p>
    </div>
  );
}

function FieldList({
  label,
  items,
  numbered,
}: {
  label: string;
  items: string[];
  numbered?: boolean;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {numbered ? (
        <ol className="mt-2 space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="font-serif text-base leading-relaxed flex gap-3">
              <span className="font-mono text-xs text-muted-foreground pt-1.5 w-6 shrink-0">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      ) : (
        <ul className="mt-2 list-disc pl-6 space-y-1 font-serif text-base leading-relaxed">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run, see pass**

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/agent-cards/BriefDetail.tsx apps/web/src/components/agent-cards/BriefDetail.test.tsx
git commit -m "feat(web): add BriefDetail card"
```

### Task 3.3: `BriefList`

**Files:**
- Create: `apps/web/src/components/agent-cards/BriefList.tsx`
- Create: `apps/web/src/components/agent-cards/BriefList.test.tsx`

The `list_briefs` tool returns objects with shape `{ briefId, name, objective, createdAt, ... }` (ISO strings). Verify the exact shape by reading `apps/server/src/tools/list-briefs.ts` before writing the test fixture.

- [ ] **Step 1: Verify the wire shape of `list_briefs`**

```bash
sed -n '1,80p' apps/server/src/tools/list-briefs.ts
```

Note the field names. The fixture in the test must use those exact names.

- [ ] **Step 2: Failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BriefList } from './BriefList';

const fixture = [
  {
    briefId: 'b1',
    name: 'OpenAI Platform',
    company: 'OpenAI',
    industry: 'Developer tools',
    objective: 'Understand user satisfaction and validate demand for new features.',
    questionCount: 5,
    candidateCount: 2,
    status: 'active' as const,
    createdAt: '2026-04-25T10:00:00Z',
  },
  {
    briefId: 'b2',
    name: 'Mirrars Self-research',
    company: 'Mirrars',
    industry: 'AI / Market Research',
    objective: 'Understand how product teams currently run user research.',
    questionCount: 3,
    candidateCount: 0,
    status: 'draft' as const,
    createdAt: '2026-04-23T10:00:00Z',
  },
];

describe('BriefList', () => {
  it('renders one card per brief, no UUID', () => {
    const { getByText, queryByText } = render(
      <BriefList result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText('OpenAI Platform')).toBeInTheDocument();
    expect(getByText('Mirrars Self-research')).toBeInTheDocument();
    expect(queryByText('b1')).not.toBeInTheDocument();
    expect(queryByText('b2')).not.toBeInTheDocument();
  });

  it('clicking a card sends "Show me brief: <name>"', async () => {
    const onPromptSelect = vi.fn();
    const { getByText } = render(
      <BriefList result={fixture} error={null} onPromptSelect={onPromptSelect} />,
    );
    await userEvent.click(getByText('OpenAI Platform'));
    expect(onPromptSelect).toHaveBeenCalledWith('Show me brief: OpenAI Platform');
  });

  it('renders empty state when result is []', () => {
    const { getByText } = render(
      <BriefList result={[]} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText(/Start your first brief/i)).toBeInTheDocument();
  });
});
```

If `list_briefs` doesn't return `name` / `company` / `industry` fields, the test fixture must mirror what the tool actually returns; adapt the field-access code in `BriefList.tsx` accordingly.

- [ ] **Step 3: Run, see fail**

- [ ] **Step 4: Implement**

`apps/web/src/components/agent-cards/BriefList.tsx`:

```tsx
import { Panel } from './Panel';
import { StatusPill } from './StatusPill';
import { ActionPill } from './ActionPill';
import { formatRelativeTime } from './format-relative-time';
import type { CardRendererProps } from './types';

type BriefListItem = {
  briefId: string;
  name: string;
  company: string;
  industry: string;
  objective: string;
  questionCount: number;
  candidateCount?: number;
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
};

export function BriefList({ result, onPromptSelect }: CardRendererProps) {
  const items = result as BriefListItem[];
  if (items.length === 0) {
    return (
      <Panel
        variant="empty"
        kicker="NOTHING HERE"
        title="Start your first brief"
        subtitle="I'll walk you through company → product → questions in a few turns."
        actions={
          <ActionPill variant="solid" prompt="Create a new brief" onPromptSelect={onPromptSelect}>
            Create brief →
          </ActionPill>
        }
      >
        {null}
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((b, i) => (
        <Panel
          key={b.briefId}
          role="button"
          onClick={() => onPromptSelect(`Show me brief: ${b.name}`)}
          kicker={
            <span className="flex justify-between items-center w-full">
              <span>BRIEF · {String(i + 1).padStart(2, '0')}</span>
              <StatusPill kind="brief" value={b.status} />
            </span>
          }
          title={b.name}
          subtitle={`${b.company} · ${b.industry}`}
          variant="tight"
        >
          <p className="font-serif text-sm text-muted-foreground line-clamp-2">{b.objective}</p>
          <div className="mt-3 pt-2 border-t border-border/40 flex justify-between font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground">
            <span>
              {b.questionCount} questions
              {b.candidateCount ? ` · ${b.candidateCount} candidates` : ''}
            </span>
            <span>{formatRelativeTime(b.createdAt)}</span>
          </div>
        </Panel>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run, see pass**

- [ ] **Step 6: Register both Brief renderers**

Open `apps/web/src/components/agent-cards/registry.tsx`. Add at the top:

```tsx
import { BriefList } from './BriefList';
import { BriefDetail } from './BriefDetail';
```

Replace the empty registry literal with:

```tsx
const registry: Record<string, CardRenderer> = {
  list_briefs: BriefList,
  get_brief: BriefDetail,
  create_brief: BriefDetail,
  update_brief: BriefDetail,
  preview_brief: BriefDetail,
};
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/agent-cards/BriefList.tsx apps/web/src/components/agent-cards/BriefList.test.tsx apps/web/src/components/agent-cards/registry.tsx
git commit -m "feat(web): add BriefList card + register brief renderers"
```

### Task 3.4: Wire `AgentChat` to dispatch through registry

**Files:**
- Modify: `apps/web/src/components/AgentChat.tsx`

- [ ] **Step 1: Drop the tool-chip rendering block in `MessageRow`**

Locate the `MessageRow` function. Remove the `mb-3 space-y-2` block that maps `turn.toolCalls` into `<ToolCallChip>`. Also remove the `ToolCallChip` function entirely (no longer used).

- [ ] **Step 2: Add `onPromptSelect` plumbing**

In `AgentChat`, expose a stable callback:

```tsx
const handlePromptSelect = useCallback(
  (text: string) => {
    if (isThinking) return;
    setInput('');
    void handleSendText(text);
  },
  [isThinking],
);
```

Refactor `handleSend` so its body is callable from a string:

```tsx
const handleSendText = useCallback(
  async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isThinking) return;

    const userTurn: Turn = { role: 'user', content: trimmed };
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setIsThinking(true);
    setError(null);

    try {
      const wireMessages: ChatMessage[] = nextTurns.map((t) => ({
        role: t.role,
        content: t.content,
      }));
      const response = await postChat(wireMessages, mode);
      setTurns((prev) => [
        ...prev,
        { role: 'assistant', content: response.reply, toolCalls: response.toolCalls },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed');
    } finally {
      setIsThinking(false);
    }
  },
  [isThinking, turns, mode],
);

const handleSend = useCallback(async () => {
  await handleSendText(input);
  setInput('');
}, [input, handleSendText]);
```

(The textarea handler remains `() => void handleSend()`.)

- [ ] **Step 3: Pass `onPromptSelect` to `MessageRow`**

Update the call site:

```tsx
{turns.map((t, i) => (
  <MessageRow key={i} turn={t} index={i} onPromptSelect={handlePromptSelect} />
))}
```

- [ ] **Step 4: In `MessageRow`, render registry-dispatched cards after the prose paragraph**

Update `MessageRow`'s signature + body:

```tsx
import { dispatchToolCall } from './agent-cards';

function MessageRow({
  turn,
  index,
  onPromptSelect,
}: {
  turn: Turn;
  index: number;
  onPromptSelect: (text: string) => void;
}) {
  const isAssistant = turn.role === 'assistant';
  const attributionLabel = isAssistant ? 'Researcher' : 'You';
  return (
    <article
      className="slide-in"
      style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
    >
      <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent mb-2">
        {attributionLabel} —{' '}
        <span className="text-muted-foreground">
          № {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      {isAssistant ? (
        <>
          {turn.content && (
            <p
              className="font-serif text-lg leading-relaxed text-foreground whitespace-pre-wrap"
              style={{ fontVariationSettings: "'opsz' 18" }}
            >
              {turn.content}
            </p>
          )}
          {turn.toolCalls && turn.toolCalls.length > 0 && (
            <div className="mt-4 space-y-3">
              {turn.toolCalls.map((tc, i) => (
                <div key={i}>{dispatchToolCall(tc, onPromptSelect)}</div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-base leading-relaxed text-foreground/85 whitespace-pre-wrap pl-4 border-l-2 border-border">
          {turn.content}
        </p>
      )}
    </article>
  );
}
```

Also remove the old `ToolCallChip` function from this file.

- [ ] **Step 5: Update the `Turn` type**

Find the `Turn` type at the top of the file. Make sure it imports `ChatToolCall` from `@/lib/api`:

```tsx
import { postChat, type ChatMessage, type ChatToolCall } from '@/lib/api';

type Turn = {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ChatToolCall[];
};
```

(Already present from earlier work. Just verify.)

- [ ] **Step 6: Typecheck + lint**

```bash
pnpm --dir apps/web typecheck && pnpm --dir apps/web lint
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/AgentChat.tsx
git commit -m "feat(web): wire AgentChat to dispatch tool calls through registry"
```

---

## Phase 4 — Other Entities

### Task 4.1: `CandidateDetail`

**Files:**
- Create: `apps/web/src/components/agent-cards/CandidateDetail.tsx`
- Create: `apps/web/src/components/agent-cards/CandidateDetail.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CandidateDetail } from './CandidateDetail';

const baseFixture = {
  candidateId: 'c1',
  briefId: 'b1',
  briefName: 'OpenAI Platform',
  contactId: 'p1',
  status: 'pending_review' as const,
  source: 'discovery' as const,
  matchScore: 0.87,
  interviewId: null as string | null,
  createdAt: '2026-04-25T10:00:00Z',
  contact: {
    id: 'p1',
    name: 'Tania Reyes',
    title: 'Senior PM',
    companyName: 'Stripe',
    email: 'tania.reyes@stripe.com',
    location: 'San Francisco, CA',
    linkedinUrl: 'https://linkedin.com/in/taniareyes',
    researchNotes: 'Led Stripe LLM-fraud detection rollout.',
  },
};

describe('CandidateDetail', () => {
  it('renders contact name as title and role/company subtitle', () => {
    const { getByText } = render(
      <CandidateDetail result={baseFixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText('Tania Reyes')).toBeInTheDocument();
    expect(getByText(/Senior PM at Stripe/)).toBeInTheDocument();
  });

  it('renders match score as percent', () => {
    const { getByText } = render(
      <CandidateDetail result={baseFixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText('87%')).toBeInTheDocument();
  });

  it('shows Approve and Reject pills for pending_review status', () => {
    const { getByText } = render(
      <CandidateDetail result={baseFixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText('Approve')).toBeInTheDocument();
    expect(getByText('Reject')).toBeInTheDocument();
  });

  it('shows Open interview pill for interviewed status when interviewId present', () => {
    const interviewed = { ...baseFixture, status: 'interviewed' as const, interviewId: 'i1' };
    const { getByText } = render(
      <CandidateDetail result={interviewed} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText(/Open interview/)).toBeInTheDocument();
  });

  it('Approve pill triggers natural-language prompt', async () => {
    const onPromptSelect = vi.fn();
    const { getByText } = render(
      <CandidateDetail result={baseFixture} error={null} onPromptSelect={onPromptSelect} />,
    );
    await userEvent.click(getByText('Approve'));
    expect(onPromptSelect).toHaveBeenCalledWith('Approve Tania Reyes');
  });

  it('does not render the candidate UUID', () => {
    const { queryByText } = render(
      <CandidateDetail result={baseFixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(queryByText('c1')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, see fail**

- [ ] **Step 3: Implement**

`apps/web/src/components/agent-cards/CandidateDetail.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { BriefCandidate, ContactSummary } from '@mirrars/shared';
import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import { StatusPill } from './StatusPill';
import { formatSource } from './format-source';
import { formatRelativeTime } from './format-relative-time';
import type { CardRendererProps } from './types';

type CandidateDetailResult = Omit<BriefCandidate, 'createdAt' | 'updatedAt'> & {
  briefName: string | null;
  createdAt: string;
  contact: ContactSummary & {
    email: string | null;
    location: string | null;
    researchNotes: string | null;
  };
};

export function CandidateDetail({ result, onPromptSelect }: CardRendererProps) {
  const c = result as CandidateDetailResult;
  const name = c.contact.name;
  const briefHint = c.briefName ?? 'a brief';
  const matchPct = c.matchScore != null ? `${Math.round(c.matchScore * 100)}%` : '—';

  const subtitleParts = [
    c.contact.title && c.contact.companyName
      ? `${c.contact.title} at ${c.contact.companyName}`
      : c.contact.title ?? c.contact.companyName ?? '',
    c.contact.location,
  ].filter(Boolean);

  return (
    <Panel
      kicker={`CANDIDATE · FOR ${briefHint.toUpperCase()}`}
      title={name}
      subtitle={subtitleParts.join(' · ')}
      actions={renderActions(c, onPromptSelect)}
    >
      <FieldGrid
        items={[
          ['STATUS', <StatusPill kind="candidate" value={c.status} />],
          ['MATCH SCORE', matchPct],
          ['SOURCE', formatSource(c, c.contact)],
          ['DISCOVERED', formatRelativeTime(c.createdAt)],
        ]}
      />
      {c.contact.researchNotes && (
        <Field label="RESEARCH NOTES">{c.contact.researchNotes}</Field>
      )}
      <Field label="CONTACT">
        {[c.contact.email, c.contact.linkedinUrl ? linkedinSlug(c.contact.linkedinUrl) : null]
          .filter(Boolean)
          .join(' · ')}
      </Field>
    </Panel>
  );
}

function linkedinSlug(url: string): string {
  const match = url.match(/in\/([^/?]+)/);
  return match ? `/in/${match[1]}` : url;
}

function renderActions(
  c: CandidateDetailResult,
  onPromptSelect: (text: string) => void,
): ReactNode {
  const name = c.contact.name;
  const briefHint = c.briefName ?? 'this brief';
  const always = (
    <>
      <ActionPill prompt={`Show me contact: ${name}`} onPromptSelect={onPromptSelect}>
        View contact
      </ActionPill>
      <ActionPill prompt={`Show me brief: ${briefHint}`} onPromptSelect={onPromptSelect}>
        View brief
      </ActionPill>
    </>
  );
  switch (c.status) {
    case 'pending_review':
    case 'discovered':
      return (
        <>
          <ActionPill variant="solid" prompt={`Approve ${name}`} onPromptSelect={onPromptSelect}>
            Approve
          </ActionPill>
          <ActionPill variant="danger" prompt={`Reject ${name}`} onPromptSelect={onPromptSelect}>
            Reject
          </ActionPill>
          {always}
        </>
      );
    case 'approved':
      return (
        <>
          <ActionPill variant="solid" prompt={`Mark ${name} as contacted`} onPromptSelect={onPromptSelect}>
            Mark contacted
          </ActionPill>
          <ActionPill variant="danger" prompt={`Reject ${name}`} onPromptSelect={onPromptSelect}>
            Reject
          </ActionPill>
          {always}
        </>
      );
    case 'contacted':
      return (
        <>
          <ActionPill variant="solid" prompt={`Mark ${name} as scheduled`} onPromptSelect={onPromptSelect}>
            Mark scheduled
          </ActionPill>
          <ActionPill variant="danger" prompt={`Reject ${name}`} onPromptSelect={onPromptSelect}>
            Reject
          </ActionPill>
          {always}
        </>
      );
    case 'scheduled':
      return (
        <>
          <ActionPill variant="solid" prompt={`Mark ${name} as interviewed`} onPromptSelect={onPromptSelect}>
            Mark interviewed
          </ActionPill>
          <ActionPill variant="danger" prompt={`Reject ${name}`} onPromptSelect={onPromptSelect}>
            Reject
          </ActionPill>
          {always}
        </>
      );
    case 'interviewed':
      return (
        <>
          <ActionPill variant="solid" prompt={`Show me ${name}'s interview`} onPromptSelect={onPromptSelect}>
            Open interview →
          </ActionPill>
          {always}
        </>
      );
    case 'rejected':
      return (
        <>
          <ActionPill prompt={`Re-approve ${name}`} onPromptSelect={onPromptSelect}>
            Re-approve
          </ActionPill>
          {always}
        </>
      );
    default:
      return always;
  }
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <FieldLabel>{label}</FieldLabel>
      <p className="mt-1.5 font-serif text-base leading-relaxed">{children}</p>
    </div>
  );
}

function FieldGrid({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      {items.map(([label, value], i) => (
        <div key={i}>
          <FieldLabel>{label}</FieldLabel>
          <div className="mt-1 text-base">{value}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run, see pass**

- [ ] **Step 5: Register `get_candidate`, `approve_candidate`, `reject_candidate`**

(`approve_candidate` / `reject_candidate` reuse `CandidateDetail` for now — they each return the updated candidate. We swap to `MutationConfirm` in Task 5.2 if desired.)

In `apps/web/src/components/agent-cards/registry.tsx`, add:

```tsx
import { CandidateDetail } from './CandidateDetail';

// inside the registry literal:
get_candidate: CandidateDetail,
```

(Keep `approve_candidate` / `reject_candidate` un-registered for now; Task 5.2 wires them to `MutationConfirm`.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/agent-cards/CandidateDetail.tsx apps/web/src/components/agent-cards/CandidateDetail.test.tsx apps/web/src/components/agent-cards/registry.tsx
git commit -m "feat(web): add CandidateDetail card"
```

### Task 4.2: `CandidateList`

**Files:**
- Create: `apps/web/src/components/agent-cards/CandidateList.tsx`
- Create: `apps/web/src/components/agent-cards/CandidateList.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CandidateList } from './CandidateList';

const fixture = [
  {
    candidateId: 'c1',
    briefId: 'b1',
    contactId: 'p1',
    status: 'pending_review' as const,
    source: 'discovery' as const,
    matchScore: 0.87,
    interviewId: null,
    createdAt: '2026-04-25T10:00:00Z',
    contact: { id: 'p1', name: 'Tania Reyes', title: 'Senior PM', companyName: 'Stripe', linkedinUrl: 'https://linkedin.com/in/taniareyes' },
  },
  {
    candidateId: 'c2',
    briefId: 'b1',
    contactId: 'p2',
    status: 'approved' as const,
    source: 'discovery' as const,
    matchScore: 0.81,
    interviewId: null,
    createdAt: '2026-04-24T10:00:00Z',
    contact: { id: 'p2', name: 'Devon Park', title: 'Founder', companyName: 'Klipper.ai', linkedinUrl: null },
  },
];

describe('CandidateList', () => {
  it('renders one card per candidate without UUIDs', () => {
    const { getByText, queryByText } = render(
      <CandidateList result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText('Tania Reyes')).toBeInTheDocument();
    expect(getByText('Devon Park')).toBeInTheDocument();
    expect(queryByText('c1')).not.toBeInTheDocument();
  });

  it('shows match percent and source label', () => {
    const { getByText } = render(
      <CandidateList result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText(/match 87%/i)).toBeInTheDocument();
    expect(getByText(/from LinkedIn/)).toBeInTheDocument();
    expect(getByText(/from web search/)).toBeInTheDocument();
  });

  it('clicking a card sends "Show me candidate: <name>"', async () => {
    const onPromptSelect = vi.fn();
    const { getByText } = render(
      <CandidateList result={fixture} error={null} onPromptSelect={onPromptSelect} />,
    );
    await userEvent.click(getByText('Tania Reyes'));
    expect(onPromptSelect).toHaveBeenCalledWith('Show me candidate: Tania Reyes');
  });

  it('renders empty state when result is []', () => {
    const { getByText } = render(
      <CandidateList result={[]} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText(/No candidates yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
pnpm --dir apps/web test CandidateList
```

- [ ] **Step 3: Implement**

`apps/web/src/components/agent-cards/CandidateList.tsx`:

```tsx
import { Panel } from './Panel';
import { StatusPill } from './StatusPill';
import { ActionPill } from './ActionPill';
import { formatSource } from './format-source';
import { formatRelativeTime } from './format-relative-time';
import type { CardRendererProps } from './types';

type CandidateListItem = {
  candidateId: string;
  briefId: string;
  contactId: string;
  status: 'discovered' | 'pending_review' | 'approved' | 'contacted' | 'scheduled' | 'interviewed' | 'rejected';
  source: 'discovery' | 'manual' | 'import';
  matchScore: number | null;
  interviewId: string | null;
  createdAt: string;
  contact: {
    id: string;
    name: string;
    title: string | null;
    companyName: string | null;
    linkedinUrl: string | null;
  };
};

export function CandidateList({ result, onPromptSelect }: CardRendererProps) {
  const items = result as CandidateListItem[];

  if (items.length === 0) {
    return (
      <Panel
        variant="empty"
        kicker="NOTHING HERE"
        title="No candidates yet"
        subtitle="Run a discovery search to find people for this brief."
        actions={
          <ActionPill
            variant="solid"
            prompt="Find candidates for the current brief"
            onPromptSelect={onPromptSelect}
          >
            Find candidates →
          </ActionPill>
        }
      >
        {null}
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((c, i) => {
        const subtitleParts = [c.contact.title, c.contact.companyName].filter(Boolean);
        const subtitle = subtitleParts.length === 2
          ? `${subtitleParts[0]} at ${subtitleParts[1]}`
          : subtitleParts.join(' ');
        const matchPct = c.matchScore != null ? `match ${Math.round(c.matchScore * 100)}%` : '';
        return (
          <Panel
            key={c.candidateId}
            role="button"
            onClick={() => onPromptSelect(`Show me candidate: ${c.contact.name}`)}
            kicker={
              <span className="flex justify-between items-center w-full">
                <span>CANDIDATE · {String(i + 1).padStart(2, '0')}</span>
                <StatusPill kind="candidate" value={c.status} />
              </span>
            }
            title={c.contact.name}
            subtitle={subtitle}
            variant="tight"
          >
            <div className="mt-2 pt-2 border-t border-border/40 flex justify-between font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground">
              <span>{formatSource(c, c.contact)}</span>
              <span>
                {matchPct}
                {matchPct && ' · '}
                {formatRelativeTime(c.createdAt)}
              </span>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run, see pass**

```bash
pnpm --dir apps/web test CandidateList
```

- [ ] **Step 5: Register**

In `apps/web/src/components/agent-cards/registry.tsx`, add the import and registry entry:

```tsx
import { CandidateList } from './CandidateList';
// ...
list_candidates_for_brief: CandidateList,
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/agent-cards/CandidateList.tsx apps/web/src/components/agent-cards/CandidateList.test.tsx apps/web/src/components/agent-cards/registry.tsx
git commit -m "feat(web): add CandidateList card"
```

### Task 4.3: `ContactDetail`

**Files:**
- Create: `apps/web/src/components/agent-cards/ContactDetail.tsx`
- Create: `apps/web/src/components/agent-cards/ContactDetail.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ContactDetail } from './ContactDetail';

const fixture = {
  id: 'p1',
  ownerId: 'u1',
  name: 'Devon Park',
  title: 'Founder',
  companyName: 'Klipper.ai',
  companyDomain: 'klipper.ai',
  email: 'devon@klipper.ai',
  location: 'Brooklyn, NY',
  linkedinUrl: 'https://linkedin.com/in/devonpark',
  researchNotes: 'Indie founder, 3 product launches.',
  profileJson: { secret: 'do-not-render' },
  embedding: null,
  createdAt: '2026-04-09T10:00:00Z',
  updatedAt: '2026-04-09T10:00:00Z',
};

describe('ContactDetail', () => {
  it('renders name as title and role/company subtitle', () => {
    const { getByText } = render(
      <ContactDetail result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText('Devon Park')).toBeInTheDocument();
    expect(getByText(/Founder at Klipper.ai/)).toBeInTheDocument();
  });

  it('renders email, linkedin, location, company domain', () => {
    const { getByText } = render(
      <ContactDetail result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText('devon@klipper.ai')).toBeInTheDocument();
    expect(getByText(/Brooklyn, NY/)).toBeInTheDocument();
    expect(getByText('klipper.ai')).toBeInTheDocument();
  });

  it('renders research notes', () => {
    const { getByText } = render(
      <ContactDetail result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText(/Indie founder, 3 product launches/)).toBeInTheDocument();
  });

  it('does NOT render profileJson contents', () => {
    const { queryByText } = render(
      <ContactDetail result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(queryByText(/do-not-render/)).not.toBeInTheDocument();
  });

  it('Open LinkedIn pill is an external anchor', () => {
    const { getByText } = render(
      <ContactDetail result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    const link = getByText(/Open LinkedIn/).closest('a');
    expect(link).toHaveAttribute('href', 'https://linkedin.com/in/devonpark');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('Email pill is a mailto anchor', () => {
    const { getByText } = render(
      <ContactDetail result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText('Email').closest('a')).toHaveAttribute('href', 'mailto:devon@klipper.ai');
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
pnpm --dir apps/web test ContactDetail
```

- [ ] **Step 3: Implement**

`apps/web/src/components/agent-cards/ContactDetail.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import { formatRelativeTime } from './format-relative-time';
import type { CardRendererProps } from './types';

type ContactResult = {
  id: string;
  name: string;
  title: string | null;
  companyName: string | null;
  companyDomain: string | null;
  email: string | null;
  location: string | null;
  linkedinUrl: string | null;
  researchNotes: string | null;
  createdAt: string | Date;
  // profileJson intentionally omitted from rendering
};

export function ContactDetail({ result, onPromptSelect }: CardRendererProps) {
  const c = result as ContactResult;
  const subtitleParts = [
    c.title && c.companyName ? `${c.title} at ${c.companyName}` : c.title ?? c.companyName ?? '',
    c.location,
  ].filter(Boolean);

  return (
    <Panel
      kicker="CONTACT"
      title={c.name}
      subtitle={subtitleParts.join(' · ')}
      actions={
        <>
          <ActionPill
            variant="solid"
            prompt={`Use ${c.name} in a new brief`}
            onPromptSelect={onPromptSelect}
          >
            Use in new brief
          </ActionPill>
          {c.linkedinUrl && (
            <ActionPill href={c.linkedinUrl} onPromptSelect={onPromptSelect}>
              Open LinkedIn ↗
            </ActionPill>
          )}
          {c.email && (
            <ActionPill mailto={c.email} onPromptSelect={onPromptSelect}>
              Email
            </ActionPill>
          )}
        </>
      }
    >
      <FieldGrid
        items={[
          ['EMAIL', c.email ?? '—'],
          ['LINKEDIN', c.linkedinUrl ? linkedinSlug(c.linkedinUrl) : '—'],
          ['COMPANY DOMAIN', c.companyDomain ?? '—'],
          ['ADDED', formatRelativeTime(c.createdAt)],
        ]}
      />
      {c.researchNotes && <Field label="RESEARCH NOTES">{c.researchNotes}</Field>}
    </Panel>
  );
}

function linkedinSlug(url: string): string {
  const match = url.match(/in\/([^/?]+)/);
  return match ? `/in/${match[1]}` : url;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <FieldLabel>{label}</FieldLabel>
      <p className="mt-1.5 font-serif text-base leading-relaxed">{children}</p>
    </div>
  );
}

function FieldGrid({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      {items.map(([label, value], i) => (
        <div key={i}>
          <FieldLabel>{label}</FieldLabel>
          <div className="mt-1 text-base">{value}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run, see pass**

- [ ] **Step 5: Register**

In `registry.tsx`:

```tsx
import { ContactDetail } from './ContactDetail';
// ...
get_contact: ContactDetail,
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/agent-cards/ContactDetail.tsx apps/web/src/components/agent-cards/ContactDetail.test.tsx apps/web/src/components/agent-cards/registry.tsx
git commit -m "feat(web): add ContactDetail card"
```

### Task 4.4: `ContactList`

**Files:**
- Create: `apps/web/src/components/agent-cards/ContactList.tsx`
- Create: `apps/web/src/components/agent-cards/ContactList.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactList } from './ContactList';

const fixture = [
  {
    id: 'p1',
    name: 'Tania Reyes',
    title: 'Senior PM',
    companyName: 'Stripe',
    email: 'tania.reyes@stripe.com',
    location: 'San Francisco, CA',
    linkedinUrl: 'https://linkedin.com/in/taniareyes',
    createdAt: '2026-04-12T10:00:00Z',
  },
  {
    id: 'p2',
    name: 'Devon Park',
    title: 'Founder',
    companyName: 'Klipper.ai',
    email: 'devon@klipper.ai',
    location: 'Brooklyn, NY',
    linkedinUrl: null,
    createdAt: '2026-04-09T10:00:00Z',
  },
];

describe('ContactList', () => {
  it('renders one card per contact, no UUIDs', () => {
    const { getByText, queryByText } = render(
      <ContactList result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText('Tania Reyes')).toBeInTheDocument();
    expect(getByText('Devon Park')).toBeInTheDocument();
    expect(queryByText('p1')).not.toBeInTheDocument();
  });

  it('subtitle includes title, company, location', () => {
    const { getByText } = render(
      <ContactList result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText(/Senior PM at Stripe · San Francisco, CA/)).toBeInTheDocument();
  });

  it('meta footer shows email and relative added time', () => {
    const { getByText } = render(
      <ContactList result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText('tania.reyes@stripe.com')).toBeInTheDocument();
  });

  it('clicking a card sends "Show me contact: <name>"', async () => {
    const onPromptSelect = vi.fn();
    const { getByText } = render(
      <ContactList result={fixture} error={null} onPromptSelect={onPromptSelect} />,
    );
    await userEvent.click(getByText('Tania Reyes'));
    expect(onPromptSelect).toHaveBeenCalledWith('Show me contact: Tania Reyes');
  });

  it('renders empty state when result is []', () => {
    const { getByText } = render(
      <ContactList result={[]} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText(/No contacts yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
pnpm --dir apps/web test ContactList
```

- [ ] **Step 3: Implement**

`apps/web/src/components/agent-cards/ContactList.tsx`:

```tsx
import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import { formatRelativeTime } from './format-relative-time';
import type { CardRendererProps } from './types';

type ContactListItem = {
  id: string;
  name: string;
  title: string | null;
  companyName: string | null;
  email: string | null;
  location: string | null;
  linkedinUrl: string | null;
  createdAt: string;
};

export function ContactList({ result, onPromptSelect }: CardRendererProps) {
  const items = result as ContactListItem[];

  if (items.length === 0) {
    return (
      <Panel
        variant="empty"
        kicker="NOTHING HERE"
        title="No contacts yet"
        subtitle="Run discovery on a brief to populate your contact list."
        actions={
          <ActionPill
            variant="solid"
            prompt="List my briefs"
            onPromptSelect={onPromptSelect}
          >
            Open a brief →
          </ActionPill>
        }
      >
        {null}
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((c, i) => {
        const subtitleParts = [
          c.title && c.companyName ? `${c.title} at ${c.companyName}` : c.title ?? c.companyName ?? '',
          c.location,
        ].filter(Boolean);
        return (
          <Panel
            key={c.id}
            role="button"
            onClick={() => onPromptSelect(`Show me contact: ${c.name}`)}
            kicker={
              <span className="flex justify-between items-center w-full">
                <span>CONTACT · {String(i + 1).padStart(2, '0')}</span>
                {c.linkedinUrl && (
                  <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-muted-foreground border border-border rounded-full px-2 py-0.5">
                    LINKEDIN
                  </span>
                )}
              </span>
            }
            title={c.name}
            subtitle={subtitleParts.join(' · ')}
            variant="tight"
          >
            <div className="mt-2 pt-2 border-t border-border/40 flex justify-between font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground">
              <span>{c.email ?? ''}</span>
              <span>added {formatRelativeTime(c.createdAt)}</span>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run, see pass**

- [ ] **Step 5: Register**

```tsx
import { ContactList } from './ContactList';
// ...
list_contacts: ContactList,
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/agent-cards/ContactList.tsx apps/web/src/components/agent-cards/ContactList.test.tsx apps/web/src/components/agent-cards/registry.tsx
git commit -m "feat(web): add ContactList card"
```

### Task 4.5: `InterviewDetail`

**Files:**
- Create: `apps/web/src/components/agent-cards/InterviewDetail.tsx`
- Create: `apps/web/src/components/agent-cards/InterviewDetail.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { InterviewDetail } from './InterviewDetail';

const fixture = {
  interviewId: 'i1',
  briefId: 'b1',
  briefName: 'OpenAI Platform',
  contactName: 'Tania Reyes',
  status: 'completed' as const,
  durationSecs: 512,
  completedAt: '2026-04-23T14:00:00Z',
  transcript: [
    { role: 'agent' as const, message: 'Hi Tania, what is your role?', timeInCallSecs: 0 },
    { role: 'user' as const, message: 'Senior PM at Stripe.', timeInCallSecs: 5 },
  ],
  analysis: {
    participant: { inferredRole: 'Senior PM, fintech infra', background: '7 years in product, last 3 at Stripe.' },
    answers: [
      {
        questionId: 'q1',
        questionText: 'What is your role?',
        response: 'Senior PM at Stripe API team.',
        sentiment: 'positive' as const,
      },
    ],
    keyInsights: ['Wants better tracing.', 'Confused by rate limits.'],
    productMarketFitSignals: ['Would pay today.'],
    suggestedFollowUps: ['Probe willingness to pay.'],
    overallSentiment: 'positive' as const,
  },
};

describe('InterviewDetail', () => {
  it('title shows contact name and duration; subtitle shows brief and turn count', () => {
    const { getByText } = render(
      <InterviewDetail result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText(/Tania Reyes · 8m 32s/)).toBeInTheDocument();
    expect(getByText(/2 turns/)).toBeInTheDocument();
  });

  it('renders participant background, key insights, PMF signals, suggested follow-ups', () => {
    const { getByText } = render(
      <InterviewDetail result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText(/7 years in product/)).toBeInTheDocument();
    expect(getByText('Wants better tracing.')).toBeInTheDocument();
    expect(getByText('Would pay today.')).toBeInTheDocument();
    expect(getByText('Probe willingness to pay.')).toBeInTheDocument();
  });

  it('renders ANSWERS as numbered list with question text', () => {
    const { getByText } = render(
      <InterviewDetail result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText(/Senior PM at Stripe API team/)).toBeInTheDocument();
  });

  it('hides transcript content by default (inside <details>)', () => {
    const { container } = render(
      <InterviewDetail result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute('open');
  });

  it('omits the View candidate pill when no candidate is linked', () => {
    const { queryByText } = render(
      <InterviewDetail result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(queryByText('View candidate')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
pnpm --dir apps/web test InterviewDetail
```

- [ ] **Step 3: Implement**

`apps/web/src/components/agent-cards/InterviewDetail.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { CallAnalysis } from '@mirrars/shared';
import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import { StatusPill } from './StatusPill';
import { SentimentPill } from './SentimentPill';
import type { CardRendererProps } from './types';

type InterviewDetailResult = {
  interviewId: string;
  briefId: string | null;
  briefName: string | null;
  contactName: string | null;
  status: 'completed' | 'failed';
  durationSecs: number | null;
  completedAt: string | null;
  transcript: Array<{ role: 'user' | 'agent'; message: string; timeInCallSecs: number }>;
  analysis: CallAnalysis | null;
};

export function InterviewDetail({ result, onPromptSelect }: CardRendererProps) {
  const iv = result as InterviewDetailResult;
  const duration = formatDuration(iv.durationSecs);
  const turnCount = iv.transcript.length;
  const briefHint = iv.briefName ?? 'a brief';
  const contactHint = iv.contactName ?? 'this interview';

  return (
    <Panel
      kicker={`INTERVIEW · ON ${briefHint.toUpperCase()}`}
      title={`${contactHint}${duration ? ` · ${duration}` : ''}`}
      subtitle={`${iv.status === 'completed' ? 'completed' : 'failed'}${
        iv.completedAt ? ` · ${turnCount} turns` : ''
      }`}
      actions={
        <>
          {iv.briefName && (
            <ActionPill
              variant="solid"
              prompt={`Show me brief: ${iv.briefName}`}
              onPromptSelect={onPromptSelect}
            >
              View brief
            </ActionPill>
          )}
          {iv.contactName && (
            <ActionPill
              prompt={`Show me contact: ${iv.contactName}`}
              onPromptSelect={onPromptSelect}
            >
              View contact
            </ActionPill>
          )}
        </>
      }
    >
      <FieldGrid
        items={[
          ['SENTIMENT', iv.analysis ? <SentimentPill value={iv.analysis.overallSentiment} /> : '—'],
          ['STATUS', <StatusPill kind="interview" value={iv.status} />],
          ['DURATION', duration || '—'],
          ['PARTICIPANT ROLE', iv.analysis?.participant.inferredRole ?? '—'],
        ]}
      />
      {iv.analysis && (
        <>
          <Field label="PARTICIPANT BACKGROUND">{iv.analysis.participant.background}</Field>
          {iv.analysis.keyInsights.length > 0 && (
            <BulletField label={`KEY INSIGHTS · ${iv.analysis.keyInsights.length}`} items={iv.analysis.keyInsights} />
          )}
          {iv.analysis.productMarketFitSignals.length > 0 && (
            <BulletField label={`PMF SIGNALS · ${iv.analysis.productMarketFitSignals.length}`} items={iv.analysis.productMarketFitSignals} />
          )}
          {iv.analysis.answers.length > 0 && (
            <div className="mt-4">
              <FieldLabel>ANSWERS · {iv.analysis.answers.length}</FieldLabel>
              <ol className="mt-2 space-y-3">
                {iv.analysis.answers.map((a, i) => (
                  <li key={a.questionId} className="flex gap-3">
                    <span className="font-mono text-xs text-muted-foreground pt-1.5 w-6 shrink-0">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <div className="font-mono text-[9px] tracking-[0.15em] uppercase text-muted-foreground">
                        {a.sentiment}
                      </div>
                      <p className="font-serif text-base leading-relaxed">{a.response}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {iv.analysis.suggestedFollowUps.length > 0 && (
            <BulletField
              label={`SUGGESTED FOLLOW-UPS · ${iv.analysis.suggestedFollowUps.length}`}
              items={iv.analysis.suggestedFollowUps}
            />
          )}
        </>
      )}
      {iv.transcript.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer font-mono text-[10px] tracking-[0.2em] uppercase text-accent">
            Open transcript · {turnCount} turns
          </summary>
          <div className="mt-2 space-y-2">
            {iv.transcript.map((t, i) => (
              <div key={i} className="border-b border-border/40 pb-2">
                <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground mb-0.5">
                  {t.role === 'agent' ? 'Researcher' : 'You'} · {formatDuration(t.timeInCallSecs)}
                </div>
                <p className="font-serif text-sm leading-relaxed">{t.message}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </Panel>
  );
}

function formatDuration(secs: number | null): string {
  if (secs == null) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">{children}</div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <FieldLabel>{label}</FieldLabel>
      <p className="mt-1.5 font-serif text-base leading-relaxed">{children}</p>
    </div>
  );
}

function BulletField({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-4">
      <FieldLabel>{label}</FieldLabel>
      <ul className="mt-2 list-disc pl-6 space-y-1 font-serif text-base leading-relaxed">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function FieldGrid({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
      {items.map(([label, value], i) => (
        <div key={i}>
          <FieldLabel>{label}</FieldLabel>
          <div className="mt-1 text-base">{value}</div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run, see pass**

- [ ] **Step 5: Register**

```tsx
import { InterviewDetail } from './InterviewDetail';
// ...
get_interview: InterviewDetail,
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/agent-cards/InterviewDetail.tsx apps/web/src/components/agent-cards/InterviewDetail.test.tsx apps/web/src/components/agent-cards/registry.tsx
git commit -m "feat(web): add InterviewDetail card"
```

### Task 4.6: `InterviewList`

**Files:**
- Create: `apps/web/src/components/agent-cards/InterviewList.tsx`
- Create: `apps/web/src/components/agent-cards/InterviewList.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InterviewList } from './InterviewList';

const fixture = [
  {
    interviewId: 'i1',
    briefId: 'b1',
    briefName: 'OpenAI Platform',
    contactName: 'Tania Reyes',
    status: 'completed' as const,
    durationSecs: 512,
    overallSentiment: 'positive' as const,
    completedAt: '2026-04-23T14:00:00Z',
  },
  {
    interviewId: 'i2',
    briefId: 'b2',
    briefName: 'Mirrars Self-research',
    contactName: 'Devon Park',
    status: 'completed' as const,
    durationSecs: 364,
    overallSentiment: 'neutral' as const,
    completedAt: '2026-04-21T14:00:00Z',
  },
];

describe('InterviewList', () => {
  it('renders one card per interview without UUIDs', () => {
    const { getByText, queryByText } = render(
      <InterviewList result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText(/Tania Reyes · 8m 32s/)).toBeInTheDocument();
    expect(getByText(/Devon Park · 6m 04s/)).toBeInTheDocument();
    expect(queryByText('i1')).not.toBeInTheDocument();
  });

  it('subtitle shows "on <briefName>"', () => {
    const { getByText } = render(
      <InterviewList result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText(/on OpenAI Platform/)).toBeInTheDocument();
  });

  it('shows sentiment and status pills', () => {
    const { getAllByText } = render(
      <InterviewList result={fixture} error={null} onPromptSelect={() => {}} />,
    );
    expect(getAllByText('POSITIVE')[0]).toBeInTheDocument();
    expect(getAllByText('COMPLETED')[0]).toBeInTheDocument();
  });

  it('clicking a card sends "Show me interview: <name> on <brief>"', async () => {
    const onPromptSelect = vi.fn();
    const { getByText } = render(
      <InterviewList result={fixture} error={null} onPromptSelect={onPromptSelect} />,
    );
    await userEvent.click(getByText(/Tania Reyes · 8m 32s/));
    expect(onPromptSelect).toHaveBeenCalledWith(
      'Show me interview: Tania Reyes on OpenAI Platform',
    );
  });

  it('renders empty state when result is []', () => {
    const { getByText } = render(
      <InterviewList result={[]} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText(/No interviews yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
pnpm --dir apps/web test InterviewList
```

- [ ] **Step 3: Implement**

`apps/web/src/components/agent-cards/InterviewList.tsx`:

```tsx
import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import { StatusPill } from './StatusPill';
import { SentimentPill } from './SentimentPill';
import { formatRelativeTime } from './format-relative-time';
import type { CardRendererProps } from './types';

type InterviewListItem = {
  interviewId: string;
  briefId: string | null;
  briefName: string | null;
  contactName: string | null;
  status: 'completed' | 'failed';
  durationSecs: number | null;
  overallSentiment: 'positive' | 'neutral' | 'negative' | null;
  completedAt: string | null;
};

function formatDuration(secs: number | null): string {
  if (secs == null) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function InterviewList({ result, onPromptSelect }: CardRendererProps) {
  const items = result as InterviewListItem[];

  if (items.length === 0) {
    return (
      <Panel
        variant="empty"
        kicker="NOTHING HERE"
        title="No interviews yet"
        subtitle="Approve candidates and run interviews to populate this list."
        actions={
          <ActionPill variant="solid" prompt="List my briefs" onPromptSelect={onPromptSelect}>
            Open a brief →
          </ActionPill>
        }
      >
        {null}
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((iv, i) => {
        const contactHint = iv.contactName ?? `Interview ${i + 1}`;
        const briefHint = iv.briefName ?? 'a brief';
        const duration = formatDuration(iv.durationSecs);
        return (
          <Panel
            key={iv.interviewId}
            role="button"
            onClick={() =>
              onPromptSelect(`Show me interview: ${contactHint} on ${briefHint}`)
            }
            kicker={
              <span className="flex justify-between items-center w-full">
                <span>INTERVIEW · {String(i + 1).padStart(2, '0')}</span>
                {iv.overallSentiment && <SentimentPill value={iv.overallSentiment} />}
              </span>
            }
            title={duration ? `${contactHint} · ${duration}` : contactHint}
            subtitle={`on ${briefHint}`}
            variant="tight"
          >
            <div className="mt-2 pt-2 border-t border-border/40 flex justify-between items-center font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground">
              <StatusPill kind="interview" value={iv.status} />
              <span>{formatRelativeTime(iv.completedAt)}</span>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run, see pass**

- [ ] **Step 5: Register**

```tsx
import { InterviewList } from './InterviewList';
// ...
list_interviews: InterviewList,
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/agent-cards/InterviewList.tsx apps/web/src/components/agent-cards/InterviewList.test.tsx apps/web/src/components/agent-cards/registry.tsx
git commit -m "feat(web): add InterviewList card"
```

---

## Phase 5 — State Panels

### Task 5.1: `JobStatus`

**Files:**
- Create: `apps/web/src/components/agent-cards/JobStatus.tsx`
- Create: `apps/web/src/components/agent-cards/JobStatus.test.tsx`

Two source shapes feed this renderer:
- `find_candidates` returns `{ jobId, status: 'queued', next: string }` (no `kind`).
- `get_job_status` returns `{ jobId, kind, status, input, output, error, startedAt, finishedAt, … }`.

The renderer normalizes: if `kind` is absent, treat as `'discovery'` (since `find_candidates` is the only path that lacks it).

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { JobStatus } from './JobStatus';

describe('JobStatus', () => {
  it('queued: shows queued title and Check-status pill', () => {
    const { getByText } = render(
      <JobStatus
        result={{ jobId: 'j1', status: 'queued', next: 'Poll later' }}
        error={null}
        onPromptSelect={() => {}}
      />,
    );
    expect(getByText(/queued/i)).toBeInTheDocument();
    expect(getByText('Check status')).toBeInTheDocument();
  });

  it('running: shows running title and Check-status pill', () => {
    const { getByText } = render(
      <JobStatus
        result={{ jobId: 'j1', kind: 'discovery', status: 'running', startedAt: '2026-04-27T12:00:00Z' }}
        error={null}
        onPromptSelect={() => {}}
      />,
    );
    expect(getByText(/Sourcing candidates…/)).toBeInTheDocument();
    expect(getByText('Check status')).toBeInTheDocument();
  });

  it('succeeded: shows complete title and Open-results pill', () => {
    const { getByText } = render(
      <JobStatus
        result={{ jobId: 'j1', kind: 'discovery', status: 'succeeded', input: { briefId: 'b1' } }}
        error={null}
        onPromptSelect={() => {}}
      />,
    );
    expect(getByText(/complete/i)).toBeInTheDocument();
    expect(getByText(/Open results/)).toBeInTheDocument();
  });

  it('failed: renders error variant with retry pill', () => {
    const { getByText, container } = render(
      <JobStatus
        result={{ jobId: 'j1', kind: 'discovery', status: 'failed', error: 'Exa rate-limited' }}
        error={null}
        onPromptSelect={() => {}}
      />,
    );
    expect(container.querySelector('[class*="border-destructive"]')).not.toBeNull();
    expect(getByText(/Try again/)).toBeInTheDocument();
  });

  it('does NOT mention vendor names like Exa in titles or hints', () => {
    const { queryByText } = render(
      <JobStatus
        result={{ jobId: 'j1', kind: 'discovery', status: 'running', startedAt: '2026-04-27T12:00:00Z' }}
        error={null}
        onPromptSelect={() => {}}
      />,
    );
    expect(queryByText(/Exa/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, see fail**

```bash
pnpm --dir apps/web test JobStatus
```

- [ ] **Step 3: Implement**

`apps/web/src/components/agent-cards/JobStatus.tsx`:

```tsx
import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import { formatRelativeTime } from './format-relative-time';
import type { CardRendererProps } from './types';

type JobResult = {
  jobId: string;
  kind?: 'discovery' | 'research' | 'outreach';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  startedAt?: string | null;
  finishedAt?: string | null;
  input?: { briefId?: string } | null;
  error?: string | null;
  next?: string;
};

export function JobStatus({ result, onPromptSelect }: CardRendererProps) {
  const job = result as JobResult;
  const kind = job.kind ?? 'discovery';
  const kicker = `JOB · ${kind.toUpperCase()}`;
  const elapsed = job.startedAt ? formatRelativeTime(job.startedAt) : 'just now';

  if (job.status === 'failed') {
    return (
      <Panel
        variant="error"
        kicker={`⚠ ERROR · ${kicker}`}
        title="Job failed"
        subtitle={`failed · started ${elapsed}`}
        actions={
          <ActionPill prompt="Retry that operation" onPromptSelect={onPromptSelect}>
            Try again
          </ActionPill>
        }
      >
        {job.error && (
          <p className="font-serif text-base leading-relaxed">{job.error.slice(0, 280)}</p>
        )}
      </Panel>
    );
  }

  if (job.status === 'succeeded') {
    return (
      <Panel
        variant="tight"
        kicker={kicker}
        title={titleFor(kind, 'succeeded')}
        subtitle={`succeeded · started ${elapsed}`}
        actions={
          <ActionPill
            variant="solid"
            prompt={`List candidates for the latest brief`}
            onPromptSelect={onPromptSelect}
          >
            Open results →
          </ActionPill>
        }
      >
        {null}
      </Panel>
    );
  }

  // queued OR running
  const isRunning = job.status === 'running';
  return (
    <Panel
      variant="tight"
      kicker={kicker}
      title={titleFor(kind, job.status)}
      subtitle={isRunning ? `running · started ${elapsed}` : `queued · ${elapsed}`}
      actions={
        <ActionPill
          prompt="Check the status of the candidate sourcing job"
          onPromptSelect={onPromptSelect}
        >
          Check status
        </ActionPill>
      }
    >
      {isRunning && (
        <p className="font-serif text-sm text-muted-foreground italic">
          This usually takes a minute or two.
        </p>
      )}
    </Panel>
  );
}

function titleFor(kind: NonNullable<JobResult['kind']>, status: JobResult['status']): string {
  const labels: Record<typeof kind, { running: string; succeeded: string; queued: string }> = {
    discovery: {
      running: 'Sourcing candidates…',
      succeeded: 'Sourcing complete.',
      queued: 'Sourcing is queued.',
    },
    research: {
      running: 'Researching…',
      succeeded: 'Research complete.',
      queued: 'Research is queued.',
    },
    outreach: {
      running: 'Outreach in progress…',
      succeeded: 'Outreach complete.',
      queued: 'Outreach is queued.',
    },
  };
  if (status === 'failed') return 'Job failed';
  return labels[kind][status];
}
```

- [ ] **Step 4: Run, see pass**

- [ ] **Step 5: Register**

```tsx
import { JobStatus } from './JobStatus';
// ...
find_candidates: JobStatus,
get_job_status: JobStatus,
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/agent-cards/JobStatus.tsx apps/web/src/components/agent-cards/JobStatus.test.tsx apps/web/src/components/agent-cards/registry.tsx
git commit -m "feat(web): add JobStatus card"
```

### Task 5.2: `MutationConfirm`

**Files:**
- Create: `apps/web/src/components/agent-cards/MutationConfirm.tsx`
- Create: `apps/web/src/components/agent-cards/MutationConfirm.test.tsx`

Used for `approve_candidate` and `reject_candidate`. Brief mutations (`create_brief`, `update_brief`, `preview_brief`) continue to route through `BriefDetail` per spec §4 / Task 3.3.

- [ ] **Step 1: Verify the wire shape**

```bash
sed -n '1,80p' apps/server/src/tools/approve-candidate.ts
sed -n '1,80p' apps/server/src/tools/reject-candidate.ts
```

The shape is the same as Task 4.1's `CandidateDetailResult` minus the briefName. If the tool doesn't return contact info or briefName, the renderer falls back to neutral text.

- [ ] **Step 2: Failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MutationConfirm } from './MutationConfirm';

const approveResult = {
  candidateId: 'c1',
  briefId: 'b1',
  briefName: 'OpenAI Platform',
  contactId: 'p1',
  status: 'approved' as const,
  source: 'discovery' as const,
  matchScore: 0.87,
  interviewId: null,
  createdAt: '2026-04-27T11:00:00Z',
  contact: { id: 'p1', name: 'Tania Reyes', title: 'Senior PM', companyName: 'Stripe', linkedinUrl: null },
};

describe('MutationConfirm', () => {
  it('shows ✓ APPROVED kicker and contact name', () => {
    const { getByText } = render(
      <MutationConfirm
        result={approveResult}
        error={null}
        onPromptSelect={() => {}}
        // toolName is normally injected by the registry; pass via context-style prop here
      />,
    );
    expect(getByText(/✓ APPROVED/)).toBeInTheDocument();
    expect(getByText('Tania Reyes')).toBeInTheDocument();
  });

  it('subtitle includes brief name', () => {
    const { getByText } = render(
      <MutationConfirm result={approveResult} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText(/on OpenAI Platform/)).toBeInTheDocument();
  });

  it('Mark contacted pill triggers correct prompt for approved status', async () => {
    const onPromptSelect = vi.fn();
    const { getByText } = render(
      <MutationConfirm result={approveResult} error={null} onPromptSelect={onPromptSelect} />,
    );
    await userEvent.click(getByText('Mark contacted'));
    expect(onPromptSelect).toHaveBeenCalledWith('Mark Tania Reyes as contacted');
  });

  it('rejected status shows ✓ REJECTED and Re-approve next-step', () => {
    const rejected = { ...approveResult, status: 'rejected' as const };
    const { getByText } = render(
      <MutationConfirm result={rejected} error={null} onPromptSelect={() => {}} />,
    );
    expect(getByText(/✓ REJECTED/)).toBeInTheDocument();
    expect(getByText('Re-approve')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run, see fail**

```bash
pnpm --dir apps/web test MutationConfirm
```

- [ ] **Step 4: Implement**

`apps/web/src/components/agent-cards/MutationConfirm.tsx`:

```tsx
import { Panel } from './Panel';
import { ActionPill } from './ActionPill';
import type { CardRendererProps } from './types';

type CandidateMutationResult = {
  candidateId: string;
  briefId: string;
  briefName: string | null;
  status:
    | 'discovered'
    | 'pending_review'
    | 'approved'
    | 'contacted'
    | 'scheduled'
    | 'interviewed'
    | 'rejected';
  contact: { name: string };
};

const VERB: Record<CandidateMutationResult['status'], string> = {
  discovered: 'UPDATED',
  pending_review: 'UPDATED',
  approved: 'APPROVED',
  contacted: 'MARKED CONTACTED',
  scheduled: 'MARKED SCHEDULED',
  interviewed: 'MARKED INTERVIEWED',
  rejected: 'REJECTED',
};

export function MutationConfirm({ result, onPromptSelect }: CardRendererProps) {
  const c = result as CandidateMutationResult;
  const name = c.contact.name;
  const briefHint = c.briefName ?? 'this brief';
  return (
    <Panel
      variant="tight"
      kicker={`✓ ${VERB[c.status]}`}
      title={name}
      subtitle={`on ${briefHint} · just now`}
      actions={renderNextStep(c, onPromptSelect)}
    />
  );
}

function renderNextStep(
  c: CandidateMutationResult,
  onPromptSelect: (text: string) => void,
) {
  const name = c.contact.name;
  const view = (
    <ActionPill prompt={`Show me candidate: ${name}`} onPromptSelect={onPromptSelect}>
      View candidate
    </ActionPill>
  );
  switch (c.status) {
    case 'approved':
      return (
        <>
          <ActionPill
            variant="solid"
            prompt={`Mark ${name} as contacted`}
            onPromptSelect={onPromptSelect}
          >
            Mark contacted
          </ActionPill>
          {view}
        </>
      );
    case 'rejected':
      return (
        <>
          <ActionPill prompt={`Re-approve ${name}`} onPromptSelect={onPromptSelect}>
            Re-approve
          </ActionPill>
          {view}
        </>
      );
    default:
      return view;
  }
}
```

- [ ] **Step 5: Run, see pass**

- [ ] **Step 6: Register**

```tsx
import { MutationConfirm } from './MutationConfirm';
// ...
approve_candidate: MutationConfirm,
reject_candidate: MutationConfirm,
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/agent-cards/MutationConfirm.tsx apps/web/src/components/agent-cards/MutationConfirm.test.tsx apps/web/src/components/agent-cards/registry.tsx
git commit -m "feat(web): add MutationConfirm card"
```

### Task 5.3: `EmptyState` — INTENTIONALLY OUT OF SCOPE

Empty states are inlined in each list component (Task 3.3, 4.2, 4.4, 4.6) using `<Panel variant="empty">`. This is sufficient and avoids a thin wrapper component for v1. **Skip this task — no work to do.**

### Task 5.4: `ErrorPanel` upgrades

**Files:**
- Modify: `apps/web/src/components/agent-cards/ErrorPanel.tsx`
- Create: `apps/web/src/components/agent-cards/ErrorPanel.test.tsx`

The placeholder from Task 3.1 always recommends `List briefs`. Improve recovery suggestions per failing tool:

- `get_brief` / `update_brief` / `preview_brief` → recovery `List briefs`
- `list_candidates_for_brief` / `get_candidate` / `approve_candidate` / `reject_candidate` → `List briefs`
- `list_interviews` / `get_interview` → `List briefs`
- `list_contacts` / `get_contact` → `List my contacts`
- `find_candidates` / `get_job_status` → `Try again` (prompt: `Retry that operation`)
- default → `List briefs`

- [ ] **Step 1: Failing test** — covers per-tool recovery prompt + the 280-char clamp.

- [ ] **Step 2: Replace placeholder logic with a recovery map** (function `recoveryFor(toolName)` → `{ label, prompt }`).

- [ ] **Step 3: Run, see pass**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(web): improve ErrorPanel recovery prompts"
```

---

## Phase 6 — Prompt Edit + Integration Test

### Task 6.1: Update `UNIVERSAL_SYSTEM_PROMPT`

**Files:**
- Modify: `apps/server/src/agent/prompts.ts`

- [ ] **Step 1: Open the file and append to the existing string**

Replace the `UNIVERSAL_SYSTEM_PROMPT` string. Add after the existing `Voice interviews are browser-only:` paragraph:

```
Rendering rules:
- When a tool returns a list or single entity, reply with at most one short, conversational sentence framing what was returned.
- Never enumerate IDs, fields, or descriptions in your reply — the client renders structured cards from the tool result.
- Use prose only for framing, judgement, and follow-up suggestions.
```

- [ ] **Step 2: Verify server tests still pass**

```bash
pnpm --dir apps/server test
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/agent/prompts.ts
git commit -m "feat(server): add no-enumeration rule to universal system prompt"
```

### Task 6.2: AgentChat integration test

**Files:**
- Create: `apps/web/src/components/AgentChat.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AgentChat from './AgentChat';

vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({ user: null, signOut: vi.fn() }),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    postChat: vi.fn(),
  };
});

import { postChat } from '@/lib/api';

const briefListResponse = {
  reply: 'Found 1 brief.',
  toolCalls: [
    {
      name: 'list_briefs',
      args: {},
      result: [
        {
          briefId: 'b1',
          name: 'OpenAI Platform',
          company: 'OpenAI',
          industry: 'Developer tools',
          objective: 'Validate demand for new features.',
          questionCount: 5,
          candidateCount: 0,
          status: 'active',
          createdAt: '2026-04-25T10:00:00Z',
        },
      ],
      error: null,
      durationMs: 100,
    },
  ],
  usage: { promptTokens: 0, outputTokens: 0 },
};

const briefDetailResponse = {
  reply: "Here's the OpenAI Platform brief.",
  toolCalls: [
    {
      name: 'get_brief',
      args: { briefId: 'b1' },
      result: {
        id: 'b1',
        ownerId: 'u1',
        status: 'active',
        researchContext: {
          company: { name: 'OpenAI', industry: 'Developer tools', description: '' },
          product: { name: 'OpenAI Platform', description: '', keyFeatures: ['x'], targetAudience: '' },
          research: {
            objective: 'Validate demand.',
            questions: [{ id: 'q1', text: 'Q?', followUp: '', category: 'background' }],
            concerns: [],
            productMarketFit: { hypothesis: '', signals: [] },
          },
          interviewSettings: { maxDurationMinutes: 8, tone: '', language: 'en' },
        },
        createdAt: new Date('2026-04-25T10:00:00Z'),
        updatedAt: new Date('2026-04-25T10:00:00Z'),
      },
      error: null,
      durationMs: 100,
    },
  ],
  usage: { promptTokens: 0, outputTokens: 0 },
};

beforeEach(() => {
  vi.mocked(postChat).mockReset();
});

describe('AgentChat integration', () => {
  it('clicking a brief card sends a synthetic user turn and renders detail', async () => {
    vi.mocked(postChat)
      .mockResolvedValueOnce(briefListResponse)
      .mockResolvedValueOnce(briefDetailResponse);

    render(
      <BrowserRouter>
        <AgentChat />
      </BrowserRouter>,
    );

    // user types and sends "list my briefs"
    const textarea = screen.getByPlaceholderText(/Type a question/i);
    await userEvent.type(textarea, 'list my briefs');
    await userEvent.keyboard('{Enter}');

    // wait for assistant turn with brief card
    expect(await screen.findByText('OpenAI Platform')).toBeInTheDocument();

    // tool-call chip should NOT be visible (no `list_briefs` tool name in DOM)
    expect(screen.queryByText('list_briefs')).not.toBeInTheDocument();

    // click the brief card
    await userEvent.click(screen.getByText('OpenAI Platform'));

    // synthetic user turn appears
    expect(await screen.findByText('Show me brief: OpenAI Platform')).toBeInTheDocument();

    // detail panel renders with the new lead-in
    expect(await screen.findByText("Here's the OpenAI Platform brief.")).toBeInTheDocument();

    // postChat was called twice
    expect(postChat).toHaveBeenCalledTimes(2);
  });
});
```

Add `import { BrowserRouter } from 'react-router-dom';` at the top.

- [ ] **Step 2: Run, see fail OR pass**

```bash
pnpm --dir apps/web test AgentChat
```

If failing: review the error and adjust the test fixture / wiring. If passing on first try, the integration is solid.

- [ ] **Step 3: Run full web suite**

```bash
pnpm --dir apps/web test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/AgentChat.test.tsx
git commit -m "test(web): integration test for AgentChat card dispatch + click flow"
```

---

## Phase 7 — Manual Smoke + CI Gate

### Task 7.1: Workspace verify + visual smoke

- [ ] **Step 1: Full pipeline**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Expected: all green. If anything fails, fix and re-run.

- [ ] **Step 2: Manual smoke (run dev server)**

```bash
pnpm --dir apps/web dev
# In another terminal:
pnpm --dir apps/server dev
```

Open `http://localhost:5173/assistant`. Sign in. Run through:

1. "list my briefs" → see lead-in + card list. **No UUIDs visible.** **No tool-call chip.**
2. Click a brief card → user turn "Show me brief: …" appears → detail panel appears.
3. Click "Find candidates →" pill → user turn appears → JobStatus card appears.
4. Wait for the job (or trigger `get_job_status` follow-up). When done, click "Open results →".
5. Click a candidate card → CandidateDetail appears.
6. Click "Approve" → MutationConfirm appears.
7. "show me my contacts" → ContactList → click → ContactDetail. Click "Open LinkedIn ↗" → new tab opens. **No new user turn appears for the external link.**
8. "show me an interview" → InterviewList → click → InterviewDetail with collapsible transcript.
9. Force an error: "show me brief that-doesnt-exist" → ErrorPanel renders inline.
10. Verify all 8 §0 rules: composer always reachable, pills not the only path, transcript is truth, agent voice frames panels, max-w-2xl conform, errors inline, external escape hatches, prose `reply` always rendered.

- [ ] **Step 3: If anything misbehaves visually**, file a follow-up commit. Otherwise:

- [ ] **Step 4: Final commit** (only if any visual tweaks needed; otherwise skip)

```bash
git commit -m "fix(web): visual polish from smoke test"
```

---

## Done

When all phases complete:

- The /assistant chat dispatches every tool result through structured cards.
- Tool-call chips and UUIDs never surface to the user.
- Internal pipeline data (vendor names, raw scrape JSON) is hidden.
- Click on any card or pill produces a visible synthetic user turn → next agent response → next card.
- All 8 chat-first rules from spec §0 hold.
- Coverage ≥ 80% per CLAUDE.md §7.2; lint, typecheck, build all green.
