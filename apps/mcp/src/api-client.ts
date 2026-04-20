import type {
  Brief,
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
    method: 'GET' | 'POST',
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
}
