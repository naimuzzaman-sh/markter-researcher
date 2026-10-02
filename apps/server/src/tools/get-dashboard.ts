import { z } from 'zod';
import { listStudiesByOwner } from '../db/studies';
import { listInterviewsByOwner } from '../db/interviews';
import type { Tool } from './types';

const inputSchema = z.object({});

type DashboardOutput = {
  empty: boolean;
  counts: { studies: number; candidates: number; interviews: number };
  pendingByStudy: Array<{ studyId: string; studyName: string; count: number }>;
  recentStudies: Array<{
    studyId: string;
    productName: string;
    companyName: string;
    status: 'draft' | 'active';
    createdAt: string;
  }>;
  recentInterviews: Array<{
    interviewId: string;
    studyId: string | null;
    studyName: string | null;
    contactName: string | null;
    status: 'completed' | 'failed';
    durationSecs: number | null;
    completedAt: string | null;
  }>;
};

/**
 * One-shot orientation snapshot for the researcher's "home" experience.
 * AgentChat fires this on mount; the agent can also call it directly
 * when the user asks "what's going on" / "what's pending".
 *
 * Owner-scoped throughout. Counts via head-only Postgrest; pending
 * candidates grouped client-side after a single inner-join fetch (no
 * Postgres group-by from the JS client without RPC; client-side group
 * is fine at our scale).
 */
export const getDashboardTool: Tool<z.infer<typeof inputSchema>, DashboardOutput> = {
  name: 'get_dashboard',
  description:
    'Researcher home snapshot: total counts of studies/candidates/interviews, the pending-review candidate queue grouped by study, the 3 most recent studies, and the 3 most recent interviews. Returns `empty: true` when the user has no studies yet (onboarding state).',
  inputSchema,
  async execute(_args, ctx): Promise<DashboardOutput> {
    const { supabase, userId } = ctx;

    // Counts — head:true so Postgrest returns count without payload.
    const [studyCountRes, candidateCountRes, interviewCountRes] = await Promise.all([
      supabase
        .from('studies')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId),
      supabase
        .from('study_candidates')
        .select('id, studies!inner(owner_id)', { count: 'exact', head: true })
        .eq('studies.owner_id', userId),
      supabase
        .from('interviews')
        .select('id, studies!inner(owner_id)', { count: 'exact', head: true })
        .eq('studies.owner_id', userId),
    ]);

    const counts = {
      studies: studyCountRes.count ?? 0,
      candidates: candidateCountRes.count ?? 0,
      interviews: interviewCountRes.count ?? 0,
    };

    // Pending review queue — fetch then group client-side.
    type PendingRow = {
      study_id: string;
      studies: { research_context?: { product?: { name?: string } } | null }
        | { research_context?: { product?: { name?: string } } | null }[]
        | null;
    };
    const { data: pendingRowsRaw } = await supabase
      .from('study_candidates')
      .select('study_id, studies!inner(owner_id, research_context)')
      .eq('studies.owner_id', userId)
      .eq('status', 'pending_review');
    const pendingRows = (pendingRowsRaw ?? []) as unknown as PendingRow[];

    const grouped = new Map<string, { studyName: string; count: number }>();
    for (const row of pendingRows) {
      const studyMeta = Array.isArray(row.studies) ? row.studies[0] : row.studies;
      const studyName = studyMeta?.research_context?.product?.name ?? '';
      const existing = grouped.get(row.study_id);
      if (existing) {
        existing.count += 1;
      } else {
        grouped.set(row.study_id, { studyName, count: 1 });
      }
    }
    // Largest queue first — that's where the user's attention should go.
    const pendingByStudy = Array.from(grouped.entries())
      .map(([studyId, v]) => ({ studyId, studyName: v.studyName, count: v.count }))
      .sort((a, b) => b.count - a.count);

    // Recent studies (top 3 by createdAt desc — listStudiesByOwner already orders).
    const studies = await listStudiesByOwner(supabase, userId, 3);
    const recentStudies = studies.map((b) => ({
      studyId: b.id,
      productName: b.researchContext.product?.name ?? '',
      companyName: b.researchContext.company?.name ?? '',
      status: b.status,
      createdAt: b.createdAt.toISOString(),
    }));

    // Recent interviews (top 3, completed/failed across all studies).
    const interviews = await listInterviewsByOwner(supabase, userId, undefined, 3);
    const recentInterviews = interviews.map((iv) => ({
      interviewId: iv.interviewId,
      studyId: iv.studyId,
      studyName: iv.studyName,
      contactName: iv.contactName,
      status: iv.status,
      durationSecs: iv.durationSecs,
      completedAt: iv.completedAt ? iv.completedAt.toISOString() : null,
    }));

    return {
      empty: counts.studies === 0,
      counts,
      pendingByStudy,
      recentStudies,
      recentInterviews,
    };
  },
};
