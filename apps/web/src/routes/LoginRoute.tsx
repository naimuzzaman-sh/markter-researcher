import { useCallback, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EditorialLayout, Kicker } from '@/components/editorial';
import { useAuth } from '@/auth/AuthProvider';

type LocationState = { from?: { pathname?: string } };

function LoginRoute() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextPath =
    (location.state as LocationState | null)?.from?.pathname ?? '/setup';

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (submitting) return;
      setSubmitting(true);
      setError(null);
      const result = await signIn(email.trim(), password);
      if (result.ok) {
        navigate(nextPath, { replace: true });
      } else {
        setError(result.error);
        setSubmitting(false);
      }
    },
    [email, password, signIn, navigate, nextPath, submitting],
  );

  return (
    <EditorialLayout
      issueLabel="Issue № 001 — Sign in"
      statusLabel="Welcome back"
    >
      <div className="max-w-md space-y-10 slide-in">
        <div className="space-y-3">
          <Kicker>Sign in</Kicker>
          <h2
            className="font-serif text-4xl leading-[1.05] tracking-tight"
            style={{ fontVariationSettings: "'opsz' 72" }}
          >
            Welcome back.
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Field
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            required
          />
          <Field
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
          />

          {error && (
            <p className="font-mono text-xs text-destructive border-l-2 border-destructive pl-3">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={submitting || !email || !password}
            className="w-full rounded-full h-11 px-6 font-mono text-[11px] tracking-[0.2em] uppercase bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {submitting ? 'Signing in…' : 'Sign in →'}
          </Button>
        </form>

        <div className="hairline" />

        <p className="font-serif text-base text-muted-foreground">
          Don't have an account?{' '}
          <Link to="/signup" className="text-foreground underline">
            Create one
          </Link>
          .
        </p>
      </div>
    </EditorialLayout>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  autoComplete,
  required,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label htmlFor={id} className="block space-y-2">
      <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
        {label}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
        className="block w-full bg-transparent border-0 border-b border-border py-2 font-serif text-lg focus:outline-none focus:border-accent transition-colors"
      />
    </label>
  );
}

export default LoginRoute;
