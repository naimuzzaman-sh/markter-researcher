import { useCallback, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EditorialLayout, Kicker } from '@/components/editorial';

/**
 * Confirmation page after a study lands. Reachable at `/studies/:studyId`
 * AND at `/briefs/:studyId` — the legacy `/briefs/...` path is aliased
 * in `App.tsx` so invite emails issued before the brief→study rename
 * still resolve. The route param is exposed as `studyId` either way.
 */
function StudyCreatedRoute() {
  const { studyId } = useParams<{ studyId: string }>();
  const [copied, setCopied] = useState(false);

  const url = useMemo(() => {
    if (!studyId) return '';
    return `${window.location.origin}/interview/${studyId}`;
  }, [studyId]);

  const handleCopy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — fall back to select behaviour handled by input readonly state.
    }
  }, [url]);

  if (!studyId) {
    return (
      <EditorialLayout
        issueLabel="Issue № 001 — Dispatch"
        statusLabel="Unknown"
      >
        <p className="font-serif text-lg">No study in this URL.</p>
      </EditorialLayout>
    );
  }

  return (
    <EditorialLayout issueLabel="Issue № 001 — Dispatch" statusLabel="Filed">
      <div className="space-y-12 slide-in">
        <div className="space-y-3">
          <Kicker>Ready to dispatch</Kicker>
          <h2
            className="font-serif text-5xl leading-[1.02] tracking-tight"
            style={{ fontVariationSettings: "'opsz' 96" }}
          >
            Your interview link
          </h2>
          <p className="font-serif text-lg text-muted-foreground italic">
            Send this to the people you'd like to interview.
          </p>
        </div>

        <div className="hairline" />

        <div className="space-y-4">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
            Share URL
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 font-mono text-sm bg-secondary/40 border border-border rounded-md px-3 py-3 text-foreground focus:outline-none focus:border-accent"
            />
            <Button
              onClick={handleCopy}
              className="shrink-0 rounded-full h-12 px-6 font-mono text-[11px] tracking-[0.2em] uppercase bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {copied ? 'Copied ✓' : 'Copy link'}
            </Button>
          </div>
          <p className="font-serif text-base text-muted-foreground leading-relaxed max-w-xl">
            Anyone with this link can take the interview. Each completion is
            saved to your workspace.
          </p>
        </div>

        <div className="hairline" />

        <div className="flex flex-wrap gap-3 pt-2">
          <Link to="/">
            <Button
              variant="outline"
              className="rounded-full h-11 px-6 font-mono text-[11px] tracking-[0.2em] uppercase border-foreground/20 hover:bg-foreground/5"
            >
              Create another →
            </Button>
          </Link>
        </div>
      </div>
    </EditorialLayout>
  );
}

export default StudyCreatedRoute;
