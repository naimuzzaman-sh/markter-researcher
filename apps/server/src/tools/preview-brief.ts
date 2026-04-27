import { researchContextSchema } from '@mirrars/shared';
import { z } from 'zod';
import type { Tool } from './types';

const inputSchema = z.object({
  context: researchContextSchema,
});

export const previewBriefTool: Tool<z.infer<typeof inputSchema>> = {
  name: 'preview_brief',
  description:
    'Validate a candidate research context WITHOUT saving. Returns a brief-detail-shaped result with `briefId: null` (since nothing is persisted) and the full `researchContext`, so the UI can render the same detail card it would show after `create_brief`. Follow up with `create_brief` once the user OKs.',
  inputSchema,
  async execute(args) {
    const c = args.context;
    return {
      // Same shape as get_brief for uniform rendering — null briefId
      // signals "draft, not saved" to clients (e.g. BriefDetail hides
      // tool-action pills when briefId is missing).
      briefId: null,
      researchContext: c,
      createdAt: null,
      interviewUrl: null,
      preview: true,
    };
  },
};
