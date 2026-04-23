import type {
  AgentJob,
  BriefCandidate,
  Brief,
  BriefPatch,
  Contact,
  InterviewDetail,
  InterviewSummary,
  ResearchContext,
} from '@market-researcher/shared';

/**
 * Thin HTTP wrapper around the Market Researcher API. All calls carry the
 * cached user JWT as `Authorization: Bearer <jwt>`; the backend filters by
 * `owner_id = req.user.id` server-side, so the MCP never has to do its
 * own ownership checks.
 *
 * Takes a `getAccessToken` async provider rather than a static string so the
 * MCP's stdio transport can connect immediately and defer the (potentially
 * slow) device-authorization flow until the first tool call. The provider is
 * expected to cache + refresh tokens — we call it on every request, which is
 * effectively free when the provider has a hot cache.
 *
 * Wire shapes here match what the API returns (dates as ISO strings). We
 * reconstruct `Date` objects before handing back to tool code so handlers
 * can format consistently without re-parsing.
 */

type BriefWire = {
  briefId: string;
  researchContext: ResearchContext;
  createdAt: string;
};

type InterviewSummaryWire = {
  interviewId: string;
  briefId: string | null;
  status: 'completed' | 'failed';
  durationSecs: number | null;
  overallSentiment: 'positive' | 'neutral' | 'negative' | null;
  completedAt: string | null;
};

type InterviewDetailWire = {
  interviewId: string;
  briefId: string | null;
  status: 'completed' | 'failed';
  transcript: InterviewDetail['transcript'];
  analysis: InterviewDetail['analysis'];
  durationSecs: number | null;
  completedAt: string | null;
};

export type AccessTokenProvider = () => Promise<string>;

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getAccessToken: AccessTokenProvider,
  ) {}

  private async headers(
    extra?: Record<string, string>,
  ): Promise<HeadersInit> {
    const token = await this.getAccessToken();
    return {
      Authorization: `Bearer ${token}`,
      ...extra,
    };
  }

  private async json<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: await this.headers(
        body ? { 'Content-Type': 'application/json' } : {},
      ),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `${method} ${path} → HTTP ${response.status}${text ? `: ${text}` : ''}`,
      );
    }
    return response.json() as Promise<T>;
  }

  async listBriefs(limit: number): Promise<Brief[]> {
    const rows = await this.json<BriefWire[]>(
      'GET',
      `/briefs?limit=${encodeURIComponent(String(limit))}`,
    );
    return rows.map((r) => ({
      id: r.briefId,
      researchContext: r.researchContext,
      createdAt: new Date(r.createdAt),
    }));
  }

  async getBrief(briefId: string): Promise<Brief | null> {
    try {
      const row = await this.json<BriefWire>(
        'GET',
        `/briefs/${encodeURIComponent(briefId)}`,
      );
      return {
        id: row.briefId,
        researchContext: row.researchContext,
        createdAt: new Date(row.createdAt),
      };
    } catch (err) {
      if (err instanceof Error && /HTTP 404/.test(err.message)) return null;
      throw err;
    }
  }

  async listInterviews(
    briefId: string | undefined,
    limit: number,
  ): Promise<InterviewSummary[]> {
    const params = new URLSearchParams();
    if (briefId) params.set('briefId', briefId);
    params.set('limit', String(limit));
    const rows = await this.json<InterviewSummaryWire[]>(
      'GET',
      `/interviews?${params.toString()}`,
    );
    return rows.map((r) => ({
      interviewId: r.interviewId,
      briefId: r.briefId,
      status: r.status,
      durationSecs: r.durationSecs,
      overallSentiment: r.overallSentiment,
      completedAt: r.completedAt ? new Date(r.completedAt) : null,
    }));
  }

  async getInterview(interviewId: string): Promise<InterviewDetail | null> {
    try {
      const row = await this.json<InterviewDetailWire>(
        'GET',
        `/interviews/${encodeURIComponent(interviewId)}`,
      );
      return {
        interviewId: row.interviewId,
        briefId: row.briefId,
        status: row.status,
        transcript: row.transcript,
        analysis: row.analysis,
        durationSecs: row.durationSecs,
        completedAt: row.completedAt ? new Date(row.completedAt) : null,
      };
    } catch (err) {
      if (err instanceof Error && /HTTP 404/.test(err.message)) return null;
      throw err;
    }
  }

  async createBrief(context: ResearchContext): Promise<{ briefId: string }> {
    return this.json<{ briefId: string }>('POST', '/briefs', { context });
  }

  /**
   * Apply a partial patch to an existing brief. Returns null on 404 (the
   * brief doesn't exist OR isn't owned by the caller — the API collapses
   * both into 404 so we don't leak existence).
   */
  async updateBrief(
    briefId: string,
    patch: BriefPatch,
  ): Promise<Brief | null> {
    try {
      const row = await this.json<BriefWire>(
        'PATCH',
        `/briefs/${encodeURIComponent(briefId)}`,
        { patch },
      );
      return {
        id: row.briefId,
        researchContext: row.researchContext,
        createdAt: new Date(row.createdAt),
      };
       } catch (err) {
      if (err instanceof Error && /HTTP 404/.test(err.message)) return null;
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Discovery / contacts / candidates / agent-jobs (network-lens flow)
  // ---------------------------------------------------------------------------

  async runDiscovery(input: {
    briefId: string;
    limit?: number;
    extraCriteria?: string;
  }): Promise<{ jobId: string }> {
    return this.json<{ jobId: string }>('POST', '/discovery/runs', input);
  }

  async getAgentJob(jobId: string): Promise<AgentJob | null> {
    try {
      const row = await this.json<AgentJobWire>(
        'GET',
        `/agent-jobs/${encodeURIComponent(jobId)}`,
      );
      return wireToAgentJob(row);
    } catch (err) {
      if (err instanceof Error && /HTTP 404/.test(err.message)) return null;
      throw err;
    }
  }

  async listContacts(limit: number): Promise<Contact[]> {
    const rows = await this.json<ContactWire[]>(
      'GET',
      `/contacts?limit=${encodeURIComponent(String(limit))}`,
    );
    return rows.map(wireToContact);
  }

  async getContact(contactId: string): Promise<Contact | null> {
    try {
      const row = await this.json<ContactWire>(
        'GET',
        `/contacts/${encodeURIComponent(contactId)}`,
      );
      return wireToContact(row);
    } catch (err) {
      if (err instanceof Error && /HTTP 404/.test(err.message)) return null;
      throw err;
    }
  }

  async listCandidatesForBrief(
    briefId: string,
    limit: number,
  ): Promise<BriefCandidate[]> {
    const rows = await this.json<CandidateWire[]>(
      'GET',
      `/briefs/${encodeURIComponent(briefId)}/candidates?limit=${encodeURIComponent(String(limit))}`,
    );
    return rows.map(wireToCandidate);
  }

  async getCandidate(candidateId: string): Promise<BriefCandidate | null> {
    try {
      const row = await this.json<CandidateWire>(
        'GET',
        `/candidates/${encodeURIComponent(candidateId)}`,
      );
      return wireToCandidate(row);
    } catch (err) {
      if (err instanceof Error && /HTTP 404/.test(err.message)) return null;
      throw err;
    }
  }

  async approveCandidate(candidateId: string): Promise<BriefCandidate> {
    const row = await this.json<CandidateWire>(
      'POST',
      `/candidates/${encodeURIComponent(candidateId)}/approve`,
    );
    return wireToCandidate(row);
  }

  async rejectCandidate(candidateId: string): Promise<BriefCandidate> {
    const row = await this.json<CandidateWire>(
      'POST',
      `/candidates/${encodeURIComponent(candidateId)}/reject`,
    );
    return wireToCandidate(row);
  }
}

// ---------------------------------------------------------------------------
// Wire shapes + converters for the network-lens endpoints
// ---------------------------------------------------------------------------

type AgentJobWire = {
  jobId: string;
  kind: AgentJob['kind'];
  status: AgentJob['status'];
  input: unknown;
  output: unknown | null;
  error: string | null;
  costUsd: number | null;
  tokensUsed: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

function wireToAgentJob(w: AgentJobWire): AgentJob {
  return {
    id: w.jobId,
    // ownerId is not on the wire (server already scopes by authenticated user)
    // Fill it with the known-good value the server wouldn't return a job for
    // if it weren't ours.
    ownerId: '',
    kind: w.kind,
    status: w.status,
    inputJson: w.input,
    outputJson: w.output,
    error: w.error,
    costUsd: w.costUsd,
    tokensUsed: w.tokensUsed,
    startedAt: w.startedAt ? new Date(w.startedAt) : null,
    finishedAt: w.finishedAt ? new Date(w.finishedAt) : null,
    createdAt: new Date(w.createdAt),
  };
}

type ContactWire = {
  contactId: string;
  name: string;
  linkedinUrl: string | null;
  title: string | null;
  companyName: string | null;
  companyDomain: string | null;
  email: string | null;
  location: string | null;
  profileJson: unknown | null;
  researchNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

function wireToContact(w: ContactWire): Contact {
  return {
    id: w.contactId,
    ownerId: '',
    name: w.name,
    linkedinUrl: w.linkedinUrl,
    title: w.title,
    companyName: w.companyName,
    companyDomain: w.companyDomain,
    email: w.email,
    location: w.location,
    profileJson: w.profileJson,
    researchNotes: w.researchNotes,
    embedding: null,
    createdAt: new Date(w.createdAt),
    updatedAt: new Date(w.updatedAt),
  };
}

type CandidateWire = {
  candidateId: string;
  briefId: string;
  contactId: string;
  status: BriefCandidate['status'];
  source: BriefCandidate['source'];
  matchScore: number | null;
  interviewId: string | null;
  createdAt: string;
  updatedAt: string;
};

function wireToCandidate(w: CandidateWire): BriefCandidate {
  return {
    id: w.candidateId,
    briefId: w.briefId,
    contactId: w.contactId,
    status: w.status,
    source: w.source,
    matchScore: w.matchScore,
    interviewId: w.interviewId,
    createdAt: new Date(w.createdAt),
    updatedAt: new Date(w.updatedAt),
  };
}
