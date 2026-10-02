import type {
  CallAnalysis,
  ResearchQuestion,
  TranscriptEntry,
} from '@mirrars/shared';
import { callAnalysisSchema } from '@mirrars/shared';
import { AppError } from '../lib/errors';
import { chatCompletionJson } from '../external/openai';
import { zodToJsonSchema } from './zod-to-json-schema';

/**
 * Post-call transcript analysis via OpenAI chat completions with
 * strict JSON schema output. Returns a CallAnalysis (PMF signals,
 * per-question insights, overall sentiment).
 *
 * Switched from Gemini after frequent 503s; OpenAI's strict
 * structured-output mode also eliminates the markdown-fence /
 * shape-drift class of failures that hit production.
 */

const MODEL = 'gpt-5-mini';

function buildAnalysisPrompt(
  transcript: TranscriptEntry[],
  questions: ResearchQuestion[],
): string {
  const transcriptText = transcript
    .map((e) => `${e.role.toUpperCase()} (${e.timeInCallSecs}s): ${e.message}`)
    .join('\n');
  const qList = questions
    .map((q) => `- id="${q.id}" [${q.category}] ${q.text}`)
    .join('\n');

  return `You analyzed a market research interview transcript. Return STRICT JSON matching the schema below.

## Transcript
${transcriptText}

## Research Questions (use the listed id verbatim when emitting "answers[].questionId")
${qList}

## What to extract
- participant: inferredRole + background (1+ chars each)
- answers: one entry per research question — match "questionId" to the listed ids EXACTLY (do not invent ids). If the interviewee did not address a question, set "response" to "Not addressed" and "sentiment" to "neutral".
- keyInsights: 3–5 bullet-length takeaways (each non-empty)
- productMarketFitSignals: specific quotes/moments suggesting PMF or its absence
- suggestedFollowUps: 2–4 questions worth asking next
- overallSentiment: "positive" | "neutral" | "negative"

Ground every claim in the transcript. Be concise.`;
}

export async function analyzeTranscript(
  apiKey: string,
  transcript: TranscriptEntry[],
  questions: ResearchQuestion[],
): Promise<CallAnalysis> {
  const { data } = await chatCompletionJson<unknown>({
    apiKey,
    model: MODEL,
    prompt: buildAnalysisPrompt(transcript, questions),
    schemaName: 'call_analysis',
    schema: zodToJsonSchema(callAnalysisSchema),
  });
  // OpenAI strict mode enforces the shape server-side, but the schema
  // dialect doesn't carry every Zod constraint (e.g. min(1) on string
  // items). Zod is the final gate.
  const result = callAnalysisSchema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      'upstream',
      `OpenAI analysis JSON failed schema: ${result.error.issues[0]?.message ?? 'unknown'}`,
    );
  }
  return result.data;
}
