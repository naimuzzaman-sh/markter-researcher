import { z } from 'zod';

const EMBEDDING_DIMS = 1536;

const contactSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: z.string().min(1),
  linkedinUrl: z.string().url().nullable(),
  title: z.string().nullable(),
  companyName: z.string().nullable(),
  companyDomain: z.string().nullable(),
  email: z.string().email().nullable(),
  location: z.string().nullable(),
  profileJson: z.unknown().nullable(),
  researchNotes: z.string().nullable(),
  embedding: z.array(z.number()).length(EMBEDDING_DIMS).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const contactSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  title: z.string().nullable(),
  linkedinUrl: z.string().url().nullable(),
  companyName: z.string().nullable(),
});

type Contact = z.infer<typeof contactSchema>;
type ContactSummary = z.infer<typeof contactSummarySchema>;

export { contactSchema, contactSummarySchema, EMBEDDING_DIMS };
export type { Contact, ContactSummary };
