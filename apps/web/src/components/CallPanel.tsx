import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
} from '@elevenlabs/react';
import { Button } from './ui/button';
import { startCall, endCall, type CallRecord, type CallAnalysis } from '@/lib/api';
import type { ResearchContext } from '@/types/research-context.type';

type AppState = 'idle' | 'connecting' | 'live' | 'processing' | 'completed' | 'error';

type CallPanelProps = {
  context: ResearchContext;
  onReset: () => void;
};

function CallPanel({ context, onReset }: CallPanelProps) {
  const [appState, setAppState] = useState<AppState>('idle');
  const [callId, setCallId] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<{ agentId: string; signedUrl: string } | null>(null);
  const [result, setResult] = useState<CallRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleStart = useCallback(async () => {
    setError(null);
    setResult(null);
    setAppState('connecting');

    try {
      const response = await startCall(context);
      setCallId(response.callId);
      setSessionData({ agentId: response.agentId, signedUrl: response.signedUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start call');
      setAppState('error');
    }
  }, [context]);

  const handleTryAgain = useCallback(() => {
    setAppState('idle');
    setCallId(null);
    setSessionData(null);
    setResult(null);
    setError(null);
  }, []);

  if (sessionData && (appState === 'connecting' || appState === 'live')) {
    return (
      <ConversationProvider>
        <ActiveCall
          callId={callId}
          signedUrl={sessionData.signedUrl}
          productName={context.product.name}
          maxDurationMinutes={context.interviewSettings.maxDurationMinutes}
          onComplete={(callResult) => {
            setResult(callResult);
            setSessionData(null);
            setAppState('completed');
          }}
          onError={(msg) => {
            setError(msg);
            setSessionData(null);
            setAppState('error');
          }}
        />
      </ConversationProvider>
    );
  }

  if (appState === 'completed' && result?.analysis) {
    return (
      <AnalysisView
        analysis={result.analysis}
        productName={context.product.name}
        onReset={onReset}
      />
    );
  }

  return (
    <EditorialLayout
      issueLabel={`Issue № 001 — Dispatch`}
      statusLabel={
        appState === 'processing'
          ? 'Processing'
          : appState === 'error'
          ? 'Interrupted'
          : 'Standing by'
      }
    >
      <div className="space-y-10 slide-in">
        <Kicker>Live dispatch</Kicker>
        <h2
          className="font-serif text-5xl leading-[1.02] tracking-tight"
          style={{ fontVariationSettings: "'opsz' 96" }}
        >
          {context.product.name}
        </h2>
        <p className="font-serif text-lg text-muted-foreground italic -mt-6">
          {context.research.objective}
        </p>

        <div className="hairline" />

        <p className="font-serif text-base leading-relaxed max-w-xl">
          When you're ready, begin the voice call. I'll conduct the interview and return a
          structured read-out. Keep this tab open — your microphone will be live.
        </p>

        {appState === 'idle' && (
          <Button
            onClick={handleStart}
            className="rounded-full h-12 px-8 font-mono text-[11px] tracking-[0.2em] uppercase bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Begin interview →
          </Button>
        )}

        {appState === 'processing' && (
          <div className="space-y-3">
            <div className="flex gap-1.5">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" />
            </div>
            <p className="font-serif italic text-muted-foreground">
              Transcribing and analysing the conversation…
            </p>
          </div>
        )}

        {appState === 'error' && (
          <div className="space-y-4">
            <p className="font-mono text-xs text-destructive border-l-2 border-destructive pl-3">
              {error}
            </p>
            <div className="flex gap-3">
              <Button
                onClick={handleTryAgain}
                className="rounded-full h-11 px-6 font-mono text-[11px] tracking-[0.2em] uppercase bg-foreground text-background hover:bg-accent"
              >
                Try again
              </Button>
              <Button
                onClick={onReset}
                variant="outline"
                className="rounded-full h-11 px-6 font-mono text-[11px] tracking-[0.2em] uppercase border-foreground/20 hover:bg-foreground/5"
              >
                Start new brief
              </Button>
            </div>
          </div>
        )}
      </div>
    </EditorialLayout>
  );
}

type ActiveCallProps = {
  callId: string | null;
  signedUrl: string;
  productName: string;
  maxDurationMinutes: number;
  onComplete: (result: CallRecord) => void;
  onError: (message: string) => void;
};

function ActiveCall({
  callId,
  signedUrl,
  productName,
  maxDurationMinutes,
  onComplete,
  onError,
}: ActiveCallProps) {
  const { startSession, endSession } = useConversationControls();
  const { status } = useConversationStatus();
  const startedRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);
  const processingRef = useRef(false);

  const processCallEnd = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    const convId = conversationIdRef.current;
    if (!callId || !convId) {
      onError('Missing call or conversation ID');
      return;
    }

    try {
      const callResult = await endCall(callId, convId);
      onComplete(callResult);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to process call');
    }
  }, [callId, onComplete, onError]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    startSession({
      signedUrl,
      onConnect: ({ conversationId: connId }) => {
        conversationIdRef.current = connId;
      },
      onDisconnect: () => {
        processCallEnd();
      },
      onError: (message) => {
        onError(typeof message === 'string' ? message : 'Connection error');
      },
    });
  }, [startSession, signedUrl, onError, processCallEnd]);

  const handleEnd = useCallback(async () => {
    try {
      endSession();
    } catch {
      // Session may already be ended
    }
    await processCallEnd();
  }, [endSession, processCallEnd]);

  const isLive = status === 'connected';

  return (
    <EditorialLayout
      issueLabel="Issue № 001 — On air"
      statusLabel={isLive ? 'Recording' : 'Connecting…'}
    >
      <div className="space-y-10 slide-in">
        <div className="space-y-3">
          <Kicker>Transmission</Kicker>
          <h2
            className="font-serif text-5xl leading-[1.02] tracking-tight"
            style={{ fontVariationSettings: "'opsz' 96" }}
          >
            {productName}
          </h2>
          <p className="font-serif text-lg text-muted-foreground italic">
            Approximately {maxDurationMinutes} minutes
          </p>
        </div>

        <div className="hairline" />

        {isLive ? (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-70" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-accent" />
              </span>
              <span className="font-mono text-[11px] tracking-[0.2em] uppercase">
                On air — speak naturally
              </span>
            </div>
            <p className="font-serif text-base leading-relaxed max-w-xl">
              The researcher is listening. Answer in your own words, take your time.
              When you're done, hang up below and I'll draft the read-out.
            </p>
            <Button
              onClick={handleEnd}
              className="rounded-full h-11 px-6 font-mono text-[11px] tracking-[0.2em] uppercase bg-destructive text-white hover:bg-destructive/90"
            >
              End interview ■
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex gap-1.5">
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" />
              <span className="typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" />
            </div>
            <p className="font-serif italic text-muted-foreground">
              Opening the line…
            </p>
          </div>
        )}
      </div>
    </EditorialLayout>
  );
}

function AnalysisView({
  analysis,
  productName,
  onReset,
}: {
  analysis: CallAnalysis;
  productName: string;
  onReset: () => void;
}) {
  return (
    <EditorialLayout
      issueLabel="Issue № 001 — Read-out"
      statusLabel="Filed"
    >
      <div className="space-y-14 slide-in pb-16">
        <header className="space-y-3">
          <Kicker>Findings</Kicker>
          <h2
            className="font-serif text-5xl leading-[1.02] tracking-tight"
            style={{ fontVariationSettings: "'opsz' 96" }}
          >
            {productName}
          </h2>
          <div className="flex items-center gap-3 pt-2">
            <SentimentPill sentiment={analysis.overallSentiment} />
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              Overall
            </span>
          </div>
        </header>

        <div className="hairline" />

        <Section label="The respondent">
          <p className="font-serif text-xl leading-snug" style={{ fontVariationSettings: "'opsz' 24" }}>
            {analysis.participant.inferredRole}
          </p>
          <p className="font-serif text-base text-muted-foreground mt-1">
            {analysis.participant.background}
          </p>
        </Section>

        {analysis.answers.length > 0 && (
          <Section label={`Responses · ${analysis.answers.length}`}>
            <div className="space-y-8 mt-4">
              {analysis.answers.map((ans, i) => (
                <div key={ans.questionId} className="flex gap-4">
                  <span className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground pt-1 w-6 shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="space-y-2 flex-1">
                    <p
                      className="font-serif text-base leading-relaxed text-muted-foreground italic"
                      style={{ fontVariationSettings: "'opsz' 18" }}
                    >
                      "{ans.questionText}"
                    </p>
                    <p className="font-serif text-lg leading-relaxed">
                      {ans.response}
                    </p>
                    <SentimentPill sentiment={ans.sentiment} />
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {analysis.keyInsights.length > 0 && (
          <Section label="Key insights">
            <ul className="space-y-4 mt-4">
              {analysis.keyInsights.map((insight, i) => (
                <li key={i} className="flex gap-4">
                  <span className="font-mono text-[11px] tracking-[0.15em] text-accent pt-1 w-6 shrink-0">
                    ↳
                  </span>
                  <p
                    className="font-serif text-lg leading-relaxed flex-1"
                    style={{ fontVariationSettings: "'opsz' 20" }}
                  >
                    {insight}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {analysis.productMarketFitSignals.length > 0 && (
          <Section label="PMF signals">
            <ul className="space-y-3 mt-4">
              {analysis.productMarketFitSignals.map((sig, i) => (
                <li key={i} className="font-serif text-base leading-relaxed">
                  — {sig}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {analysis.suggestedFollowUps.length > 0 && (
          <Section label="Follow-ups for next time">
            <ul className="space-y-2 mt-4">
              {analysis.suggestedFollowUps.map((f, i) => (
                <li key={i} className="font-serif italic text-muted-foreground text-base">
                  · {f}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <div className="hairline" />

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={onReset}
            className="rounded-full h-11 px-7 font-mono text-[11px] tracking-[0.2em] uppercase bg-accent text-accent-foreground hover:bg-accent/90"
          >
            New brief →
          </Button>
        </div>
      </div>
    </EditorialLayout>
  );
}

/* --- Editorial primitives --- */

function EditorialLayout({
  children,
  issueLabel,
  statusLabel,
}: {
  children: React.ReactNode;
  issueLabel: string;
  statusLabel: string;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/60">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-baseline justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
              {issueLabel}
            </div>
            <h1
              className="font-serif text-2xl mt-1 tracking-tight"
              style={{ fontVariationSettings: "'opsz' 36" }}
            >
              The Interview Journal
            </h1>
          </div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-accent">
            {statusLabel}
          </div>
        </div>
      </header>
      <div className="flex-1">
        <div className="max-w-2xl mx-auto px-6 py-12">{children}</div>
      </div>
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
      {children}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
        {label}
      </div>
      <div>{children}</div>
    </section>
  );
}

function SentimentPill({
  sentiment,
}: {
  sentiment: 'positive' | 'neutral' | 'negative';
}) {
  const color =
    sentiment === 'positive'
      ? 'text-emerald-700 border-emerald-700/30'
      : sentiment === 'negative'
      ? 'text-destructive border-destructive/40'
      : 'text-muted-foreground border-border';
  return (
    <span
      className={`inline-flex items-center font-mono text-[10px] tracking-[0.2em] uppercase border rounded-full px-2.5 py-1 ${color}`}
    >
      {sentiment}
    </span>
  );
}

export default CallPanel;
