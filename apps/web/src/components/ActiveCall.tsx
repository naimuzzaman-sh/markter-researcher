import { useCallback, useEffect, useRef } from 'react';
import {
  useConversationControls,
  useConversationStatus,
} from '@elevenlabs/react';
import { Button } from './ui/button';
import { EditorialLayout, Kicker, TypingDots } from './editorial';
import { endCall, type CallRecord } from '@/lib/api';

type ActiveCallProps = {
  callId: string;
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
        console.info('[ElevenLabs] connected', { conversationId: connId });
      },
      onDisconnect: (details) => {
        // Log the reason so we can see WHY the call ended. `details` typically
        // contains { reason, context } — reason is the most useful field.
        console.warn('[ElevenLabs] disconnected', {
          details,
          reason: (details as { reason?: unknown })?.reason,
          context: (details as { context?: unknown })?.context,
        });
        processCallEnd();
      },
      onError: (message, context) => {
        console.error('[ElevenLabs] error', { message, context });
        onError(typeof message === 'string' ? message : 'Connection error');
      },
      onStatusChange: (status) => {
        console.info('[ElevenLabs] status', status);
      },
      onModeChange: (mode) => {
        console.info('[ElevenLabs] mode', mode);
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
              The researcher is listening. Answer in your own words, take your
              time. When you're done, hang up below.
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
            <TypingDots size="sm" />
            <p className="font-serif italic text-muted-foreground">
              Opening the line…
            </p>
          </div>
        )}
      </div>
    </EditorialLayout>
  );
}

export { ActiveCall };
