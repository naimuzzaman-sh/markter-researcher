import { GoogleGenAI } from '@google/genai';
import type {
  CallAnalysis,
  ResearchQuestion,
  TranscriptEntry,
} from '@market-researcher/shared';
import { callAnalysisSchema } from '@market-researcher/shared';
import { AppError } from '../lib/errors';

/**
 * Post-call transcript analysis via Gemini.
 * Returns a CallAnalysis (PMF signals, per-question insights, overall sentiment).
 * Uses schema-forced JSON output — Gemini is constrained to return exactly
 * the CallAnalysis shape.
 */

const MODEL = 'gemini-2.5-flash';

function buildAnalysisPrompt(
  transcript: TranscriptEntry[],
  questions: ResearchQuestion[],
): string {
  const transcriptText = transcript
    .map((e) => `${e.role.toUpperCase()} (${e.timeInCallSecs}s): ${e.message}`)
    .join('\n');
  const qList = questions
    .map((q) => `- [${q.category}] ${q.text}`)
    .join('\n');

  return `You analyzed a market research interview transcript. Return STRICT JSON matching the required schema.

## Transcript
${transcriptText}

## Research Questions (for inferred-answer mapping)
${qList}

## What to extract
- participant: inferred role + background from what they said
- answers: one entry per research question, with the interviewee's answer (verbatim when short; paraphrased when long) and a confidence score 0–1
- keyInsights: 3–5 bullet-length standout takeaways
- productMarketFitSignals: list of specific quotes/moments that suggest PMF or lack thereof
- suggestedFollowUps: 2–4 questions worth asking in a follow-up
- overallSentiment: "positive" | "neutral" | "negative"

Be precise. Ground every claim in the transcript.`;
}

export async function analyzeTranscript(
  apiKey: string,
  transcript: TranscriptEntry[],
  questions: ResearchQuestion[],
): Promise<CallAnalysis> {
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: buildAnalysisPrompt(transcript, questions) }] }],
    config: {
      responseMimeType: 'application/json',
    },
  });

  const text = response.text ?? response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!text) {
    throw new AppError('upstream', 'Gemini analysis returned empty response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AppError('upstream', 'Gemini analysis response was not valid JSON');
  }

  const result = callAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    throw new AppError(
      'upstream',
      `Gemini analysis JSON failed schema: ${result.error.issues[0]?.message ?? 'unknown'}`,
    );
  }
  return result.data;
}
