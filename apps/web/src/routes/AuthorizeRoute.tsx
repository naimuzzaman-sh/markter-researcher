import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EditorialLayout, Kicker } from '@/components/editorial';
import { useAuth } from '@/auth/AuthProvider';
import { authorizeDevice, denyDevice } from '@/lib/api';

type UiState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'authorized' }
  | { kind: 'denied' }
  | { kind: 'error'; message: string };

const USER_CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function AuthorizeRoute() {
  const { userCode = '' } = useParams<{ userCode: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [state, setState] = useState<UiState>({ kind: 'idle' });

  const normalizedCode = userCode.toUpperCase();
  const codeLooksValid = USER_CODE_RE.test(normalizedCode);
  const identifier = user?.email ?? user?.phone ?? 'your account';

  const handleAuthorize = useCallback(async () => {
    if (state.kind === 'working') return;
    setState({ kind: 'working' });
    try {
      await authorizeDevice(normalizedCode);
      setState({ kind: 'authorized' });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Authorize failed',
      });
    }
  }, [normalizedCode, state.kind]);

  const handleDeny = useCallback(async () => {
    if (state.kind === 'working') return;
    setState({ kind: 'working' });
    try {
      await denyDevice(normalizedCode);
      setState({ kind: 'denied' });
      // Nothing else for the user to do here — send them home.
      setTimeout(() => navigate('/', { replace: true }), 1200);
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Deny failed',
      });
    }
  }, [normalizedCode, state.kind, navigate]);

  if (!codeLooksValid) {
    return (
      <EditorialLayout
        issueLabel="Issue № 001 — Authorize"
        statusLabel="Invalid"
      >
        <div className="space-y-8 slide-in">
          <Kicker>Bad link</Kicker>
          <p
            className="font-serif text-4xl leading-[1.1]"
            style={{ fontVariationSettings: "'opsz' 72" }}
          >
            That authorization code doesn't look right.
          </p>
          <p className="font-serif text-base text-muted-foreground leading-relaxed max-w-xl">
            Ask the tool to restart — it will print a fresh link.
          </p>
        </div>
      </EditorialLayout>
    );
  }

  if (state.kind === 'authorized') {
    return (
      <EditorialLayout
        issueLabel="Issue № 001 — Authorize"
        statusLabel="Connected"
      >
        <div className="space-y-8 slide-in">
          <Kicker>Connected</Kicker>
          <h2
            className="font-serif text-5xl leading-[1.02] tracking-tight"
            style={{ fontVariationSettings: "'opsz' 96" }}
          >
            You're good to go.
          </h2>
          <p className="font-serif text-lg text-muted-foreground italic max-w-xl">
            Return to the tool — it will pick up the session on its next poll.
            You can close this tab.
          </p>
          <div className="hairline" />
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => navigate('/assistant')}
              className="rounded-full h-11 px-6 font-mono text-[11px] tracking-[0.2em] uppercase border-foreground/20 hover:bg-foreground/5"
            >
              Back to workspace →
            </Button>
          </div>
        </div>
      </EditorialLayout>
    );
  }

  if (state.kind === 'denied') {
    return (
      <EditorialLayout
        issueLabel="Issue № 001 — Authorize"
        statusLabel="Denied"
      >
        <div className="space-y-8 slide-in">
          <Kicker>Denied</Kicker>
          <p
            className="font-serif text-3xl leading-[1.08]"
            style={{ fontVariationSettings: "'opsz' 60" }}
          >
            Request refused. Taking you home…
          </p>
        </div>
      </EditorialLayout>
    );
  }

  return (
    <EditorialLayout issueLabel="Issue № 001 — Authorize" statusLabel="Pending">
      <div className="space-y-12 slide-in">
        <div className="space-y-3">
          <Kicker>Device authorization</Kicker>
          <h2
            className="font-serif text-5xl leading-[1.02] tracking-tight"
            style={{ fontVariationSettings: "'opsz' 96" }}
          >
            Connect a tool to your account?
          </h2>
          <p className="font-serif text-lg text-muted-foreground italic">
            A tool on your device is asking for access to{' '}
            <span className="text-foreground not-italic">{identifier}</span>.
          </p>
        </div>

        <div className="hairline" />

        <div className="space-y-4">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
            Verification code
          </div>
          <div className="font-mono text-3xl tracking-[0.25em] text-foreground">
            {normalizedCode}
          </div>
          <p className="font-serif text-base text-muted-foreground leading-relaxed max-w-xl">
            Only continue if this code matches the one shown in the tool that
            requested access.
          </p>
        </div>

        <div className="hairline" />

        {state.kind === 'error' ? (
          <div className="font-mono text-[11px] tracking-[0.1em] uppercase text-destructive">
            {state.message}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3 pt-2">
          <Button
            onClick={handleAuthorize}
            disabled={state.kind === 'working'}
            className="rounded-full h-12 px-6 font-mono text-[11px] tracking-[0.2em] uppercase bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
          >
            {state.kind === 'working' ? 'Authorizing…' : 'Authorize'}
          </Button>
          <Button
            variant="outline"
            onClick={handleDeny}
            disabled={state.kind === 'working'}
            className="rounded-full h-12 px-6 font-mono text-[11px] tracking-[0.2em] uppercase border-foreground/20 hover:bg-foreground/5 disabled:opacity-50"
          >
            Deny
          </Button>
        </div>
      </div>
    </EditorialLayout>
  );
}

export default AuthorizeRoute;
