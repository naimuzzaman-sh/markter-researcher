import { Injectable } from '@nestjs/common';
import { GoogleGenAI, Type } from '@google/genai';
import { randomUUID } from 'crypto';
import {
  researchContextSchema,
  type ResearchContext,
} from '../../types/research-context.type';
import type { ChatMessage, SetupSession } from '../../types/setup-session.type';

const SYSTEM_PROMPT = `You are a research setup assistant. You interview a researcher to understand what they want to learn from their own interviewees, then produce a structured ResearchContext.

## How you behave
- Conversational, warm, concise. 1–2 short questions per turn.
- Skip what's already clear from earlier answers.
- Merge related questions rather than drip-feeding.
- Keep setup under ~2 minutes for a motivated user.

## Completion
- As soon as you have the minimum required fields (product/company, target audience, research objective), offer to proceed: "I have enough to start — should I kick off the interview, or add more detail?"
- When the user confirms, finalize: set done=true and fill in the context field with a complete, valid ResearchContext.
- Generate 4–7 tailored interview questions across categories: background, usage, pain-points, value-proposition, competitor, pricing — pick what fits the research goal.
- Use sensible defaults for things not explicitly discussed (industry can be inferred; concerns/signals arrays can be empty; interviewSettings: maxDurationMinutes=5, tone="friendly-professional", language="en").

## Output format
You MUST always respond as JSON with this shape:
- When still gathering info: { "reply": "<your next short message>", "done": false }
- When finalizing (only after user confirms): { "reply": "<a brief confirmation>", "done": true, "context": { ...full ResearchContext... } }

Never write anything outside the JSON response. The researcher only sees the "reply" field.`;

const QUESTION_CATEGORIES = [
  'background',
  'usage',
  'pain-points',
  'value-proposition',
  'competitor',
  'pricing',
];

/**
 * JSON schema describing every possible Gemini reply. Matches `researchContextSchema`.
 * This is what makes the output reliable — Gemini is forced to conform on every turn.
 */
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: {
      type: Type.STRING,
      description: 'The user-facing message to show the researcher.',
    },
    done: {
      type: Type.BOOLEAN,
      description:
        'true ONLY when you have enough info AND the user has confirmed they want to proceed. Must come with a full context.',
    },
    context: {
      type: Type.OBJECT,
      description:
        'The final ResearchContext. Include only when done=true.',
      properties: {
        company: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            industry: { type: Type.STRING },
            description: { type: Type.STRING },
          },
          required: ['name', 'industry', 'description'],
        },
        product: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            keyFeatures: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            targetAudience: { type: Type.STRING },
          },
          required: ['name', 'description', 'keyFeatures', 'targetAudience'],
        },
        research: {
          type: Type.OBJECT,
          properties: {
            objective: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  text: { type: Type.STRING },
                  followUp: { type: Type.STRING },
                  category: {
                    type: Type.STRING,
                    enum: QUESTION_CATEGORIES,
                  },
                },
                required: ['id', 'text', 'followUp', 'category'],
              },
            },
            concerns: { type: Type.ARRAY, items: { type: Type.STRING } },
            productMarketFit: {
              type: Type.OBJECT,
              properties: {
                hypothesis: { type: Type.STRING },
                signals: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['hypothesis', 'signals'],
            },
          },
          required: ['objective', 'questions', 'concerns', 'productMarketFit'],
        },
        interviewSettings: {
          type: Type.OBJECT,
          properties: {
            maxDurationMinutes: { type: Type.NUMBER },
            tone: { type: Type.STRING },
            language: { type: Type.STRING },
          },
          required: ['maxDurationMinutes', 'tone', 'language'],
        },
      },
    },
  },
  required: ['reply', 'done'],
};

type GeminiTurn = {
  reply?: unknown;
  done?: unknown;
  context?: unknown;
};

@Injectable()
export class SetupService {
  private readonly genai: GoogleGenAI;
  private readonly sessions = new Map<string, SetupSession>();

  constructor(apiKey: string) {
    this.genai = new GoogleGenAI({ apiKey });
  }

  async startSession(): Promise<{ sessionId: string; firstMessage: string }> {
    const sessionId = randomUUID();
    const session: SetupSession = {
      id: sessionId,
      messages: [],
      createdAt: new Date(),
    };
    this.sessions.set(sessionId, session);

    const opening = await this.callGemini(
      `${SYSTEM_PROMPT}\n\n## Current task\nThe researcher just opened the app. Greet them briefly and ask what product or company they want to research. done=false.`,
    );

    const firstMessage =
      opening.reply ||
      'Hi! What product or company would you like to research today?';
    session.messages.push({ role: 'assistant', content: firstMessage });

    return { sessionId, firstMessage };
  }

  async sendMessage(
    sessionId: string,
    userMessage: string,
  ): Promise<{ reply: string; context?: ResearchContext; done: boolean }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.messages.push({ role: 'user', content: userMessage });

    const turn = await this.callGemini(this.buildPrompt(session.messages));
    const reply = turn.reply || '…';
    let context: ResearchContext | undefined;

    if (turn.done && turn.context !== undefined) {
      const validated = researchContextSchema.safeParse(turn.context);
      if (validated.success) {
        context = validated.data;
      }
    }

    session.messages.push({ role: 'assistant', content: reply });

    return {
      reply,
      context,
      done: context !== undefined,
    };
  }

  private buildPrompt(messages: ChatMessage[]): string {
    const history = messages
      .map((m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`)
      .join('\n\n');
    return `${SYSTEM_PROMPT}\n\n## Conversation so far\n${history}\n\nASSISTANT:`;
  }

  /**
   * Single Gemini call returning a parsed JSON turn.
   * Gemini is schema-forced via responseJsonSchema so the output shape is reliable.
   */
  private async callGemini(
    contents: string,
  ): Promise<{ reply: string; done: boolean; context?: unknown }> {
    const response = await this.genai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents,
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: RESPONSE_SCHEMA,
      },
    });

    const text = (response.text ?? '').trim();
    if (!text) {
      return { reply: '', done: false };
    }

    try {
      const parsed = JSON.parse(text) as GeminiTurn;
      return {
        reply: typeof parsed.reply === 'string' ? parsed.reply : '',
        done: parsed.done === true,
        context: parsed.context,
      };
    } catch {
      return { reply: '', done: false };
    }
  }
}
