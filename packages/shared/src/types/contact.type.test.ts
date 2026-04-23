import { describe, it, expect } from 'vitest';
import { contactSchema, contactSummarySchema } from './contact.type';

const validContact = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  ownerId: '11111111-1111-1111-1111-111111111111',
  name: 'Ada Lovelace',
  linkedinUrl: 'https://linkedin.com/in/ada',
  title: 'Principal Engineer',
  companyName: 'Analytical Engines Inc',
  companyDomain: 'analytical-engines.example',
  email: 'ada@example.com',
  location: 'London',
  profileJson: { headline: 'Math + Machines' },
  researchNotes: null,
  embedding: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('contactSchema', () => {
  it('validates a correct contact', () => {
    expect(contactSchema.safeParse(validContact).success).toBe(true);
  });

  it('rejects missing name', () => {
    const { name: _n, ...rest } = validContact;
    void _n;
    expect(contactSchema.safeParse(rest).success).toBe(false);
  });

  it('accepts null email, title, location, company fields', () => {
    const minimal = {
      ...validContact,
      email: null,
      title: null,
      location: null,
      companyName: null,
      companyDomain: null,
      linkedinUrl: null,
    };
    expect(contactSchema.safeParse(minimal).success).toBe(true);
  });

  it('accepts an embedding array', () => {
    const withEmbedding = {
      ...validContact,
      embedding: Array.from({ length: 1536 }, () => 0.1),
    };
    expect(contactSchema.safeParse(withEmbedding).success).toBe(true);
  });

  it('rejects embedding of wrong dimensionality', () => {
    const bad = { ...validContact, embedding: [0.1, 0.2] };
    expect(contactSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects non-URL linkedinUrl when provided', () => {
    const bad = { ...validContact, linkedinUrl: 'not-a-url' };
    expect(contactSchema.safeParse(bad).success).toBe(false);
  });
});

describe('contactSummarySchema', () => {
  it('omits heavy fields but keeps identity', () => {
    const summary = {
      id: validContact.id,
      name: validContact.name,
      title: validContact.title,
      linkedinUrl: validContact.linkedinUrl,
      companyName: null,
    };
    expect(contactSummarySchema.safeParse(summary).success).toBe(true);
  });

  it('rejects if id is missing', () => {
    const { id: _id, ...rest } = {
      id: validContact.id,
      name: validContact.name,
      title: validContact.title,
      linkedinUrl: validContact.linkedinUrl,
      companyName: null,
    };
    void _id;
    expect(contactSummarySchema.safeParse(rest).success).toBe(false);
  });
});
