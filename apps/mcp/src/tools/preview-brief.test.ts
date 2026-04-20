import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ClientCapabilities } from '@modelcontextprotocol/sdk/types.js';
import type { ResearchContext } from '@market-researcher/shared';
import type { ApiClient } from '../api-client.js';
import { makePreviewBriefHandler } from './preview-brief.js';

const validContext: ResearchContext = {
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
    productMarketFit: { hypothesis: 'Teams struggle with spreadsheets', signals: [] },
  },
  interviewSettings: {
    maxDurationMinutes: 15,
    tone: 'friendly',
    language: 'en',
  },
};

function makeServer(overrides: {
  capabilities?: ClientCapabilities;
  elicitResult?: Awaited<
    ReturnType<McpServer['server']['elicitInput']>
  >;
  elicitThrow?: Error;
}): { server: McpServer; elicit: ReturnType<typeof vi.fn> } {
  const elicit = vi.fn(async () => {
    if (overrides.elicitThrow) throw overrides.elicitThrow;
    return (
      overrides.elicitResult ?? {
        action: 'accept' as const,
        content: { decision: 'save' },
      }
    );
  });
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
    createBrief: vi.fn().mockResolvedValue({ briefId: 'b-new' }),
    ...overrides,
  } as unknown as ApiClient;
}

describe('preview_brief tool', () => {
  describe('when the client supports elicitation', () => {
    it('asks the user to confirm and creates the brief on "save"', async () => {
      const { server, elicit } = makeServer({
        capabilities: { elicitation: {} },
        elicitResult: { action: 'accept', content: { decision: 'save' } },
      });
      const client = makeClient();
      const handler = makePreviewBriefHandler(
        server,
        client,
        'https://app.example.com',
      );

      const result = await handler({ context: validContext });

      // It called elicitation with the summary in the message.
      expect(elicit).toHaveBeenCalledTimes(1);
      const elicitArgs = elicit.mock.calls[0][0];
      expect(elicitArgs.message).toMatch(/Acme Forms/);
      expect(elicitArgs.requestedSchema.properties.decision.enum).toEqual([
        'save',
        'revise',
      ]);
      expect(
        elicitArgs.requestedSchema.properties.decision.enumNames,
      ).toEqual(['Save brief', 'Revise brief']);

      // It wrote the brief.
      expect(client.createBrief).toHaveBeenCalledWith(validContext);

      // Response carries briefId + URL.
      const payload = JSON.parse(result.content[0].text);
      expect(payload).toEqual({
        briefId: 'b-new',
        shareableUrl: 'https://app.example.com/interview/b-new',
      });
    });

    it('does NOT create the brief when the user picks "revise" and tells Claude to iterate', async () => {
      const { server } = makeServer({
        capabilities: { elicitation: {} },
        elicitResult: { action: 'accept', content: { decision: 'revise' } },
      });
      const createBrief = vi.fn();
      const client = makeClient({ createBrief });
      const handler = makePreviewBriefHandler(
        server,
        client,
        'https://app.example.com',
      );

      const result = await handler({ context: validContext });
      expect(createBrief).not.toHaveBeenCalled();
      const text = result.content[0].text;
      expect(text).toMatch(/revise/i);
      // Must instruct Claude to re-invoke preview_brief after edits, and NOT to call create_brief.
      expect(text).toMatch(/preview_brief/);
      expect(text).toMatch(/do not call/i);
    });

    it('treats decline/cancel actions as revise (dismissed dialog → keep iterating)', async () => {
      const { server } = makeServer({
        capabilities: { elicitation: {} },
        elicitResult: { action: 'decline' },
      });
      const createBrief = vi.fn();
      const client = makeClient({ createBrief });
      const handler = makePreviewBriefHandler(
        server,
        client,
        'https://app.example.com',
      );

      const result = await handler({ context: validContext });
      expect(createBrief).not.toHaveBeenCalled();
      expect(result.content[0].text).toMatch(/revise/i);
    });
  });

  describe('fallback when the client does not support elicitation', () => {
    it('returns the formatted summary and hints at create_brief', async () => {
      const { server, elicit } = makeServer({ capabilities: {} });
      const createBrief = vi.fn();
      const client = makeClient({ createBrief });
      const handler = makePreviewBriefHandler(
        server,
        client,
        'https://app.example.com',
      );

      const result = await handler({ context: validContext });

      expect(elicit).not.toHaveBeenCalled();
      expect(createBrief).not.toHaveBeenCalled();

      const text = result.content[0].text;
      expect(text).toMatch(/Acme Forms/);
      expect(text).toMatch(/create_brief/);
    });
  });

  it('returns a validation error (without calling elicitation or the API) for bad input', async () => {
    const { server, elicit } = makeServer({
      capabilities: { elicitation: {} },
    });
    const createBrief = vi.fn();
    const client = makeClient({ createBrief });
    const handler = makePreviewBriefHandler(
      server,
      client,
      'https://app.example.com',
    );

    const result = await handler({
      context: { company: { name: 'Only a name' } } as unknown as ResearchContext,
    });

    expect(elicit).not.toHaveBeenCalled();
    expect(createBrief).not.toHaveBeenCalled();
    expect(result.content[0].text).toMatch(/invalid/i);
  });
});
