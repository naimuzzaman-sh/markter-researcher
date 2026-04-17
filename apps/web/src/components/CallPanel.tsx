import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
} from '@elevenlabs/react';
import { Button } from './ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from './ui/card';
import { Badge } from './ui/badge';
import { startCall, endCall, type CallRecord, type CallAnalysis } from '@/lib/api';

type AppState = 'idle' | 'connecting' | 'live' | 'processing' | 'completed' | 'error';

function CallPanel() {
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
      const response = await startCall();
      setCallId(response.callId);
      setSessionData({ agentId: response.agentId, signedUrl: response.signedUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start call');
      setAppState('error');
    }
  }, []);

  const handleReset = useCallback(() => {
    setAppState('idle');
    setCallId(null);
    setSessionData(null);
    setResult(null);
    setError(null);
  }, []);

  if (sessionData && (appState === 'connecting' || appState === 'live')) {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <ConversationProvider>
          <ActiveCall
            callId={callId}
            agentId={sessionData.agentId}
            signedUrl={sessionData.signedUrl}
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
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">Market Research Interview</CardTitle>
            <StatusBadge state={appState} />
          </div>
          <CardDescription>
            AI-powered voice interview — takes about 5 minutes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {appState === 'idle' && (
            <Button onClick={handleStart} size="lg" className="w-full">
              Start Interview
            </Button>
          )}

          {appState === 'processing' && (
            <p className="text-center text-muted-foreground">
              Analyzing interview...
            </p>
          )}

          {appState === 'error' && (
            <div className="space-y-3">
              <p className="text-center text-destructive text-sm">{error}</p>
              <Button onClick={handleReset} variant="outline" className="w-full">
                Try Again
              </Button>
            </div>
          )}

          {appState === 'completed' && (
            <Button onClick={handleReset} variant="outline" className="w-full">
              Start New Interview
            </Button>
          )}
        </CardContent>
      </Card>

      {result?.analysis && <AnalysisResults analysis={result.analysis} />}
    </div>
  );
}

type ActiveCallProps = {
  callId: string | null;
  agentId: string;
  signedUrl: string;
  onComplete: (result: CallRecord) => void;
  onError: (message: string) => void;
};

function ActiveCall({ callId, agentId, signedUrl, onComplete, onError }: ActiveCallProps) {
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
        console.log('[ElevenLabs] disconnected');
        processCallEnd();
      },
      onError: (message) => {
        console.error('[ElevenLabs] error:', message);
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

  const isConnecting = status !== 'connected' && startedRef.current;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">Market Research Interview</CardTitle>
          <Badge variant={status === 'connected' ? 'default' : 'outline'}>
            {status === 'connected' ? 'Live' : 'Connecting...'}
          </Badge>
        </div>
        <CardDescription>
          AI-powered voice interview — takes about 5 minutes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status === 'connected' && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="text-sm font-medium">Interview in progress</span>
            </div>
            <Button onClick={handleEnd} variant="destructive" className="w-full">
              End Interview
            </Button>
          </div>
        )}
        {isConnecting && (
          <p className="text-center text-muted-foreground">Connecting to interviewer...</p>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ state }: { state: AppState }) {
  const config: Record<AppState, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    idle: { label: 'Ready', variant: 'secondary' },
    connecting: { label: 'Connecting', variant: 'outline' },
    live: { label: 'Live', variant: 'default' },
    processing: { label: 'Processing', variant: 'outline' },
    completed: { label: 'Complete', variant: 'secondary' },
    error: { label: 'Error', variant: 'destructive' },
  };

  const { label, variant } = config[state];
  return <Badge variant={variant}>{label}</Badge>;
}

function AnalysisResults({ analysis }: { analysis: CallAnalysis }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Participant</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            <span className="font-medium">Role:</span> {analysis.participant.inferredRole}
          </p>
          <p className="text-sm">
            <span className="font-medium">Background:</span> {analysis.participant.background}
          </p>
          <div className="mt-2">
            <Badge variant={
              analysis.overallSentiment === 'positive' ? 'default' :
              analysis.overallSentiment === 'negative' ? 'destructive' : 'secondary'
            }>
              {analysis.overallSentiment} sentiment
            </Badge>
          </div>
        </CardContent>
      </Card>

      {analysis.answers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Responses</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {analysis.answers.map((answer) => (
              <div key={answer.questionId} className="border-b last:border-0 pb-3 last:pb-0">
                <p className="text-sm font-medium">{answer.questionText}</p>
                <p className="text-sm text-muted-foreground mt-1">{answer.response}</p>
                <Badge variant="outline" className="mt-1 text-xs">
                  {answer.sentiment}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {analysis.keyInsights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Key Insights</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1">
              {analysis.keyInsights.map((insight, i) => (
                <li key={i} className="text-sm">{insight}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {analysis.productMarketFitSignals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Product-Market Fit Signals</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1">
              {analysis.productMarketFitSignals.map((signal, i) => (
                <li key={i} className="text-sm">{signal}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default CallPanel;
