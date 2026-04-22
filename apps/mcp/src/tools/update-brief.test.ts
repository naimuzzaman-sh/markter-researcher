import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ClientCapabilities } from '@modelcontextprotocol/sdk/types.js';
import type { Brief, ResearchContext } from '@market-researcher/shared';
import type { ApiClient } from '../api-client.js';
import { makeUpdateBriefHandler } from './update-brief.js';

const existingContext: ResearchContext = {
  company: { name: 'Acme Inc', industry: 'SaaS', description: 'Form builder' },
  product: {
    name: 'Acme Forms',
    description: 'Drag-and-drop form builder',
    keyFeatures: ['templates', 'conditional logic'],
    targetAudience: 'Ops teams at mid-market SaaS',
  },
  research: {
    objective: 'Understand onboarding pain',
    questions: [
      { id: 'q1', text: 'Q1?', followUp: 'F1?', category: 'background' },
      { id: 'q2', text: 'Q2?', followUp: 'F2?', category: 'pain-points' },
    ],
    concerns: ['pricing'],
    productMarketFit: {
      hypothesis: 'Teams struggle with spreadsheets',
      signals: [],
    },
  },
  interviewSettings: {
    maxDurationMinutes: 15,
    tone: 'friendly',
    language: 'en',
  },
};

const updatedBrief: Brief = {
  id: 'b1',
  researchContext: {
    ...existingContext,
    research: { ...existingContext.research, objective: 'new objective' },
  },
  createdAt: new Date('2026-04-20T12:00:00Z'),
};

function makeServer(overrides: {
  capabilities?: ClientCapabilities;
  elicitResult?: Awaited<
    ReturnType<McpServer['server']['elicitInput']>
  >;
}): { server: McpServer; elicit: ReturnType<typeof vi.fn> } {
  const elicit = vi.fn(
    async () =>
      overrides.elicitResult ?? {
        action: 'accept' as const,
        content: { decision: 'save' },
      },
  );
  const server = {
    server: {
      getClientCapabilities: () => overrides.capabilities,
      elicitInput: elicit,
    },
  } as unknown as McpServer;
  return { server, elicit };
}

function makeClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    getBrief: vi.fn().mockResolvedValue({
      id: 'b1',
      researchContext: existingContext,
      createdAt: new Date('2026-04-20T12:00:00Z'),
    }),
    updateBrief: vi.fn().mockResolvedValue(updatedBrief),
    ...overrides,
  } as unknown as ApiClient;
}

describe('update_brief tool', () => {
  describe('when the client supports elicitation', () => {
    it('asks the user to confirm and applies the patch on "save"', async () => {
      const { server, elicit } = makeServer({
        capabilities: { elicitation: {} },
      });
      const client = makeClient();
      const handler = makeUpdateBriefHandler(
        server,
        client,
        'https://app.example.com',
      );

      const result = await handler({
        briefId: 'b1',
        patch: { research: { objective: 'new objective' } },
      });

      expect(elicit).toHaveBeenCalledTimes(1);
      // The confirmation dialog must reference both the old and new values so
      // the user sees what changes before saving.
      const elicitArgs = elicit.mock.calls[0][0];
      expect(elicitArgs.message).toMatch(/new objective/);
      expect(elicitArgs.message).toMatch(/Understand onboarding pain/);

      expect(client.updateBrief).toHaveBeenCalledWith('b1', {
        research: { objective: 'new objective' },
      });

      const payload = JSON.parse(result.content[0].text);
      expect(payload).toMatchObject({
        briefId: 'b1',
        shareableUrl: 'https://app.example.com/interview/b1',
      });
    });

    it('does NOT apply the patch when the user picks "revise"', async () => {
      const { server } = makeServer({
        capabilities: { elicitation: {} },
        elicitResult: { action: 'accept', content: { decision: 'revise' } },
      });
      const client = makeClient();
      const handler = makeUpdateBriefHandler(
        server,
        client,
        'https://app.example.com',
      );

      const result = await handler({
        briefId: 'b1',
        patch: { research: { objective: 'new objective' } },
      });

      expect(client.updateBrief).not.toHaveBeenCalled();
      expect(result.content[0].text).toMatch(/revise/i);
    });

    it('treats decline/cancel as revise (dismissed dialog keeps iterating)', async () => {
      const { server } = makeServer({
        capabilities: { elicitation: {} },
        elicitResult: { action: 'decline' },
      });
      const client = makeClient();
      const handler = makeUpdateBriefHandler(
        server,
        client,
        'https://app.example.com',
      );

      const result = await handler({
        briefId: 'b1',
        patch: { research: { objective: 'new objective' } },
      });

      expect(client.updateBrief).not.toHaveBeenCalled();
      expect(result.content[0].text).toMatch(/revise/i);
    });
  });

  describe('fallback when the client does not support elicitation', () => {
    it('applies the patch directly and returns the updated brief payload', async () => {
      const { server, elicit } = makeServer({ capabilities: {} });
      const client = makeClient();
      const handler = makeUpdateBriefHandler(
        server,
        client,
        'https://app.example.com',
      );

      const result = await handler({
        briefId: 'b1',
        patch: { research: { objective: 'new objective' } },
      });

      expect(elicit).not.toHaveBeenCalled();
      expect(client.updateBrief).toHaveBeenCalledWith('b1', {
        research: { objective: 'new objective' },
      });

      const payload = JSON.parse(result.content[0].text);
      expect(payload.briefId).toBe('b1');
    });
  });

  it('returns a not-found message when updateBrief yields null', async () => {
    const { server } = makeServer({ capabilities: { elicitation: {} } });
    const client = makeClient({
      updateBrief: vi.fn().mockResolvedValue(null),
    });
    const handler = makeUpdateBriefHandler(
      server,
      client,
      'https://app.example.com',
    );

    const result = await handler({
      briefId: 'missing',
      patch: { research: { objective: 'x' } },
    });

    expect(result.content[0].text).toMatch(/not found|not owned/i);
  });

  it('returns a validation error (without calling the API) for an invalid patch', async () => {
    const { server, elicit } = makeServer({
      capabilities: { elicitation: {} },
    });
    const client = makeClient();
    const handler = makeUpdateBriefHandler(
      server,
      client,
      'https://app.example.com',
    );

    const result = await handler({
      briefId: 'b1',
      // empty objective fails minLength:1
      patch: { research: { objective: '' } },
    });

    expect(elicit).not.toHaveBeenCalled();
    expect(client.updateBrief).not.toHaveBeenCalled();
    expect(result.content[0].text).toMatch(/invalid/i);
  });
});
