import { useCallback, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EditorialLayout, Kicker } from '@/components/editorial';
import { useAuth } from '@/auth/AuthProvider';

function SignupRoute() {
  const { signUp, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (submitting) return;
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      setSubmitting(true);
      setError(null);

      const signUpResult = await signUp(email.trim(), password);
      if (!signUpResult.ok) {
        setError(signUpResult.error);
        setSubmitting(false);
        return;
      }

      // If email confirmation is disabled in Supabase, the user is already
      // signed in after signUp. If it's enabled, signUp does NOT create a
      // session — in that case we try to sign in immediately, and surface a
      // friendly message if a confirmation step is required.
      const signInResult = await signIn(email.trim(), password);
      if (signInResult.ok) {
        navigate('/assistant', { replace: true });
        return;
      }
      setError(
        'Account created, but sign-in failed. Check your email for a confirmation link, then sign in.',
      );
      setSubmitting(false);
    },
    [email, password, signUp, signIn, navigate, submitting],
  );

  return (
    <EditorialLayout
      issueLabel="Issue № 001 — Create account"
      statusLabel="Joining"
    >
      <div className="max-w-md space-y-10 slide-in">
        <div className="space-y-3">
          <Kicker>Create account</Kicker>
          <h2
            className="font-serif text-4xl leading-[1.05] tracking-tight"
            style={{ fontVariationSettings: "'opsz' 72" }}
          >
            A workspace, one brief away.
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
            label="Password (min. 8 characters)"
            type="password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
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
            {submitting ? 'Creating account…' : 'Create account →'}
          </Button>
        </form>

        <div className="hairline" />

        <p className="font-serif text-base text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-foreground underline">
            Sign in
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

export default SignupRoute;
