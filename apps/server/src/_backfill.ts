/**
 * One-shot backfill script. Delete this file after running.
 *
 * Three passes:
 *   0. False-failure recovery — earlier `endCall` code marked an
 *      interview as `failed` whenever the post-call analysis threw
 *      (e.g. transient Gemini 503). The transcript was still saved.
 *      Flip those rows back to `completed` so they show up correctly
 *      and get summarized.
 *
 *   1. Per-interview analysis — for every completed interview that
 *      has a non-empty transcript but `analysis IS NULL`, re-run
 *      `analyzeTranscript` and write the result back. Idempotent:
 *      already-analyzed rows are skipped. Picks up rows recovered
 *      in pass 0.
 *
 *   2. Per-brief synthesis — for every brief that has at least one
 *      completed interview, run `summarizeBrief` to compute (or
 *      refresh) `briefs.results`.
 *
 * Run from repo root:
 *   pnpm --filter server exec tsx src/_backfill.ts
 *
 * Reads .env via dotenv (same path the server uses on dev).
 */

import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadConfig } from './config';
import { analyzeTranscript } from './agent/analyze-transcript';
import { summarizeBrief } from './agent/summarize-brief';
import type { CallAnalysis, ResearchContext, TranscriptEntry } from '@mirrars/shared';

// Load env from BOTH locations: apps/server/.env (server-scoped keys)
// and the monorepo root .env (where SUPABASE_SERVICE_ROLE_KEY lives,
// because the running server doesn't need it). Local takes precedence
// — root only fills gaps.
loadDotenv({ path: path.resolve(process.cwd(), '.env') });
loadDotenv({ path: path.resolve(process.cwd(), '../../.env') });

async function main() {
  const config = loadConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error(
      '✗ SUPABASE_SERVICE_ROLE_KEY is not set. The backfill needs the\n' +
        '  service role to bypass RLS for cross-owner reads/writes. Copy\n' +
        '  it from the root .env (or Supabase dashboard → Project Settings\n' +
        '  → API → service_role) into apps/server/.env and re-run.',
    );
    process.exit(1);
  }
  // Service role bypasses RLS — appropriate for an offline backfill.
  // Persistence off so the script doesn't try to write a token cookie
  // somewhere weird.
  const supabase = createClient(config.supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ─────────────────── Pass 0: recover false failures ───────────────────
  console.log('▶ pass 0: recovering interviews falsely marked as failed');

  type FailedRow = {
    id: string;
    transcript: TranscriptEntry[] | null;
  };

  const { data: failedRows, error: failedListErr } = await supabase
    .from('interviews')
    .select('id, transcript')
    .eq('status', 'failed');
  if (failedListErr) {
    console.error('  ✗ failed to list failed interviews:', failedListErr.message);
    process.exit(1);
  }
  const failedCandidates = (failedRows ?? []) as FailedRow[];
  console.log(`  found ${failedCandidates.length} interview(s) marked failed`);

  let recovered = 0;
  let actuallyFailed = 0;
  for (const row of failedCandidates) {
    const transcript = row.transcript ?? [];
    if (transcript.length === 0) {
      // Genuinely failed — empty transcript means the call never produced
      // content. Leave it alone.
      actuallyFailed += 1;
      continue;
    }
    const { error: updateErr } = await supabase
      .from('interviews')
      .update({ status: 'completed' })
      .eq('id', row.id);
    if (updateErr) {
      console.warn(`  ⚠  ${row.id}: status update failed —`, updateErr.message);
      continue;
    }
    recovered += 1;
    console.log(`  ✓  ${row.id}: failed → completed (transcript intact)`);
  }
  console.log(
    `  pass 0 done — ${recovered} recovered, ${actuallyFailed} legitimately failed (kept)`,
  );

  // ───────────────────────── Pass 1: analyses ─────────────────────────
  console.log('\n▶ pass 1: backfilling per-interview analyses');

  type InterviewRow = {
    id: string;
    brief_id: string;
    transcript: TranscriptEntry[] | null;
    research_context: ResearchContext | null;
  };

  const { data: missing, error: listErr } = await supabase
    .from('interviews')
    .select('id, brief_id, transcript, research_context')
    .eq('status', 'completed')
    .is('analysis', null);
  if (listErr) {
    console.error('  ✗ failed to list interviews:', listErr.message);
    process.exit(1);
  }
  const rows = (missing ?? []) as InterviewRow[];
  console.log(`  found ${rows.length} interview(s) without analysis`);

  let analysesWritten = 0;
  let analysesSkipped = 0;
  let analysesFailed = 0;
  for (const row of rows) {
    const transcript = row.transcript ?? [];
    if (transcript.length === 0) {
      console.log(`  ⏭  ${row.id}: empty transcript, skip`);
      analysesSkipped += 1;
      continue;
    }
    const questions = row.research_context?.research?.questions ?? [];
    if (questions.length === 0) {
      console.log(`  ⏭  ${row.id}: no questions in research_context, skip`);
      analysesSkipped += 1;
      continue;
    }

    let analysis: CallAnalysis;
    try {
      analysis = await analyzeTranscript(config.geminiApiKey, transcript, questions);
    } catch (err) {
      console.warn(`  ⚠  ${row.id}: analyzeTranscript failed —`, err instanceof Error ? err.message : err);
      analysesFailed += 1;
      continue;
    }

    const { error: updateErr } = await supabase
      .from('interviews')
      .update({ analysis })
      .eq('id', row.id);
    if (updateErr) {
      console.warn(`  ⚠  ${row.id}: update failed —`, updateErr.message);
      analysesFailed += 1;
      continue;
    }
    analysesWritten += 1;
    console.log(`  ✓  ${row.id}: analysis written`);
  }
  console.log(
    `  pass 1 done — ${analysesWritten} written, ${analysesSkipped} skipped, ${analysesFailed} failed`,
  );

  // ──────────────────────── Pass 2: brief summaries ────────────────────────
  console.log('\n▶ pass 2: backfilling per-brief summaries');

  const { data: briefIdRows, error: briefListErr } = await supabase
    .from('interviews')
    .select('brief_id')
    .eq('status', 'completed')
    .not('brief_id', 'is', null);
  if (briefListErr) {
    console.error('  ✗ failed to list brief_ids:', briefListErr.message);
    process.exit(1);
  }
  const briefIds = Array.from(
    new Set(
      (briefIdRows ?? [])
        .map((r) => (r as { brief_id: string | null }).brief_id)
        .filter((id): id is string => typeof id === 'string'),
    ),
  );
  console.log(`  found ${briefIds.length} brief(s) with completed interviews`);

  let summariesWritten = 0;
  let summariesFailed = 0;
  for (const briefId of briefIds) {
    try {
      const result = await summarizeBrief({
        apiKey: config.geminiApiKey,
        supabase,
        briefId,
      });
      if (result) {
        summariesWritten += 1;
        console.log(`  ✓  ${briefId}: synthesis (${result.interviewCount} interview(s))`);
      } else {
        console.log(`  ⏭  ${briefId}: no completed interviews after filter, skip`);
      }
    } catch (err) {
      summariesFailed += 1;
      console.warn(`  ⚠  ${briefId}: summarizeBrief failed —`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`  pass 2 done — ${summariesWritten} written, ${summariesFailed} failed`);

  console.log('\n✓ backfill complete. delete src/_backfill.ts when done.');
}

main().catch((err) => {
  console.error('✗ backfill aborted:', err);
  process.exit(1);
});
