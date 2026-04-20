import { Injectable } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { callAnalysisSchema, type CallAnalysis } from '@market-researcher/shared';
import type { TranscriptEntry } from '@market-researcher/shared';
import type { ResearchQuestion } from '@market-researcher/shared';

@Injectable()
export class AnalysisService {
  private readonly genai: GoogleGenAI;

  constructor(apiKey: string) {
    this.genai = new GoogleGenAI({ apiKey });
  }

  async analyzeTranscript(
    transcript: TranscriptEntry[],
    researchQuestions: ResearchQuestion[],
  ): Promise<CallAnalysis> {
    const transcriptText = transcript
      .map((entry) => `${entry.role}: ${entry.message}`)
      .join('\n');

    const questionsText = researchQuestions
      .map((q) => `- [${q.id}] ${q.text} (Category: ${q.category})`)
      .join('\n');

    const prompt = `You are an expert market research analyst. Analyze the following interview transcript and produce a structured analysis.

## Research Questions Asked
${questionsText}

## Interview Transcript
${transcriptText}

## Instructions
Produce a JSON object with this exact structure:
{
  "participant": {
    "inferredRole": "the participant's job role as inferred from the conversation",
    "background": "brief summary of participant's background"
  },
  "answers": [
    {
      "questionId": "matching question ID from the research questions",
      "questionText": "the question that was asked",
      "response": "summary of participant's response",
      "sentiment": "positive" | "neutral" | "negative"
    }
  ],
  "keyInsights": ["list of key takeaways from the interview"],
  "productMarketFitSignals": ["signals indicating product-market fit or lack thereof"],
  "suggestedFollowUps": ["suggested follow-up questions for future interviews"],
  "overallSentiment": "positive" | "neutral" | "negative"
}

Map answers to the closest research question IDs where applicable. Only include answers for questions that were actually discussed.
Return ONLY the JSON object, no markdown formatting.`;

    const response = await this.genai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text ?? '';
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed: unknown = JSON.parse(cleaned);
    return callAnalysisSchema.parse(parsed);
  }
}
