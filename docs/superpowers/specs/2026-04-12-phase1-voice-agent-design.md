# Phase 1: Market Research Voice Agent

## Context

We're building a market research AI agent that conducts voice interviews with users about a product. Phase 1 focuses on getting the core agent right with hardcoded data - no database, no auth, no complex infrastructure. The agent is the heart of the system; we make it perfect first, then build around it.

The product being researched in Phase 1 is the market researcher agent itself (meta-research for dogfooding).

## Architecture Overview

**Monorepo** with pnpm workspaces:
- `apps/api` - NestJS backend (agent orchestration, call management, post-call analysis)
- `apps/web` - React + Vite + Tailwind frontend (minimal call UI)

**External Services:**
- **ElevenLabs Conversational AI** - Voice agent (creates agent per call via REST API, WebRTC audio)
- **Gemini 2.5 Flash** - Post-call transcript analysis only (not the live conversation LLM)

## Data Model

Hardcoded JSON file at `apps/api/src/data/research-context.json`:

```typescript
type ResearchContext = {
  company: {
    name: string;
    industry: string;
    description: string;
  };
  product: {
    name: string;
    description: string;
    keyFeatures: string[];
    targetAudience: string;
  };
  research: {
    objective: string;
    questions: Array<{
      id: string;
      text: string;
      followUp: string;
      category: "background" | "usage" | "pain-points" | "value-proposition" | "competitor" | "pricing";
    }>;
    concerns: string[];
    productMarketFit: {
      hypothesis: string;
      signals: string[];
    };
  };
  interviewSettings: {
    maxDurationMinutes: number;
    tone: string;
    language: string;
  };
};
```

Phase 1 content: researching the market researcher agent itself. Questions cover user background, current market research workflows, pain points, and interest in an AI-powered solution.

## Components

### 1. Agent Module (`apps/api/src/modules/agent/`)

**Responsibility:** Create ElevenLabs agents and build system prompts from research context.

**Prompt Builder** (`prompt-builder.service.ts`):
- Pure function: `buildInterviewPrompt(context: ResearchContext): string`
- Generates a system prompt that instructs the agent to:
  1. Open with a warm greeting, introduce itself as a market researcher
  2. Ask 1-2 background questions (role, industry, current workflows)
  3. Adapt subsequent questions based on the user's background
  4. Cover research questions naturally (conversational, not robotic)
  5. Follow up on interesting responses
  6. Start wrapping up around the 4-minute mark
  7. Close with thanks and ask if they have any questions

**Agent Factory** (`agent-factory.service.ts`):
- Creates an ElevenLabs agent via `POST /v1/convai/agents/create`
- Configures: system prompt (from builder), voice, language, first message
- Returns the agent ID for session creation
- Cleans up (deletes) agents after calls complete

### 2. Call Module (`apps/api/src/modules/call/`)

**Responsibility:** Manage the lifecycle of interview calls.

**Endpoints:**
- `POST /calls/start` - Creates agent, returns agent ID + signed URL for WebRTC
- `GET /calls/:id` - Returns call status, transcript, and analysis (once available)
- `POST /calls/:id/end` - Triggers post-call processing (fetch transcript, run analysis)

**Call Service** (`call.service.ts`):
- Orchestrates: agent creation -> session -> transcript retrieval -> analysis
- Stores call state in-memory (Map) for Phase 1 (no database)
- Tracks: call ID, agent ID, conversation ID, status, transcript, analysis

### 3. Analysis Module (`apps/api/src/modules/analysis/`)

**Responsibility:** Post-call transcript analysis using Gemini 2.5 Flash.

**Analysis Service** (`analysis.service.ts`):
- Takes raw transcript (from ElevenLabs `GET /v1/convai/conversations/{id}`)
- Sends to Gemini 2.5 Flash with structured output prompt
- Returns typed analysis result

**Output Schema:**
```typescript
type CallAnalysis = {
  participant: {
    inferredRole: string;
    background: string;
  };
  answers: Array<{
    questionId: string;
    questionText: string;
    response: string;
    sentiment: "positive" | "neutral" | "negative";
  }>;
  keyInsights: string[];
  productMarketFitSignals: string[];
  suggestedFollowUps: string[];
  overallSentiment: "positive" | "neutral" | "negative";
};
```

### 4. Frontend (`apps/web/`)

**Minimal React page** with:
- "Start Interview" button
- WebRTC audio connection (using `@elevenlabs/react` or `@elevenlabs/client`)
- Call status indicator (connecting / in-progress / ended)
- After call: display the structured analysis results

**Key files:**
- `CallPanel.tsx` - Main component with call controls and status
- Uses ElevenLabs React SDK `useConversation` hook for WebRTC

## Call Flow

```
1. User clicks "Start Interview"
2. Frontend → POST /calls/start
3. Backend:
   a. Reads research-context.json
   b. Builds system prompt via PromptBuilder
   c. Creates ElevenLabs agent via API
   d. Gets signed URL for WebRTC session
   e. Returns { callId, agentId, signedUrl }
4. Frontend connects WebRTC using agentId/signedUrl
5. Interview happens (5 min max, ElevenLabs handles the conversation)
6. Call ends (user hangs up or time limit)
7. Frontend → POST /calls/:id/end
8. Backend:
   a. Fetches conversation transcript from ElevenLabs API
   b. Sends transcript to Gemini 2.5 Flash for analysis
   c. Stores results in-memory
   d. Returns analysis
9. Frontend displays structured analysis
```

## File Structure

```
market-researcher/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── agent/
│   │   │   │   │   ├── agent.module.ts
│   │   │   │   │   ├── agent-factory.service.ts
│   │   │   │   │   ├── agent-factory.service.test.ts
│   │   │   │   │   ├── prompt-builder.service.ts
│   │   │   │   │   └── prompt-builder.service.test.ts
│   │   │   │   ├── call/
│   │   │   │   │   ├── call.module.ts
│   │   │   │   │   ├── call.controller.ts
│   │   │   │   │   ├── call.controller.test.ts
│   │   │   │   │   ├── call.service.ts
│   │   │   │   │   └── call.service.test.ts
│   │   │   │   └── analysis/
│   │   │   │       ├── analysis.module.ts
│   │   │   │       ├── analysis.service.ts
│   │   │   │       └── analysis.service.test.ts
│   │   │   ├── data/
│   │   │   │   └── research-context.json
│   │   │   ├── types/
│   │   │   │   ├── research-context.type.ts
│   │   │   │   └── call-analysis.type.ts
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   └── web/
│       ├── src/
│       │   ├── components/
│       │   │   └── CallPanel.tsx
│       │   ├── lib/
│       │   │   └── api.ts
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── tailwind.config.ts
├── package.json
├── pnpm-workspace.yaml
├── .env.example
├── .gitignore
└── CLAUDE.md
```

## Environment Variables

```
ELEVENLABS_API_KEY=xi_...
GEMINI_API_KEY=...
ELEVENLABS_VOICE_ID=cjVigY5qzO86Huf0OWal  # default, configurable
```

## Dependencies

**apps/api:**
- `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`
- `@elevenlabs/elevenlabs-js` (server SDK for agent CRUD + conversation retrieval)
- `@google/genai` (Gemini SDK)
- `zod` (validation)

**apps/web:**
- `react`, `react-dom`
- `@elevenlabs/react` (WebRTC conversation hook)
- `tailwindcss`, `@tailwindcss/vite`

**Root:**
- `vitest` (testing)
- `typescript`
- `eslint`, `prettier`

## What Phase 1 Does NOT Include

- No database (in-memory storage only)
- No authentication
- No real phone calls (WebRTC browser-to-agent only)
- No user management
- No call recording storage
- No dashboard/analytics
- No multiple concurrent calls handling

## Verification

1. Start the API server (`pnpm --filter api dev`)
2. Start the web app (`pnpm --filter web dev`)
3. Open the web page, click "Start Interview"
4. Have a 5-minute voice conversation with the agent
5. Verify the agent asks about your background first, then adapts
6. After the call, verify structured analysis appears
7. `GET /calls/:id` returns transcript + analysis
8. All tests pass (`pnpm test`)
9. Type check passes (`pnpm typecheck`)
10. Build succeeds (`pnpm build`)
