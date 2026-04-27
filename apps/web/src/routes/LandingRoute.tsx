import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EditorialLayout, Kicker } from '@/components/editorial';
import { useAuth } from '@/auth/AuthProvider';

/**
 * Public landing page. Product pitch + CTAs.
 * - Signed-out visitors: "Sign in" / "Create account".
 * - Signed-in visitors: "Open workspace" (→ /assistant).
 */
function LandingRoute() {
  const { user } = useAuth();

  return (
    <EditorialLayout
      issueLabel="Issue № 001 — Foyer"
      statusLabel={user ? 'Signed in' : 'Visitor'}
    >
      <div className="space-y-12 slide-in">
        <div className="space-y-4 max-w-xl">
          <Kicker>The Interview Journal</Kicker>
          <h2
            className="font-serif text-5xl sm:text-6xl leading-[0.95] tracking-tight"
            style={{ fontVariationSettings: "'opsz' 96" }}
          >
            A voice researcher that interviews for you — while you sleep.
          </h2>
          <p className="font-serif text-xl text-muted-foreground italic leading-relaxed">
            Describe what you want to learn. Share a link. Dozens of your users
            have a thoughtful five-minute conversation with an AI interviewer.
            You wake up to a stack of structured read-outs.
          </p>
        </div>

        <div className="hairline max-w-xl" />

        <div className="space-y-4 max-w-xl">
          <Kicker>How it works</Kicker>
          <ol className="space-y-3">
            <Step
              n={1}
              title="Brief the researcher"
              body="Chat about the product, the audience, and what you're trying to learn. The assistant drafts a tailored interview plan."
            />
            <Step
              n={2}
              title="Share the link"
              body="One URL. Anyone with it can take the voice interview. No account required on their end."
            />
            <Step
              n={3}
              title="Read the findings"
              body="Every call ends with a structured read-out — responses, insights, PMF signals, follow-ups to consider."
            />
          </ol>
        </div>

        <div className="hairline max-w-xl" />

        <div className="flex flex-wrap gap-3 pt-2">
          {user ? (
            <Link to="/assistant">
              <Button className="rounded-full h-12 px-8 font-mono text-[11px] tracking-[0.2em] uppercase bg-accent text-accent-foreground hover:bg-accent/90">
                Open workspace →
              </Button>
            </Link>
          ) : (
            <>
              <Link to="/signup">
                <Button className="rounded-full h-12 px-8 font-mono text-[11px] tracking-[0.2em] uppercase bg-accent text-accent-foreground hover:bg-accent/90">
                  Create account →
                </Button>
              </Link>
              <Link to="/login">
                <Button
                  variant="outline"
                  className="rounded-full h-12 px-6 font-mono text-[11px] tracking-[0.2em] uppercase border-foreground/20 hover:bg-foreground/5"
                >
                  Sign in
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </EditorialLayout>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground pt-2 w-6 shrink-0">
        {String(n).padStart(2, '0')}
      </span>
      <div>
        <p
          className="font-serif text-lg leading-snug"
          style={{ fontVariationSettings: "'opsz' 20" }}
        >
          {title}
        </p>
        <p className="font-serif text-base text-muted-foreground leading-relaxed">
          {body}
        </p>
      </div>
    </li>
  );
}

export default LandingRoute;
