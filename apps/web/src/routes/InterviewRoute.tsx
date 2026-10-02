import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ConversationProvider } from '@elevenlabs/react';
import { Button } from '@/components/ui/button';
import {
  EditorialLayout,
  Kicker,
  TypingDots,
} from '@/components/editorial';
import { ActiveCall } from '@/components/ActiveCall';
import { getStudy, startCall, type GetStudyResponse } from '@/lib/api';

type Stage = 'loading' | 'welcome' | 'launching' | 'live' | 'done' | 'error';

function InterviewRoute() {
  // The route is registered TWICE in App.tsx — once as
  // `/interview/:studyId` (current) and once as `/interview/:briefId`
  // (legacy alias for invite emails issued before the brief→study
  // rename). useParams returns whichever name matched. Normalize to
  // a single `studyId` here.
  const params = useParams<{ studyId?: string; briefId?: string }>();
  const studyId = params.studyId ?? params.briefId;
  const [searchParams] = useSearchParams();
  // `?cid=<candidateId>` is set on invite links; if present we forward
  // it to /calls/start so the completed interview attributes back.
  const candidateId = searchParams.get('cid') ?? undefined;
  const [study, setStudy] = useState<GetStudyResponse | null>(null);
  const [stage, setStage] = useState<Stage>('loading');
  const [callId, setCallId] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studyId) {
      setError('No study ID in URL');
      setStage('error');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const fetched = await getStudy(studyId);
        if (cancelled) return;
        setStudy(fetched);
        setStage('welcome');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load study');
        setStage('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studyId]);

  const handleBegin = useCallback(async () => {
    if (!studyId) return;
    setStage('launching');
    setError(null);
    try {
      const response = await startCall(studyId, candidateId);
      setCallId(response.callId);
      setSignedUrl(response.signedUrl);
      setStage('live');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start call');
      setStage('error');
    }
  }, [studyId, candidateId]);

  if (stage === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <TypingDots />
      </div>
    );
  }

  if (stage === 'error' || !study) {
    return (
      <EditorialLayout
        issueLabel="Issue № 001 — Invitation"
        statusLabel="Unavailable"
      >
        <div className="space-y-8 slide-in">
          <Kicker>Invitation unavailable</Kicker>
          <p
            className="font-serif text-3xl leading-snug"
            style={{ fontVariationSettings: "'opsz' 48" }}
          >
            This interview link is no longer active.
          </p>
          <p className="font-mono text-xs text-destructive border-l-2 border-destructive pl-3">
            {error ?? 'Study not found'}
          </p>
        </div>
      </EditorialLayout>
    );
  }

  if (stage === 'done') {
    return (
      <EditorialLayout
        issueLabel="Issue № 001 — Thank you"
        statusLabel="Filed"
      >
        <div className="space-y-8 slide-in">
          <Kicker>Thank you</Kicker>
          <p
            className="font-serif text-4xl leading-[1.1]"
            style={{ fontVariationSettings: "'opsz' 72" }}
          >
            Thanks for sharing your perspective.
          </p>
          <p className="font-serif text-lg text-muted-foreground leading-relaxed max-w-xl">
            Your responses have been saved. The team at{' '}
            <span className="italic">{study.researchContext.company.name}</span>{' '}
            will use them to build a better product.
          </p>
          <div className="hairline" />
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
            You can close this tab.
          </p>
        </div>
      </EditorialLayout>
    );
  }

  if (stage === 'live' && callId && signedUrl) {
    return (
      <ConversationProvider>
        <ActiveCall
          callId={callId}
          signedUrl={signedUrl}
          productName={study.researchContext.product.name}
          maxDurationMinutes={
            study.researchContext.interviewSettings.maxDurationMinutes
          }
          onComplete={() => setStage('done')}
          onError={(msg) => {
            setError(msg);
            setStage('error');
          }}
        />
      </ConversationProvider>
    );
  }

  // welcome + launching
  const { researchContext: ctx } = study;
  return (
    <EditorialLayout
      issueLabel="Issue № 001 — Invitation"
      statusLabel={stage === 'launching' ? 'Connecting…' : 'Ready'}
    >
      <div className="space-y-10 slide-in">
        <div className="space-y-3">
          <Kicker>You're invited</Kicker>
          <h2
            className="font-serif text-5xl leading-[1.02] tracking-tight"
            style={{ fontVariationSettings: "'opsz' 96" }}
          >
            {ctx.product.name}
          </h2>
          <p className="font-serif text-lg text-muted-foreground italic">
            A short interview by {ctx.company.name} · about{' '}
            {ctx.interviewSettings.maxDurationMinutes} minutes
          </p>
        </div>

        <div className="hairline" />

        <p className="font-serif text-base leading-relaxed max-w-xl">
          When you're ready, click below. Your microphone will turn on and
          you'll have a natural conversation with a voice interviewer. You can
          hang up any time.
        </p>

        {stage === 'launching' ? (
          <div className="space-y-3">
            <TypingDots size="sm" />
            <p className="font-serif italic text-muted-foreground">
              Opening the line…
            </p>
          </div>
        ) : (
          <Button
            onClick={handleBegin}
            className="rounded-full h-12 px-8 font-mono text-[11px] tracking-[0.2em] uppercase bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Begin interview →
          </Button>
        )}
      </div>
    </EditorialLayout>
  );
}

export default InterviewRoute;
