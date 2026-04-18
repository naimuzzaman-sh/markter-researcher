import { Injectable } from '@nestjs/common';
import { PromptBuilderService } from './prompt-builder.service';
import type { ResearchContext } from '../../types/research-context.type';

type AgentFactoryConfig = {
  apiKey: string;
  voiceId: string;
};

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1/convai';

@Injectable()
export class AgentFactoryService {
  constructor(
    private readonly promptBuilder: PromptBuilderService,
    private readonly config: AgentFactoryConfig,
  ) {}

  async createAgent(context: ResearchContext): Promise<string> {
    const systemPrompt = this.promptBuilder.buildInterviewPrompt(context);

    // We intentionally do NOT set conversation.max_duration_seconds here.
    // On some ElevenLabs plans, values above the workspace ceiling cause LiveKit
    // to reject the session immediately after connect ("WebSocket CLOSING/CLOSED").
    // The dashboard-configured ceiling is safer; we nudge pacing through the prompt.
    const body = {
      conversation_config: {
        agent: {
          prompt: {
            prompt: systemPrompt,
          },
          first_message: `Hi there! Thanks for taking the time to chat with me today. I'm conducting a quick research interview on behalf of ${context.company.name} — it should only take about ${context.interviewSettings.maxDurationMinutes} minutes. Shall we get started?`,
          language: context.interviewSettings.language,
        },
        tts: {
          voice_id: this.config.voiceId,
        },
        turn: {
          // Default is 7s — too eager; interviewees pausing to think get re-prompted.
          turn_timeout: 12,
          // -1 disables auto-hangup on silence so a thoughtful pause can't end the call.
          silence_end_call_timeout: -1,
        },
      },
    };

    const response = await fetch(`${ELEVENLABS_API_BASE}/agents/create`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create ElevenLabs agent: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = (await response.json()) as { agent_id: string };
    return data.agent_id;
  }

  async deleteAgent(agentId: string): Promise<void> {
    await fetch(`${ELEVENLABS_API_BASE}/agents/${agentId}`, {
      method: 'DELETE',
      headers: {
        'xi-api-key': this.config.apiKey,
      },
    });
  }
}

export type { AgentFactoryConfig };
