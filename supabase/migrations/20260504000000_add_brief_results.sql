-- Migration: aggregate findings on the brief.
--
-- After every interview ends, the server runs a summarization pass over
-- ALL completed interviews for that brief and stores the result here.
-- Each new interview triggers a re-run; older summaries are overwritten.
-- Last-writer-wins is fine: concurrent calls are extremely rare (one
-- researcher, a few interviews) and the inputs (transcripts) are stable
-- once persisted, so re-running with the same set produces equivalent
-- output.
--
-- Shape (validated by Zod on read; column is loose jsonb):
--   {
--     summary:              "1-2 paragraph synthesis",
--     themes:               ["..."],
--     painPoints:           ["..."],
--     pmfSignalsObserved:   ["..."],
--     recommendations:      ["..."],
--     interviewCount:       3,
--     lastUpdated:          "2026-05-04T..."
--   }
--
-- Default null = "no interviews yet, or summarization hasn't run." UI
-- treats null as "hide the RESULTS section."

alter table public.briefs
  add column if not exists results jsonb;
