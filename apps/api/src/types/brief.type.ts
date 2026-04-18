import { z } from 'zod';
import { researchContextSchema } from './research-context.type';

const briefSchema = z.object({
  id: z.string().min(1),
  researchContext: researchContextSchema,
  createdAt: z.date(),
});

type Brief = z.infer<typeof briefSchema>;

export { briefSchema };
export type { Brief };
