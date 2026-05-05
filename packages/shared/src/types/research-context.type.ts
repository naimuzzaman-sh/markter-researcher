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

const companySchema = z.object({
  name: z.string().min(1),
  industry: z.string().min(1),
  description: z.string().min(1),
});

const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  keyFeatures: z.array(z.string().min(1)).min(1),
  targetAudience: z.string().min(1),
});

const productMarketFitSchema = z.object({
  hypothesis: z.string().min(1),
  signals: z.array(z.string().min(1)),
});

const researchSchema = z.object({
  objective: z.string().min(1),
  questions: z.array(researchQuestionSchema).min(1),
  concerns: z.array(z.string().min(1)),
  productMarketFit: productMarketFitSchema,
});

const interviewSettingsSchema = z.object({
  maxDurationMinutes: z.number().positive(),
  tone: z.string().min(1),
  language: z.string().min(1),
});

const researchContextSchema = z.object({
  company: companySchema,
  product: productSchema,
  research: researchSchema,
  interviewSettings: interviewSettingsSchema,
});

/**
 * Patch schema for PATCH /studies/:id. Every top-level key is optional;
 * within each subtree every field is optional too, so callers can send as
 * little as `{ research: { objective: "new goal" } }`. Arrays (questions,
 * concerns, signals, keyFeatures) are treated as atomic — if present in the
 * patch, they replace the existing array wholesale. Per-item merging is not
 * supported.
 */
const studyPatchSchema = z.object({
  company: companySchema.partial().optional(),
  product: productSchema.partial().optional(),
  research: z
    .object({
      objective: z.string().min(1),
      questions: z.array(researchQuestionSchema).min(1),
      concerns: z.array(z.string().min(1)),
      productMarketFit: productMarketFitSchema.partial(),
    })
    .partial()
    .optional(),
  interviewSettings: interviewSettingsSchema.partial().optional(),
});

type ResearchContext = z.infer<typeof researchContextSchema>;
type ResearchQuestion = z.infer<typeof researchQuestionSchema>;
type QuestionCategory = z.infer<typeof questionCategorySchema>;
type StudyPatch = z.infer<typeof studyPatchSchema>;

export {
  researchContextSchema,
  researchQuestionSchema,
  questionCategorySchema,
  studyPatchSchema,
};
export type { ResearchContext, ResearchQuestion, QuestionCategory, StudyPatch };
