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

/**
 * ICP attribute — one concrete dimension of the target audience.
 * `name` and `value` are both free-form so the dimension set adapts
 * to the product's domain (B2B → role/industry/stage, B2C →
 * ageRange/lifeStage/lifestyle, healthcare → condition/stage/etc).
 */
const icpAttributeSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
});

/**
 * Domain-agnostic Ideal Customer Profile. Structured dimensions
 * the agent coaches toward, the discovery engine builds sharp
 * queries from, and the calling agent self-judges concreteness on
 * before invoking `find_candidates`.
 *
 * Required core (audience + problem) is universal. `attributes` is
 * the variable part — the agent picks dimension names that fit how
 * THIS audience naturally describes itself. ≥3 concrete attributes
 * is the soft bar for a "thick enough" ICP.
 */
const icpSchema = z.object({
  /** Who: short audience descriptor. NOT "people" / "users" / "anyone". */
  audience: z.string().min(1),
  /** What pain: the specific problem this audience hits. */
  problem: z.string().min(1),
  /**
   * Concrete attributes that distinguish the audience. Dimension
   * names are domain-driven (role / industry / ageRange / lifeStage
   * / platform / condition / etc — agent picks).
   */
  attributes: z.array(icpAttributeSchema),
  geography: z.string().min(1).optional(),
  /** Observable pain markers ("they tried X and bounced"). */
  signals: z.array(z.string().min(1)).optional(),
  /** Sharpens edge: who this is NOT. */
  excludes: z.array(z.string().min(1)).optional(),
  /**
   * Human-readable one-liner. Template-formatted from the structured
   * fields on every save (no LLM call). Used as the display label on
   * cards and in dashboards.
   */
  summary: z.string().min(1),
});

const productSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  keyFeatures: z.array(z.string().min(1)).min(1),
  /**
   * Structured ICP — the source of truth for "who" and "why". The
   * legacy freeform `targetAudience` string was dropped after every
   * active study was backfilled. `find_candidates` requires this
   * (structurally); the calling agent self-judges concreteness.
   */
  icp: icpSchema,
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
type Icp = z.infer<typeof icpSchema>;
type IcpAttribute = z.infer<typeof icpAttributeSchema>;

export {
  researchContextSchema,
  researchQuestionSchema,
  questionCategorySchema,
  studyPatchSchema,
  icpSchema,
  icpAttributeSchema,
};
export type {
  ResearchContext,
  ResearchQuestion,
  QuestionCategory,
  StudyPatch,
  Icp,
  IcpAttribute,
};
