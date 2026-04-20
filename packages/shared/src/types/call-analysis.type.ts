import { z } from 'zod';

const sentimentSchema = z.enum(['positive', 'neutral', 'negative']);

const callAnalysisSchema = z.object({
  participant: z.object({
    inferredRole: z.string().min(1),
    background: z.string().min(1),
  }),
  answers: z.array(
    z.object({
      questionId: z.string().min(1),
      questionText: z.string().min(1),
      response: z.string().min(1),
      sentiment: sentimentSchema,
    }),
  ),
  keyInsights: z.array(z.string().min(1)),
  productMarketFitSignals: z.array(z.string()),
  suggestedFollowUps: z.array(z.string()),
  overallSentiment: sentimentSchema,
});

type CallAnalysis = z.infer<typeof callAnalysisSchema>;
type Sentiment = z.infer<typeof sentimentSchema>;

export { callAnalysisSchema, sentimentSchema };
export type { CallAnalysis, Sentiment };
