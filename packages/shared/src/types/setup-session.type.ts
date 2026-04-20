import { z } from 'zod';

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
});

const setupSessionSchema = z.object({
  id: z.string().min(1),
  messages: z.array(chatMessageSchema),
  createdAt: z.date(),
});

type ChatMessage = z.infer<typeof chatMessageSchema>;
type SetupSession = z.infer<typeof setupSessionSchema>;

export { chatMessageSchema, setupSessionSchema };
export type { ChatMessage, SetupSession };
