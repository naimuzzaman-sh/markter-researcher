import { researchContextSchema } from '@market-researcher/shared';
import { z } from 'zod';
import type { Tool } from './types';

const inputSchema = z.object({
  context: researchContextSchema,
});

export const previewBriefTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'preview_brief',
  description:
    'Validate a candidate research context WITHOUT saving. Returns the parsed context + a `summary` for the user to confirm. Follow up with `create_brief` once the user OKs.',
  inputSchema,
  async execute(args) {
    const c = args.context;
    return {
      valid: true,
      summary: {
        product: c.product.name,
        company: c.company.name,
        objective: c.research.objective,
        targetAudience: c.product.targetAudience,
        questionCount: c.research.questions.length,
        maxDurationMinutes: c.interviewSettings.maxDurationMinutes,
      },
      context: c,
    };
  },
};
