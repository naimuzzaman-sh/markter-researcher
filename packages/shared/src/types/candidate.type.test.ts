import { describe, it, expect } from 'vitest';
import {
  studyCandidateSchema,
  candidateStatusSchema,
  candidateSourceSchema,
} from './candidate.type';

const validCandidate = {
  id: '22222222-2222-2222-2222-222222222222',
  studyId: '33333333-3333-3333-3333-333333333333',
  contactId: '44444444-4444-4444-4444-444444444444',
  status: 'discovered' as const,
  source: 'discovery' as const,
  matchScore: 0.87,
  interviewId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('candidateStatusSchema', () => {
  it('accepts all defined statuses', () => {
    const statuses = [
      'discovered',
      'pending_review',
      'approved',
      'contacted',
      'scheduled',
      'interviewed',
      'rejected',
    ];
    for (const s of statuses) {
      expect(candidateStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  it('rejects unknown status', () => {
    expect(candidateStatusSchema.safeParse('won').success).toBe(false);
  });
});

describe('candidateSourceSchema', () => {
  it('accepts discovery, manual, import', () => {
    for (const s of ['discovery', 'manual', 'import']) {
      expect(candidateSourceSchema.safeParse(s).success).toBe(true);
    }
  });
});

describe('studyCandidateSchema', () => {
  it('validates a correct candidate', () => {
    expect(studyCandidateSchema.safeParse(validCandidate).success).toBe(true);
  });

  it('allows interviewId when scheduled', () => {
    const scheduled = {
      ...validCandidate,
      status: 'scheduled' as const,
      interviewId: '55555555-5555-5555-5555-555555555555',
    };
    expect(studyCandidateSchema.safeParse(scheduled).success).toBe(true);
  });

  it('rejects missing studyId', () => {
    const { studyId: _sid, ...rest } = validCandidate;
    void _sid;
    expect(studyCandidateSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects matchScore above 1', () => {
    expect(
      studyCandidateSchema.safeParse({ ...validCandidate, matchScore: 1.2 })
        .success,
    ).toBe(false);
  });

  it('rejects matchScore below 0', () => {
    expect(
      studyCandidateSchema.safeParse({ ...validCandidate, matchScore: -0.1 })
        .success,
    ).toBe(false);
  });

  it('allows null matchScore', () => {
    expect(
      studyCandidateSchema.safeParse({ ...validCandidate, matchScore: null })
        .success,
    ).toBe(true);
  });
});
