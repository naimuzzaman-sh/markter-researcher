import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentFactoryService } from './agent-factory.service';
import { PromptBuilderService } from './prompt-builder.service';
import type { ResearchContext } from '../../types/research-context.type';

const testContext: ResearchContext = {
  company: {
    name: 'TestCo',
    industry: 'SaaS',
    description: 'A test company',
  },
  product: {
    name: 'TestProduct',
    description: 'A test product',
    keyFeatures: ['Feature A'],
    targetAudience: 'Developers',
  },
  research: {
    objective: 'Test objective',
    questions: [
      {
        id: 'q1',
        text: 'Test question?',
        followUp: 'Test follow-up?',
        category: 'background',
      },
    ],
    concerns: ['Concern 1'],
    productMarketFit: {
      hypothesis: 'Test hypothesis',
      signals: ['Signal 1'],
    },
  },
  interviewSettings: {
    maxDurationMinutes: 5,
    tone: 'friendly',
    language: 'en',
  },
};

const mockFetch = vi.fn();

describe('AgentFactoryService', () => {
  let service: AgentFactoryService;
  let promptBuilder: PromptBuilderService;

  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = mockFetch;
    promptBuilder = new PromptBuilderService();
    service = new AgentFactoryService(promptBuilder, {
      apiKey: 'test-api-key',
      voiceId: 'test-voice-id',
    });
  });

  it('should create an agent and return the agent ID', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ agent_id: 'agent-123' }),
    });

    const agentId = await service.createAgent(testContext);
    expect(agentId).toBe('agent-123');
  });

  it('should call ElevenLabs API with correct endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ agent_id: 'agent-123' }),
    });

    await service.createAgent(testContext);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.elevenlabs.io/v1/convai/agents/create',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'xi-api-key': 'test-api-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('should include system prompt in the request body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ agent_id: 'agent-123' }),
    });

    await service.createAgent(testContext);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(callBody.conversation_config.agent.prompt.prompt).toContain('TestProduct');
  });

  it('should include voice configuration', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ agent_id: 'agent-123' }),
    });

    await service.createAgent(testContext);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(callBody.conversation_config.tts.voice_id).toBe('test-voice-id');
  });

  it('should include first message', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ agent_id: 'agent-123' }),
    });

    await service.createAgent(testContext);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(callBody.conversation_config.agent.first_message).toBeTruthy();
  });

  it('should throw on API error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid API key',
    });

    await expect(service.createAgent(testContext)).rejects.toThrow('Failed to create ElevenLabs agent');
  });

  it('should delete an agent', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await service.deleteAgent('agent-123');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.elevenlabs.io/v1/convai/agents/agent-123',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          'xi-api-key': 'test-api-key',
        }),
      }),
    );
  });
});
