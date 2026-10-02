import { z } from 'zod';
import { listStudiesByOwner } from '../db/studies';
import { buildInterviewUrl } from '../lib/interview-url';
import type { Tool } from './types';

const inputSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
});

type Output = Array<{
  studyId: string;
  productName: string;
  companyName: string;
  industry: string;
  objective: string;
  questionCount: number;
  status: 'draft' | 'active';
  createdAt: string;
  interviewUrl: string;
}>;

export const listStudiesTool: Tool<z.infer<typeof inputSchema>, Output> = {
  name: 'list_studies',
  description:
    "List the current user's research studies, newest first. Each item is a summary: studyId, productName, companyName, industry, the research objective, the number of interview questions, the lifecycle `status` (`draft` for studies still being assembled, `active` for promoted ones ready for discovery + interviews), and `interviewUrl` (`/interview/<studyId>`) for sharing. Use to browse — for the full research_context + chat history + aggregated `results`, follow up with `get_study({ studyId })`.",
  inputSchema,
  async execute(args, ctx): Promise<Output> {
    const studies = await listStudiesByOwner(ctx.supabase, ctx.userId, args.limit ?? 20);
    return studies.map((b) => ({
      studyId: b.id,
      productName: b.researchContext.product?.name ?? '',
      companyName: b.researchContext.company?.name ?? '',
      industry: b.researchContext.company?.industry ?? '',
      objective: b.researchContext.research?.objective ?? '',
      questionCount: b.researchContext.research?.questions?.length ?? 0,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
      interviewUrl: buildInterviewUrl(ctx.config.webOrigin, b.id),
    }));
  },
};
