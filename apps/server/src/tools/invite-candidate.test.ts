import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '../config';

vi.mock('../db/candidates', () => ({
  getCandidateWithOwner: vi.fn(),
  updateCandidateStatus: vi.fn(),
}));
vi.mock('../db/contacts', () => ({
  getContactById: vi.fn(),
}));
vi.mock('../db/studies', () => ({
  getStudyById: vi.fn(),
}));
vi.mock('../external/resend', () => ({
  sendInterviewInvite: vi.fn(),
}));

import { inviteCandidateTool } from './invite-candidate';
import { getCandidateWithOwner, updateCandidateStatus } from '../db/candidates';
import { getContactById } from '../db/contacts';
import { getStudyById } from '../db/studies';
import { sendInterviewInvite } from '../external/resend';

const cfg: Config = {
  port: 3001,
  nodeEnv: 'test',
  webOrigins: ['http://localhost:5173'],
  webOrigin: 'https://app.example.com',
  supabaseUrl: 'x',
  supabaseAnonKey: 'x',
  geminiApiKey: 'x',
  exaApiKey: 'x',
  openaiApiKey: 'x',
  elevenlabsApiKey: 'x',
  elevenlabsVoiceId: 'x',
  elevenlabsWebhookSecret: 'x',
  resendApiKey: 'rkey',
  resendFromEmail: 'noreply@example.com',
  resendWebhookSecret: '',
};

const supabase = {} as SupabaseClient;
const ownerId = 'u1';

const baseCandidate = {
  id: 'cand1',
  studyId: 'b1',
  contactId: 'cont1',
  status: 'approved' as const,
  source: 'discovery' as const,
  matchScore: 0.8,
  interviewId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseContact = {
  id: 'cont1',
  ownerId,
  name: 'Tania',
  linkedinUrl: 'https://linkedin.com/in/tania',
  title: 'Founder',
  companyName: 'Acme',
  companyDomain: null,
  email: 'tania@acme.com',
  location: null,
  profileJson: null,
  researchNotes: null,
  embedding: null,
  emailStatus: 'unknown' as const,
  emailStatusAt: null,
  emailStatusReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const baseStudy = {
  id: 'b1',
  ownerId,
  researchContext: {
    company: { name: 'Acme', industry: 'fintech', description: '' },
    product: {
      name: 'Acme Pay',
      description: '',
      keyFeatures: [],
      icp: {
        audience: 'SMB owners',
        problem: 'manual reconciliation',
        attributes: [{ name: 'companySize', value: '1-50' }],
        summary: 'SMB owners — 1-50 — manual reconciliation',
      },
    },
    research: { objective: '', questions: [], concerns: [], productMarketFit: {} },
    interviewSettings: { maxDurationMinutes: 30, tone: 'friendly', language: 'en' },
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.mocked(getCandidateWithOwner)
    .mockReset()
    .mockResolvedValue({ candidate: baseCandidate, studyOwnerId: ownerId } as never);
  vi.mocked(getContactById).mockReset().mockResolvedValue(baseContact as never);
  vi.mocked(getStudyById).mockReset().mockResolvedValue(baseStudy as never);
  vi.mocked(sendInterviewInvite)
    .mockReset()
    .mockResolvedValue({ id: 'em_1' });
  vi.mocked(updateCandidateStatus)
    .mockReset()
    .mockResolvedValue({ ...baseCandidate, status: 'contacted' } as never);
});

const ctxOf = (extra: Partial<{ userEmail: string | null }> = {}) => ({
  userId: ownerId,
  userEmail: 'researcher@me.com',
  supabase,
  config: cfg,
  ...extra,
});

describe('inviteCandidateTool', () => {
  it('owner-gates via the candidate row', async () => {
    vi.mocked(getCandidateWithOwner).mockResolvedValue({
      candidate: baseCandidate,
      studyOwnerId: 'someone-else',
    } as never);
    await expect(
      inviteCandidateTool.execute({ candidateId: baseCandidate.id }, ctxOf()),
    ).rejects.toThrow(/not found/i);
  });

  it('rejects when contact has no email', async () => {
    vi.mocked(getContactById).mockResolvedValue({ ...baseContact, email: null } as never);
    await expect(
      inviteCandidateTool.execute({ candidateId: baseCandidate.id }, ctxOf()),
    ).rejects.toThrow(/email on file/);
    expect(vi.mocked(sendInterviewInvite)).not.toHaveBeenCalled();
  });

  it("refuses to re-send when candidate is already 'contacted'", async () => {
    vi.mocked(getCandidateWithOwner).mockResolvedValue({
      candidate: { ...baseCandidate, status: 'contacted' },
      studyOwnerId: ownerId,
    } as never);
    await expect(
      inviteCandidateTool.execute({ candidateId: baseCandidate.id }, ctxOf()),
    ).rejects.toThrow(/already been invited/);
    expect(vi.mocked(sendInterviewInvite)).not.toHaveBeenCalled();
  });

  it('refuses to send when contact previously hard-bounced', async () => {
    vi.mocked(getContactById).mockResolvedValue({
      ...baseContact,
      emailStatus: 'bounced',
      emailStatusReason: 'Mailbox does not exist',
    } as never);
    await expect(
      inviteCandidateTool.execute({ candidateId: baseCandidate.id }, ctxOf()),
    ).rejects.toThrow(/hard-bounced/);
    expect(vi.mocked(sendInterviewInvite)).not.toHaveBeenCalled();
  });

  it("refuses to send when contact previously marked us as spam", async () => {
    vi.mocked(getContactById).mockResolvedValue({
      ...baseContact,
      emailStatus: 'complained',
    } as never);
    await expect(
      inviteCandidateTool.execute({ candidateId: baseCandidate.id }, ctxOf()),
    ).rejects.toThrow(/marked us as spam/);
  });

  it("uses researcher's email as Reply-To and a stable idempotency key", async () => {
    await inviteCandidateTool.execute({ candidateId: baseCandidate.id }, ctxOf());
    const arg = vi.mocked(sendInterviewInvite).mock.calls[0][0];
    expect(arg.replyTo).toBe('researcher@me.com');
    expect(arg.idempotencyKey).toBe(`invite-${baseCandidate.id}`);
    expect(arg.to).toBe(baseContact.email);
    expect(arg.from).toBe(cfg.resendFromEmail);
  });

  it('falls back to RESEND_FROM_EMAIL when userEmail is null (e.g. MCP)', async () => {
    await inviteCandidateTool.execute(
      { candidateId: baseCandidate.id },
      ctxOf({ userEmail: null }),
    );
    const arg = vi.mocked(sendInterviewInvite).mock.calls[0][0];
    expect(arg.replyTo).toBe(cfg.resendFromEmail);
  });

  it("flips candidate status to 'contacted' on successful send", async () => {
    await inviteCandidateTool.execute({ candidateId: baseCandidate.id }, ctxOf());
    expect(vi.mocked(updateCandidateStatus)).toHaveBeenCalledWith(
      supabase,
      baseCandidate.id,
      'contacted',
    );
  });

  it('returns the wire shape the candidate.mutation card expects', async () => {
    const out = await inviteCandidateTool.execute(
      { candidateId: baseCandidate.id },
      ctxOf(),
    );
    expect(out.status).toBe('contacted');
    expect(out.contact?.email).toBe(baseContact.email);
    expect(out.interviewUrl).toContain(`?cid=${baseCandidate.id}`);
  });
});
