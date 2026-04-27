# Dynamic Chat Cards — Design Spec

**Date:** 2026-04-27
**Owner:** AgentChat (`apps/web/src/components/AgentChat.tsx`)
**Status:** approved for implementation

## Problem

The assistant currently dumps entity data as raw markdown — UUIDs, enumerated bullet lists, prose re-narration of every field returned by a tool. Two issues:

1. **Information dump.** When `list_briefs` runs, the agent's reply restates every brief's name, ID, and objective in prose. The user has to scan markdown for what should be a glance-able list.
2. **Internal noise leaks through.** Tool-call chips (`list_briefs · 522ms · ok`) and pipeline detail (vendor names, raw scrape JSON) surface to the user even though they're internal.

The reply needs to be conversational; the *data* needs to be structured.

## §0 — Chat-first principle (HARD CONSTRAINT)

Chat remains the primary interaction model. Cards augment the conversation; they do not replace it.

- The composer is always reachable. No modal cards, no wizard mode, no sticky panels above the input.
- Action pills are shortcuts, not the only path. Every pill action must also be reachable by typing the natural-language equivalent.
- The transcript is the source of truth. Card state never lives outside the conversation. A pill click appears as a visible user turn.
- The agent's voice still frames every panel. The prose `reply` renders above the cards; cards never replace the assistant's sentence.
- Cards conform to the chat column (`max-w-2xl`). No sub-scrollers, no sub-routers, no card that exceeds the message width.
- Errors fold back in: tool failures render as inline `ErrorPanel` within the chat, not as toasts or banners.
- External actions (Open LinkedIn, Email) are escape hatches via `window.open` / `mailto:`. Everything chat-relevant stays in the conversation.
- The assistant's markdown `reply` is rendered as prose. Cards augment, never replace it.

## §1 — Architecture

Client-side **tool-name registry**: a map from `ChatToolCall.name` to a React renderer that takes the typed `result` and an `onPromptSelect` callback.

```ts
type CardRenderer<T = unknown> = (
  result: T,
  onPromptSelect: (text: string) => void,
) => ReactNode;

const registry: Record<string, CardRenderer> = {
  list_briefs:                 BriefList,
  get_brief:                   BriefDetail,
  create_brief:                BriefDetail,        // shows newly created brief
  update_brief:                BriefDetail,
  preview_brief:               BriefDetail,
  list_candidates_for_brief:   CandidateList,
  get_candidate:               CandidateDetail,
  approve_candidate:           MutationConfirm,
  reject_candidate:            MutationConfirm,
  list_contacts:               ContactList,
  get_contact:                 ContactDetail,
  list_interviews:             InterviewList,
  get_interview:               InterviewDetail,
  find_candidates:             JobStatus,
  get_job_status:              JobStatus,
};
```

Server stays untouched except for one prompt edit. Tool results already return clean `@mirrars/shared` types — the registry casts and renders.

## §2 — Data flow

```
user clicks card or pill
    │
    ▼
onPromptSelect("Approve Tania Reyes")     ← natural-language string
    │
    ▼
AgentChat appends synthetic user turn (visible in chat)
    │
    ▼
postChat(messages) → server → agent loop → approve_candidate tool
    │
    ▼
new assistant turn arrives: { reply, toolCalls }
    │
    ▼
AgentChat renders:
  ① reply (prose, 1-line lead-in from agent)
  ② for each toolCall: registry[toolCall.name](toolCall.result, onPromptSelect)
```

External actions (Open LinkedIn, Email) bypass the chat — they call `window.open` or `mailto:` directly without producing a user turn.

## §3 — Component structure

```
apps/web/src/components/agent-cards/
  index.ts                  registry export + dispatch helper
  registry.tsx              { [toolName]: CardRenderer }
  types.ts                  per-tool result type aliases (cast helpers)
  Panel.tsx                 shared primitive (kicker · title · meta · hairline · slot · actions)
  ActionPill.tsx            click → onPromptSelect | window.open | mailto
  StatusPill.tsx            brief / candidate / interview status enum → color
  SentimentPill.tsx         positive/neutral/negative → color
  format-source.ts          (+ .test) candidate source → user-facing label
  format-relative-time.ts   (+ .test) Date → "2 days ago"
  BriefList.tsx     BriefDetail.tsx
  CandidateList.tsx CandidateDetail.tsx
  ContactList.tsx   ContactDetail.tsx
  InterviewList.tsx InterviewDetail.tsx
  JobStatus.tsx
  MutationConfirm.tsx
  EmptyState.tsx
  ErrorPanel.tsx
```

`AgentChat.tsx` modifies in place: drops `ToolCallChip` rendering, adds a registry dispatch loop after the prose paragraph in `MessageRow`.

### Shared primitives

**`Panel`** — every card and detail panel composes this. Slots: `kicker`, `title`, `subtitle`, `body`, `actions`. Default styling matches the existing editorial language (Fraunces serif title, Geist Mono kicker, hairline divider, `max-w-2xl` width-conform).

**`ActionPill`** — three behaviors:
- `prompt: string` → `onPromptSelect(prompt)` (default; produces synthetic user turn)
- `href: string` → `window.open(href, '_blank')` (external links)
- `mailto: string` → `mailto:` (email)

**`StatusPill`** / **`SentimentPill`** — pure functions of enum → color class. No internal state.

## §4 — Card content per entity

### Brief list (`list_briefs`)

Each card:
- kicker: `BRIEF · 0N` + status pill (draft/active/archived)
- title: `product.name`
- subtitle (italic): `${company.name} · ${company.industry}`
- body (2-line clamp): `research.objective`
- meta: `${questions.length} questions${candidateCount ? ` · ${candidateCount} candidates` : ''}` · relative time
- click → `onPromptSelect("Show me brief: ${product.name}")`

### Brief detail (`get_brief`, `create_brief`, `update_brief`, `preview_brief`)

Panel contents (in order):
- kicker: `BRIEF`
- title: `product.name`
- subtitle: `${company.name} · ${company.industry} · created ${relTime}`
- hairline
- field stack (two-column grid for short fields, full-width for long):
  - **OBJECTIVE** (full-width, large) — `research.objective`
  - **TARGET AUDIENCE** — `product.targetAudience`
  - **PRODUCT** — `product.description`
  - **KEY FEATURES** (numbered) — `product.keyFeatures[]`
  - **QUESTIONS · N** (numbered, with category sub-meta and follow-up) — `research.questions[]`
  - **HYPOTHESIS** — `research.productMarketFit.hypothesis` (omit if empty)
  - **PMF SIGNALS** (bulleted) — `research.productMarketFit.signals[]` (omit if empty)
  - **CONCERNS** (bulleted) — `research.concerns[]` (omit if empty)
  - **INTERVIEW** (two-column) — duration, tone, language
- actions:
  - `Find candidates →` (solid) → `"Find candidates for ${product.name}"`
  - `View candidates` → `"List candidates for ${product.name}"`
  - `View interviews` → `"List interviews for ${product.name}"`
  - `Edit brief` → `"Edit brief: ${product.name}"`

For `preview_brief` the kicker reads `BRIEF · PREVIEW` and a single primary action `Create →` triggers `"Create this brief"`.

### Candidate list (`list_candidates_for_brief`)

Each card requires a join: `BriefCandidate × ContactSummary`. The tool already returns a denormalized shape (verify in `apps/server/src/tools/list-candidates-for-brief.ts`); if it doesn't, that's the one tool change needed (return contact summary alongside candidate).

Each card:
- kicker: `CANDIDATE · 0N` + status pill
- title: `contact.name`
- subtitle (italic): `${contact.title} at ${contact.companyName}`
- body (2-line clamp): research notes (or fallback: source label + match score sentence)
- meta: `formatSource(candidate, contact)` · `match ${Math.round(score * 100)}%`
- click → `onPromptSelect("Show me candidate: ${contact.name}")`

### Candidate detail (`get_candidate`)

Panel contents:
- kicker: `CANDIDATE · FOR ${brief.name}`
- title: `contact.name`
- subtitle: `${contact.title} at ${contact.companyName} · ${contact.location}`
- hairline
- field grid (two-column):
  - **STATUS** (pill) | **MATCH SCORE** (`87%`)
  - **SOURCE** (`formatSource(...)`) | **DISCOVERED** (relative time)
- field stack:
  - **RESEARCH NOTES** — `contact.researchNotes`
  - **CONTACT** — `email · /in/${slug}`
- status-conditional actions (always include View contact + View brief at end):
  - `pending_review` → Approve (solid) / Reject (danger) / View contact / View brief
  - `approved` → Mark contacted (solid) / Reject (danger) / View contact / View brief
  - `contacted` → Mark scheduled / Reject / View contact / View brief
  - `scheduled` → Mark interviewed / Reject / View contact / View brief
  - `interviewed` → Open interview (solid) / View contact / View brief
  - `rejected` → Re-approve / View contact / View brief
  - `discovered` → Approve (solid) / Reject (danger) / View contact / View brief

Pill prompts use natural language: `Approve ${name}`, `Reject ${name}`, `Mark ${name} as contacted`, `Show me ${name}'s interview`, `Show me contact: ${name}`, `Show me brief: ${product.name}`.

### Contact list (`list_contacts`)

Each card:
- kicker: `CONTACT · 0N` + a small `LINKEDIN` muted pill if `linkedinUrl`
- title: `name`
- subtitle (italic): `${title} at ${companyName} · ${location}`
- meta: `email` · `added ${relTime}`
- click → `onPromptSelect("Show me contact: ${name}")`

### Contact detail (`get_contact`)

Panel contents:
- kicker: `CONTACT`
- title: `name`
- subtitle: `${title} at ${companyName} · ${location}`
- hairline
- field grid (two-column): EMAIL, LINKEDIN, COMPANY DOMAIN, ADDED
- field stack:
  - **RESEARCH NOTES** — `researchNotes`
  - **USED IN BRIEFS · N** (server may include — if absent, omit the section)
- actions:
  - `Use in new brief` (solid) → `"Use ${name} in a new brief"`
  - `Open LinkedIn ↗` (href) → `window.open(linkedinUrl)`
  - `Email` (mailto) → `mailto:${email}`

`profileJson` is **not** rendered — internal scrape data.

### Interview list (`list_interviews`)

Each card:
- kicker: `INTERVIEW · 0N` + sentiment pill
- title: `${contactName} · ${duration}` (resolve contact name from candidate join, or fall back to `Interview ${index}`)
- subtitle (italic): `on ${brief.name}`
- body (2-line clamp): top key insight (`analysis.keyInsights[0]`) — omit body if no insights
- meta: status pill (completed / failed) · relative completedAt
- click → `onPromptSelect("Show me interview: ${title}")`

### Interview detail (`get_interview`)

Panel contents:
- kicker: `INTERVIEW · ON ${brief.name}`
- title: `${contactName} · ${duration}`
- subtitle: `completed ${relTime} · ${turns} turns`
- hairline
- field grid (two-column): SENTIMENT, STATUS, DURATION, PARTICIPANT ROLE
- field stack:
  - **PARTICIPANT BACKGROUND** — `analysis.participant.background`
  - **KEY INSIGHTS · N** (bulleted) — `analysis.keyInsights[]`
  - **PMF SIGNALS · N** (bulleted) — `analysis.productMarketFitSignals[]`
  - **ANSWERS · N** (numbered with category + per-answer sentiment) — `analysis.answers[]`
  - **SUGGESTED FOLLOW-UPS · N** (bulleted) — `analysis.suggestedFollowUps[]`
  - **TRANSCRIPT · N turns** (collapsible `<details>`) — `transcript[]`
- actions: View brief / View candidate / View contact (composed from joined data; omit any whose target is missing)

### Job status (`find_candidates`, `get_job_status`)

`AgentJob.status` enum: `queued | running | succeeded | failed`. There is no structured progress field — `outputJson` is `unknown`. Keep v1 simple: status + elapsed time, no progress bar.

Panel contents:
- kicker: `JOB · ${kind.toUpperCase()}` (e.g. `JOB · DISCOVERY`)
- title: status sentence (`Sourcing candidates…` for running; `Sourcing complete.` for succeeded; `Job is queued.` for queued)
- subtitle (italic): `${status} · started ${relTime}` (or `queued · just now` if `startedAt` is null)
- field body (small, optional): a single neutral hint when `running` (`"This usually takes a minute or two."`). NO vendor names — never write `"searching Exa"`.
- actions:
  - if `running` or `queued`: `Check status` → `"Check status of the candidate sourcing job"`
  - if `succeeded`: `Open results →` (solid) → `"List candidates for ${brief.name}"`
  - if `failed`: render as `ErrorPanel` instead — show `error` field, recovery pill is `Try again` → `"Retry candidate sourcing for ${brief.name}"`

### Mutation confirmation (`approve_candidate`, `reject_candidate`, `create_brief`, `update_brief`)

Tight panel:
- kicker: `✓ ${verb}` (e.g. `✓ APPROVED`, `✓ CREATED`)
- title: affected entity name
- subtitle: context (`on ${brief.name} · just now`)
- actions: contextual next-step + `View ${entity}`

For `create_brief` / `update_brief` we render the **full** brief detail (same component) — the mutation tool returns a complete `Brief`, so reuse `BriefDetail` and prefix the kicker with `BRIEF · CREATED` / `BRIEF · UPDATED`.

### Empty state

When a list tool returns `[]`:
- kicker: `NOTHING HERE`
- title: contextual (`Start your first brief`, `No interviews yet`, etc.)
- subtitle: nudge sentence
- single solid action: `Create brief →` / `Find candidates →` / etc.

Dashed border, no background.

### Error panel

When `toolCall.error != null`:
- kicker: `⚠ ERROR`
- title: short failure message (`Brief not found`)
- body: server's error string (defensively limited to 280 chars)
- single neutral action: `List briefs` / `Try again` (composed from tool name)

Red-ish border, blush background.

## §5 — Source label derivation

Pure client function:

```ts
function formatSource(
  candidate: Pick<BriefCandidate, 'source'>,
  contact: Pick<ContactSummary, 'linkedinUrl'>,
): string {
  if (candidate.source === 'manual') return 'added manually';
  if (candidate.source === 'import') return 'imported';
  // discovery
  return contact.linkedinUrl ? 'from LinkedIn' : 'from web search';
}
```

Tested with all enum × url-presence combinations.

## §6 — Status / sentiment color mapping

| Enum | Color (Tailwind ref) |
|---|---|
| brief.draft / candidate.discovered / candidate.scheduled | amber-700 |
| brief.active / candidate.approved / candidate.contacted (muted variant) / interview.completed / sentiment.positive | emerald-700 |
| brief.archived / sentiment.neutral | muted-foreground |
| candidate.pending_review | amber-700 |
| candidate.rejected / interview.failed / sentiment.negative | destructive (red) |

Single `pillColor(category, value)` function returns the Tailwind class.

## §7 — Server-side changes

### 7.1 — Prompt edit

Append to `UNIVERSAL_SYSTEM_PROMPT` in `apps/server/src/agent/prompts.ts`:

> When a tool returns a list or single entity, reply with at most one short, conversational sentence framing what was returned. Never enumerate IDs, fields, or descriptions in your reply — the client renders structured cards from the tool result. Use prose only for framing, judgement, and follow-up suggestions.

### 7.2 — Tool denormalization (required for cards to show names)

Two tools currently return raw FK references that the cards need as readable strings. Update return shapes:

- **`list_candidates_for_brief`** — currently returns `BriefCandidate[]` (id, briefId, contactId, status, source, matchScore, interviewId, …). Cards need `contact.name`, `contact.title`, `contact.companyName`, `contact.linkedinUrl`. Update the tool's `execute` to JOIN the contacts table (or do a second query) and return `Array<BriefCandidate & { contact: ContactSummary }>`. Update the tool's `description` accordingly.

- **`list_interviews`** — currently returns `InterviewSummary[]` (interviewId, briefId, status, durationSecs, overallSentiment, completedAt). Cards need `brief.product.name` and `contact.name` (resolved via candidate.interviewId → candidate.contactId → contact). Update the tool's `execute` to join through and return `Array<InterviewSummary & { briefName: string | null; contactName: string | null }>`.

Both changes are additive — existing field names stay; new fields appear alongside. MCP clients that ignore unknown fields are unaffected. Test fixtures in `apps/server/src/tools/*.test.ts` need updates to assert the new fields.

`get_brief`, `get_candidate`, `get_contact`, `get_interview` — already return enough; no change needed.

## §8 — `AgentChat.tsx` modifications

Three changes:

1. **Drop `ToolCallChip`.** Remove the `mb-3 space-y-2` block in `MessageRow` that renders tool chips. Tool calls still flow through props but are now invisible.
2. **Pass `onPromptSelect` prop down.** AgentChat owns `handleSend`; expose a stable callback `(text) => handleSendSynthetic(text)` that appends a user turn with `text` and triggers postChat — same code path as a typed message.
3. **Registry dispatch.** After rendering the prose `<p>` for assistant turns, iterate `turn.toolCalls` and dispatch each through the registry, rendering panels in order.

`Turn` shape stays the same. No new state.

## §9 — Testing (TDD per CLAUDE.md §15)

Co-located `*.test.tsx` per component. Required:

- `format-source.test.ts` — all enum × linkedinUrl combinations
- `format-relative-time.test.ts` — boundary cases (just now / minutes / hours / days / weeks / months)
- `StatusPill.test.tsx` / `SentimentPill.test.tsx` — every enum value renders correct color class
- `Panel.test.tsx` — slots render in order; missing slots collapse cleanly
- `ActionPill.test.tsx` — three behaviors (prompt fires callback; href opens window; mailto opens mail)
- `BriefList.test.tsx` / `BriefDetail.test.tsx` — given a fixture `Brief` from `@mirrars/shared`, every required field is rendered; UUID is never rendered; click triggers `onPromptSelect`
- Same shape for Candidate / Contact / Interview list + detail
- `JobStatus.test.tsx` — running shows Check-status action; succeeded shows Open-results action; failed renders ErrorPanel; queued shows Check-status without started-time
- `MutationConfirm.test.tsx` — kicker reflects verb; affected entity name renders
- `ErrorPanel.test.tsx` — error message clamped to 280 chars; recovery pill present
- `AgentChat.test.tsx` (new) — given a turn with `toolCalls`, renders `reply` prose then registry-dispatched panel; clicking a pill in the panel appends a synthetic user turn and triggers postChat

Coverage target: ≥ 80% statements (CLAUDE.md §7.2).

## §10 — Phasing

Strict TDD per phase. Each phase passes typecheck + lint + test + build before next.

1. **Server prep.** §7.2 — denormalize `list_candidates_for_brief` and `list_interviews` returns. Update tool tests with new fields. Cards downstream consume the new shapes.
2. **Primitives.** `Panel` · `ActionPill` · `StatusPill` · `SentimentPill` · `format-source` · `format-relative-time`. Tests first.
3. **Brief end-to-end.** `BriefList` + `BriefDetail`. Wire registry. Update `AgentChat` to dispatch. Validates the pattern.
4. **Candidate · Contact · Interview** list+detail. Each entity TDD-cycled.
5. **State panels.** `JobStatus` · `MutationConfirm` · `EmptyState` · `ErrorPanel`.
6. **Prompt edit + integration.** §7.1 prompt change. AgentChat integration test.
7. **Manual smoke.** Agent chat with each tool path; visual verification of all eight §0 rules.

## §11 — Out of scope (YAGNI)

- Server-side `view` envelope (approach A from brainstorm). Defer; client registry is sufficient.
- Streaming SSE responses. Current request/response works.
- Card drag/reorder, in-card filters, virtualized lists. Lists are small.
- Deep-linking from a card to `/briefs/:id` route. Chat-only per chat-first principle.
- Optimistic mutation UI. The agent's reply is fast enough; spinner via `isThinking` is enough.

## §12 — Risks

| Risk | Mitigation |
|---|---|
| Agent ignores prompt and enumerates anyway | Accept some drift in v1. If it persists, add client regex redaction (option B from Q6). |
| Tool result shapes differ from `@mirrars/shared` types | Each renderer's first line is a zod parse; failures fall through to a debug `<pre>` only in dev mode (not prod). |
| ~~`list_candidates_for_brief` may not include contact summary~~ | Resolved — tool returns raw `BriefCandidate[]`; §7.2 makes denormalization a required server change. |
| Markdown in `reply` collides with cards | Reply is the assistant's prose voice. If it accidentally contains a fenced JSON block, render as plain text — no markdown processor. |
| Mobile width for two-column field grid | Stack to single column under `sm` breakpoint. |

## §13 — Verification

When implementation lands:

1. Open `/assistant`. Send "list my briefs" — see lead-in + card list. No UUID visible.
2. Click a brief card. See user-turn ("Show me brief: …") + assistant lead-in + brief detail panel.
3. Click "Find candidates →" pill. See user-turn + job-status panel.
4. Wait for job. Click "Open results →". See candidate list.
5. Click "Approve" on a candidate. See user-turn + mutation confirmation + status pill update on subsequent navigations.
6. Click "Open LinkedIn ↗" on a contact detail. New tab opens. No user turn appears (external escape hatch).
7. Send "show me a brief that doesn't exist" — see ErrorPanel inline.

All eight chat-first rules from §0 hold throughout.
