import { z } from 'zod';
import { listBriefsByOwner } from '../db/briefs';
import { listInterviewsByOwner } from '../db/interviews';
import type { Tool } from './types';

const inputSchema = z.object({});

type DashboardOutput = {
  empty: boolean;
  counts: { briefs: number; candidates: number; interviews: number };
  pendingByBrief: Array<{ briefId: string; briefName: string; count: number }>;
  recentBriefs: Array<{
    briefId: string;
    productName: string;
    companyName: string;
    createdAt: string;
  }>;
  recentInterviews: Array<{
    interviewId: string;
    briefId: string | null;
    briefName: string | null;
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
    'Researcher home snapshot: total counts of briefs/candidates/interviews, the pending-review candidate queue grouped by brief, the 3 most recent briefs, and the 3 most recent interviews. Returns `empty: true` when the user has no briefs yet (onboarding state).',
  inputSchema,
  async execute(_args, ctx): Promise<DashboardOutput> {
    const { supabase, userId } = ctx;

    // Counts — head:true so Postgrest returns count without payload.
    const [briefCountRes, candidateCountRes, interviewCountRes] = await Promise.all([
      supabase
        .from('briefs')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', userId),
      supabase
        .from('brief_candidates')
        .select('id, briefs!inner(owner_id)', { count: 'exact', head: true })
        .eq('briefs.owner_id', userId),
      supabase
        .from('interviews')
        .select('id, briefs!inner(owner_id)', { count: 'exact', head: true })
        .eq('briefs.owner_id', userId),
    ]);

    const counts = {
      briefs: briefCountRes.count ?? 0,
      candidates: candidateCountRes.count ?? 0,
      interviews: interviewCountRes.count ?? 0,
    };

    // Pending review queue — fetch then group client-side.
    type PendingRow = {
      brief_id: string;
      briefs: { research_context?: { product?: { name?: string } } | null }
        | { research_context?: { product?: { name?: string } } | null }[]
        | null;
    };
    const { data: pendingRowsRaw } = await supabase
      .from('brief_candidates')
      .select('brief_id, briefs!inner(owner_id, research_context)')
      .eq('briefs.owner_id', userId)
      .eq('status', 'pending_review');
    const pendingRows = (pendingRowsRaw ?? []) as unknown as PendingRow[];

    const grouped = new Map<string, { briefName: string; count: number }>();
    for (const row of pendingRows) {
      const briefMeta = Array.isArray(row.briefs) ? row.briefs[0] : row.briefs;
      const briefName = briefMeta?.research_context?.product?.name ?? '';
      const existing = grouped.get(row.brief_id);
      if (existing) {
        existing.count += 1;
      } else {
        grouped.set(row.brief_id, { briefName, count: 1 });
      }
    }
    // Largest queue first — that's where the user's attention should go.
    const pendingByBrief = Array.from(grouped.entries())
      .map(([briefId, v]) => ({ briefId, briefName: v.briefName, count: v.count }))
      .sort((a, b) => b.count - a.count);

    // Recent briefs (top 3 by createdAt desc — listBriefsByOwner already orders).
    const briefs = await listBriefsByOwner(supabase, userId, 3);
    const recentBriefs = briefs.map((b) => ({
      briefId: b.id,
      productName: b.researchContext.product?.name ?? '',
      companyName: b.researchContext.company?.name ?? '',
      createdAt: b.createdAt.toISOString(),
    }));

    // Recent interviews (top 3, completed/failed across all briefs).
    const interviews = await listInterviewsByOwner(supabase, userId, undefined, 3);
    const recentInterviews = interviews.map((iv) => ({
      interviewId: iv.interviewId,
      briefId: iv.briefId,
      briefName: iv.briefName,
      contactName: iv.contactName,
      status: iv.status,
      durationSecs: iv.durationSecs,
      completedAt: iv.completedAt ? iv.completedAt.toISOString() : null,
    }));

    return {
      empty: counts.briefs === 0,
      counts,
      pendingByBrief,
      recentBriefs,
      recentInterviews,
    };
  },
};
