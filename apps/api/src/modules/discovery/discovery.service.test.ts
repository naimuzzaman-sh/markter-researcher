import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiscoveryService } from './discovery.service';
import type { AgentJobsService } from '../agent-jobs/agent-jobs.service';
import type { ContactsService } from '../contacts/contacts.service';
import type { CandidatesService } from '../candidates/candidates.service';
import type { BriefsService } from '../briefs/briefs.service';
import type { OpenAIEmbeddingsService } from '../ai-providers/openai-embeddings.service';
import type { ExaService } from '../ai-providers/exa.service';
import type { AgentJob, Brief, Contact } from '@market-researcher/shared';

const OWNER = 'user-1';
const BRIEF_ID = 'brief-1';
const JOB_ID = 'job-1';

const fakeBrief: Brief = {
  id: BRIEF_ID,
  researchContext: {
    company: { name: 'Co', industry: 'fintech', description: 'desc' },
    product: {
      name: 'P',
      description: 'd',
      keyFeatures: ['a'],
      targetAudience: 'cfos at mid-market banks',
    },
    research: {
      objective: 'o',
      questions: [
        { id: 'q1', text: 'Q?', followUp: 'F?', category: 'background' },
      ],
      concerns: [],
      productMarketFit: { hypothesis: 'h', signals: [] },
    },
    interviewSettings: {
      maxDurationMinutes: 15,
      tone: 'friendly',
      language: 'en',
    },
  },
  createdAt: new Date(),
};

const fakeJob: AgentJob = {
  id: JOB_ID,
  ownerId: OWNER,
  kind: 'discovery',
  status: 'running',
  inputJson: { briefId: BRIEF_ID, limit: 5 },
  outputJson: null,
  error: null,
  costUsd: null,
  tokensUsed: null,
  startedAt: new Date(),
  finishedAt: null,
  createdAt: new Date(),
};

const fakeContact: Contact = {
  id: 'c-1',
  ownerId: OWNER,
  name: 'Ada Lovelace',
  linkedinUrl: 'https://linkedin.com/in/ada',
  title: 'CFO',
  companyName: 'Analytical Bank',
  companyDomain: null,
  email: null,
  location: null,
  profileJson: null,
  researchNotes: null,
  embedding: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('DiscoveryService', () => {
  let service: DiscoveryService;
  let agentJobs: AgentJobsService;
  let contacts: ContactsService;
  let candidates: CandidatesService;
  let briefs: BriefsService;
  let embeddings: OpenAIEmbeddingsService;
  let exa: ExaService;

  beforeEach(() => {
    agentJobs = {
      enqueue: vi.fn().mockResolvedValue({ id: JOB_ID }),
      claimNext: vi.fn().mockResolvedValue(fakeJob),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    } as unknown as AgentJobsService;

    contacts = {
      upsertByLinkedIn: vi.fn().mockResolvedValue(fakeContact),
    } as unknown as ContactsService;

    candidates = {
      createCandidate: vi.fn().mockResolvedValue({ id: 'cand-1' }),
    } as unknown as CandidatesService;

    briefs = {
      getBrief: vi.fn().mockResolvedValue(fakeBrief),
    } as unknown as BriefsService;

    embeddings = {
      embed: vi
        .fn()
        .mockResolvedValue({
          embedding: Array.from({ length: 1536 }, () => 0.1),
          tokens: 42,
        }),
    } as unknown as OpenAIEmbeddingsService;

    exa = {
      search: vi.fn().mockResolvedValue([
        {
          title: 'Ada Lovelace - CFO at Analytical Bank | LinkedIn',
          url: 'https://linkedin.com/in/ada',
          text: 'CFO with 10 years of fintech experience',
          author: null,
          score: 0.92,
        },
        {
          title: 'Analytical Bank | LinkedIn',
          url: 'https://linkedin.com/company/analytical-bank', // company page — skip
          text: null,
          author: null,
          score: 0.41,
        },
      ]),
    } as unknown as ExaService;

    service = new DiscoveryService(
      agentJobs,
      contacts,
      candidates,
      briefs,
      embeddings,
      exa,
    );
  });

  describe('enqueue', () => {
    it('creates an agent_jobs row and kicks off execution', async () => {
      const result = await service.enqueue(
        { briefId: BRIEF_ID, limit: 5 },
        OWNER,
      );
      expect(result.jobId).toBe(JOB_ID);
      expect(agentJobs.enqueue).toHaveBeenCalledWith({
        ownerId: OWNER,
        kind: 'discovery',
        input: { briefId: BRIEF_ID, limit: 5 },
      });
    });

    it('rejects when the brief does not exist', async () => {
      briefs.getBrief = vi.fn().mockResolvedValue(null);
      await expect(
        service.enqueue({ briefId: 'missing', limit: 5 }, OWNER),
      ).rejects.toThrow(/Brief not found/);
      expect(agentJobs.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('execute', () => {
    it('searches EXA with the target audience, skips non-profile URLs, and records candidates', async () => {
      await service.execute(JOB_ID);

      expect(exa.search).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('cfos at mid-market banks'),
          includeDomains: ['linkedin.com'],
          numResults: 5,
        }),
      );
      expect(contacts.upsertByLinkedIn).toHaveBeenCalledTimes(1);
      expect(candidates.createCandidate).toHaveBeenCalledTimes(1);
      expect(candidates.createCandidate).toHaveBeenCalledWith(
        expect.objectContaining({
          briefId: BRIEF_ID,
          contactId: 'c-1',
          source: 'discovery',
          status: 'pending_review',
        }),
      );
      expect(agentJobs.complete).toHaveBeenCalledWith(
        JOB_ID,
        expect.objectContaining({
          output: {
            candidateCount: 1,
            skipped: 1,
            errors: 0,
            errorSamples: [],
          },
        }),
      );
    });

    it('captures a failure on the job row when the brief is gone', async () => {
      briefs.getBrief = vi.fn().mockResolvedValue(null);
      await service.execute(JOB_ID);
      expect(agentJobs.fail).toHaveBeenCalledWith(
        JOB_ID,
        expect.stringContaining('Brief not found'),
      );
    });

    it('captures a failure on the job row when EXA throws', async () => {
      exa.search = vi.fn().mockRejectedValue(new Error('EXA down'));
      await service.execute(JOB_ID);
      expect(agentJobs.fail).toHaveBeenCalledWith(JOB_ID, 'EXA down');
    });

    it('is a no-op when no queued job is available', async () => {
      agentJobs.claimNext = vi.fn().mockResolvedValue(null);
      await service.execute(JOB_ID);
      expect(exa.search).not.toHaveBeenCalled();
      expect(agentJobs.complete).not.toHaveBeenCalled();
      expect(agentJobs.fail).not.toHaveBeenCalled();
    });

    it('continues after a single result fails and records errors', async () => {
      // Make the first (valid) result's upsert throw, second is already skipped.
      contacts.upsertByLinkedIn = vi.fn().mockRejectedValue(new Error('boom'));
      await service.execute(JOB_ID);
      expect(agentJobs.complete).toHaveBeenCalledWith(
        JOB_ID,
        expect.objectContaining({
          output: expect.objectContaining({
            candidateCount: 0,
            skipped: 1,
            errors: 1,
            errorSamples: expect.arrayContaining([
              expect.stringContaining('boom'),
            ]),
          }),
        }),
      );
    });
  });
});
