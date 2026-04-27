import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  geminiChatTurn,
  type GeminiMessage,
  type GeminiToolDef,
} from '../external/gemini';
import { AppError } from '../lib/errors';
import type { Logger } from '../lib/logger';
import { tools as allTools } from '../tools/index';
import type { ToolCtx, ToolRegistry } from '../tools/types';
import {
  type ArtifactRef,
  renderEntitiesInScope,
} from './artifact';

export type ChatTurnInput =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      // Carries the structured "what was on screen" reference from the
      // server's previous reply. Lets the agent resolve "this brief",
      // "her", etc. without re-doing name → id lookups.
      artifactRef?: ArtifactRef;
    };

export type ToolCallRecord = {
  name: string;
  args: Record<string, unknown>;
  result: unknown | null;
  error: string | null;
  durationMs: number;
};

export type AgentResult = {
  finalText: string;
  toolCalls: ToolCallRecord[];
  usage: { promptTokens: number; outputTokens: number };
};

type RunInput = {
  ctx: ToolCtx;
  systemPrompt: string;
  messages: ChatTurnInput[];
  logger: Logger;
  tools?: ToolRegistry;
  maxIterations?: number;
};

/**
 * Recursively strip/rewrite JSON Schema fields Gemini's
 * function-declaration parser rejects. Gemini uses an OpenAPI-3.0-ish
 * subset — notably it does NOT accept Draft-7's numeric `exclusiveMinimum`
 * or `exclusiveMaximum`. We convert them to plain `minimum`/`maximum`
 * and drop other unsupported meta fields.
 */
function sanitizeSchemaForGemini(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeSchemaForGemini);
  if (node === null || typeof node !== 'object') return node;

  const src = node as Record<string, unknown>;

  // First handle Draft-7 / OpenAPI3 exclusive-bound representations both:
  //   - OpenAPI3:   `minimum: 0, exclusiveMinimum: true`   → `minimum: 1` (assume integer)
  //   - Draft-7:    `exclusiveMinimum: 0`                  → `minimum: 1`
  let minimum = src.minimum;
  let maximum = src.maximum;
  const exMin = src.exclusiveMinimum;
  const exMax = src.exclusiveMaximum;
  if (exMin === true && typeof minimum === 'number') minimum = minimum + 1;
  if (typeof exMin === 'number') minimum = exMin + 1;
  if (exMax === true && typeof maximum === 'number') maximum = maximum - 1;
  if (typeof exMax === 'number') maximum = exMax - 1;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    // Drop fields Gemini doesn't understand.
    if (
      key === '$schema' ||
      key === 'definitions' ||
      key === '$ref' ||
      key === 'exclusiveMinimum' ||
      key === 'exclusiveMaximum' ||
      key === 'additionalProperties'
    ) {
      continue;
    }
    if (key === 'minimum') {
      out.minimum = minimum;
      continue;
    }
    if (key === 'maximum') {
      out.maximum = maximum;
      continue;
    }
    out[key] = sanitizeSchemaForGemini(value);
  }
  return out;
}

function toGeminiTools(registry: ToolRegistry): GeminiToolDef[] {
  return Object.values(registry).map((t) => {
    const full = zodToJsonSchema(t.inputSchema, { target: 'openApi3' });
    const sanitized = sanitizeSchemaForGemini(full) as Record<string, unknown>;
    return {
      name: t.name,
      description: t.description,
      parameters: sanitized,
    };
  });
}

function toGeminiMessages(history: ChatTurnInput[]): GeminiMessage[] {
  return history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    text: m.content,
  }));
}

/**
 * Build the dynamic system instruction: caller's static system prompt
 * plus an "Entities in scope" block assembled from the structured
 * artifact references on prior assistant turns. Agent uses these IDs as
 * authoritative when the user references entities vaguely.
 */
function buildSystemInstruction(
  staticPrompt: string,
  history: ChatTurnInput[],
): string {
  const refs = history
    .filter((m): m is ChatTurnInput & { role: 'assistant'; artifactRef: ArtifactRef } =>
      m.role === 'assistant' && !!m.artifactRef,
    )
    .map((m) => m.artifactRef);
  const block = renderEntitiesInScope(refs);
  if (!block) return staticPrompt;
  return `${staticPrompt}\n\n${block}`;
}

/**
 * Core agent loop. Streams Gemini turns, dispatches tool calls through the
 * shared tool registry, appends results as `functionResponse` parts, and
 * stops when Gemini emits a text-only response (or max iterations hit).
 */
export async function runAgent(input: RunInput): Promise<AgentResult> {
  const registry = input.tools ?? allTools;
  const geminiTools = toGeminiTools(registry);
  const systemInstruction = buildSystemInstruction(
    input.systemPrompt,
    input.messages,
  );
  const conversation: GeminiMessage[] = toGeminiMessages(input.messages);
  const toolCalls: ToolCallRecord[] = [];
  let totalPrompt = 0;
  let totalOutput = 0;
  const maxIters = input.maxIterations ?? 10;

  for (let iter = 0; iter < maxIters; iter++) {
    const turn = await geminiChatTurn({
      apiKey: input.ctx.config.geminiApiKey,
      systemInstruction,
      messages: conversation,
      tools: geminiTools,
    });
    totalPrompt += turn.usage.promptTokens;
    totalOutput += turn.usage.outputTokens;

    if (turn.kind === 'text') {
      return {
        finalText: turn.text,
        toolCalls,
        usage: { promptTokens: totalPrompt, outputTokens: totalOutput },
      };
    }

    // tool_call: execute every requested call, append results, loop.
    for (const call of turn.calls) {
      const tool = registry[call.name];
      const started = Date.now();
      conversation.push({ role: 'model', functionCall: call });

      if (!tool) {
        const message = `Unknown tool: ${call.name}`;
        input.logger.warn(message);
        toolCalls.push({
          name: call.name,
          args: call.args,
          result: null,
          error: message,
          durationMs: Date.now() - started,
        });
        conversation.push({
          role: 'user',
          functionResponse: { name: call.name, response: { error: message } },
        });
        continue;
      }

      try {
        const parsed = tool.inputSchema.parse(call.args);
        const result = await tool.execute(parsed, input.ctx);
        toolCalls.push({
          name: call.name,
          args: call.args,
          result,
          error: null,
          durationMs: Date.now() - started,
        });
        conversation.push({
          role: 'user',
          functionResponse: {
            name: call.name,
            response: { result: result as Record<string, unknown> },
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        input.logger.warn(`Tool ${call.name} failed`, { err });
        toolCalls.push({
          name: call.name,
          args: call.args,
          result: null,
          error: message,
          durationMs: Date.now() - started,
        });
        conversation.push({
          role: 'user',
          functionResponse: { name: call.name, response: { error: message } },
        });
      }
    }
  }

  throw new AppError(
    'internal',
    `Agent exceeded ${maxIters} iterations without producing a final response`,
  );
}
