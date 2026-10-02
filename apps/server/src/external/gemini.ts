import { GoogleGenAI, type FunctionDeclaration, Type } from '@google/genai';
import { AppError } from '../lib/errors';

/**
 * Gemini chat + function-calling adapter.
 *
 * The agent loop in `agent/run-agent.ts` drives this:
 *   1. send messages + tools → Gemini responds with either text OR functionCall
 *   2. if functionCall, the caller executes the tool and appends the result
 *   3. repeat
 *
 * This module exposes one primitive: `geminiChatTurn` — a single request/
 * response with the current message history. Loop orchestration lives above.
 */

export type GeminiMessage =
  | { role: 'user' | 'model'; text: string }
  | { role: 'model'; functionCall: { name: string; args: Record<string, unknown> } }
  | { role: 'user'; functionResponse: { name: string; response: Record<string, unknown> } };

export type GeminiToolDef = {
  name: string;
  description: string;
  /** JSON Schema (Gemini-compatible) for the tool's input. */
  parameters: Record<string, unknown>;
};

export type GeminiTurnResult =
  | { kind: 'text'; text: string; usage: { promptTokens: number; outputTokens: number } }
  | {
      kind: 'tool_call';
      calls: Array<{ name: string; args: Record<string, unknown> }>;
      usage: { promptTokens: number; outputTokens: number };
    };

type GeminiContent = {
  role: 'user' | 'model';
  parts: Array<
    | { text: string }
    | { functionCall: { name: string; args: Record<string, unknown> } }
    | { functionResponse: { name: string; response: Record<string, unknown> } }
  >;
};

function isRetryableGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // SDK throws ApiError; message is a JSON blob that contains a `code` field.
  return /"code"\s*:\s*(429|500|502|503|504)/.test(msg) || /UNAVAILABLE|RESOURCE_EXHAUSTED/.test(msg);
}

async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts: number; initialDelayMs: number },
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === opts.maxAttempts || !isRetryableGeminiError(err)) break;
      const delay = opts.initialDelayMs * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // Re-throw the last error; the error handler will log + surface as upstream 502.
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function toContents(messages: GeminiMessage[]): GeminiContent[] {
  return messages.map((m) => {
    if ('text' in m) return { role: m.role, parts: [{ text: m.text }] };
    if ('functionCall' in m) return { role: 'model', parts: [{ functionCall: m.functionCall }] };
    return { role: 'user', parts: [{ functionResponse: m.functionResponse }] };
  });
}

export async function geminiChatTurn(input: {
  apiKey: string;
  model?: string;
  systemInstruction?: string;
  messages: GeminiMessage[];
  tools: GeminiToolDef[];
}): Promise<GeminiTurnResult> {
  const ai = new GoogleGenAI({ apiKey: input.apiKey });
  const functionDeclarations: FunctionDeclaration[] = input.tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters as unknown as FunctionDeclaration['parameters'],
  }));

  // Retry 503 UNAVAILABLE + 429 RESOURCE_EXHAUSTED with exp backoff —
  // Gemini's flash tier frequently returns transient 503s under load.
  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: input.model ?? 'gemini-2.5-flash',
        contents: toContents(input.messages),
        config: {
          systemInstruction: input.systemInstruction,
          tools: functionDeclarations.length ? [{ functionDeclarations }] : undefined,
          // Disable Gemini 2.5 Flash "thinking" — with tools enabled, thinking
          // budgets > 0 frequently produce an empty candidates[0].content.parts
          // (the model "thought" but emitted no visible output or tool call).
          // 0 makes every response either a text part or a functionCall part.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    { maxAttempts: 4, initialDelayMs: 500 },
  );

  const usage = {
    promptTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
  };

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const calls = parts
    .map((p) => (typeof p === 'object' && p !== null && 'functionCall' in p ? p.functionCall : null))
    .filter((c): c is { name: string; args: Record<string, unknown> } =>
      !!c && typeof c.name === 'string',
    );

  if (calls.length > 0) {
    return { kind: 'tool_call', calls, usage };
  }

  // Prefer the SDK's `response.text` accessor — it concatenates text parts
  // and handles the subtle part shapes (thought parts, inline data, etc.)
  // that our manual walker would miss.
  const text =
    (response as unknown as { text?: string }).text ??
    parts
      .map((p) => (typeof p === 'object' && p !== null && 'text' in p ? p.text : ''))
      .filter(Boolean)
      .join('\n');

  if (!text) {
    // Dump the raw response shape so we can see what actually came back.
    // Common causes: safety-blocked, finishReason=OTHER/MAX_TOKENS, or the
    // API returned a structure we're not parsing.
    process.stderr.write(
      `${JSON.stringify({
        ts: new Date().toISOString(),
        level: 'warn',
        msg: 'gemini empty response',
        finishReason: response.candidates?.[0]?.finishReason,
        promptFeedback: (response as unknown as { promptFeedback?: unknown }).promptFeedback,
        partsLen: parts.length,
        partsKeys: parts.map((p) => (p && typeof p === 'object' ? Object.keys(p) : typeof p)),
        firstPart: parts[0],
      })}\n`,
    );
    throw new AppError('upstream', 'Gemini returned no text and no function calls');
  }

  // Marker so linter doesn't warn about unused import in edge builds.
  void Type;

  return { kind: 'text', text, usage };
}
