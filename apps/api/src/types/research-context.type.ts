import { z } from 'zod';

const questionCategorySchema = z.enum([
  'background',
  'usage',
  'pain-points',
  'value-proposition',
  'competitor',
  'pricing',
]);

const researchQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  followUp: z.string().min(1),
  category: questionCategorySchema,
});

const researchContextSchema = z.object({
  company: z.object({
    name: z.string().min(1),
    industry: z.string().min(1),
    description: z.string().min(1),
  }),
  product: z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    keyFeatures: z.array(z.string().min(1)).min(1),
    targetAudience: z.string().min(1),
  }),
  research: z.object({
    objective: z.string().min(1),
    questions: z.array(researchQuestionSchema).min(1),
    concerns: z.array(z.string().min(1)),
    productMarketFit: z.object({
      hypothesis: z.string().min(1),
      signals: z.array(z.string().min(1)),
    }),
  }),
  interviewSettings: z.object({
    maxDurationMinutes: z.number().positive(),
    tone: z.string().min(1),
    language: z.string().min(1),
  }),
});

type ResearchContext = z.infer<typeof researchContextSchema>;
type ResearchQuestion = z.infer<typeof researchQuestionSchema>;
type QuestionCategory = z.infer<typeof questionCategorySchema>;

export {
  researchContextSchema,
  researchQuestionSchema,
  questionCategorySchema,
};
export type { ResearchContext, ResearchQuestion, QuestionCategory };
