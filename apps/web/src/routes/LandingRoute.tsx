import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { EditorialLayout, Kicker } from '@/components/editorial';
import { useAuth } from '@/auth/AuthProvider';

/**
 * Public landing page. Product pitch + show-don't-tell mocks + CTAs.
 * - Signed-out visitors: "Sign in" / "Create account".
 * - Signed-in visitors:  "Open workspace" (→ /assistant).
 *
 * Wider canvas (`width="wide"`) so the 3-up sample grid breathes;
 * the rest of the editorial pages keep the narrow column.
 */
function LandingRoute() {
  const { user } = useAuth();

  return (
    <EditorialLayout
      // No issueLabel/statusLabel here — the magazine conceit ("Issue
      // № 001 — Foyer") was noise on the landing, and the avatar (or
      // its absence) already conveys auth state without a "Visitor"
      // pill duplicating it.
      width="wide"
      footer={<Footer />}
    >
      <div className="space-y-16 slide-in">
        <Hero />
        <SampleGrid />
        <CtaRow user={user} />
      </div>
    </EditorialLayout>
  );
}

function Hero() {
  return (
    <div className="space-y-5 max-w-3xl">
      <Kicker>Voice research · on autopilot</Kicker>
      <h2
        className="font-serif text-5xl sm:text-6xl leading-[0.95] tracking-tight"
        style={{ fontVariationSettings: "'opsz' 96" }}
      >
        Real voice interviews with your users — while you sleep.
      </h2>
      <p className="font-serif text-xl text-muted-foreground italic leading-relaxed">
        Describe what you want to learn. Share a link. An AI interviewer holds
        a thoughtful five-minute conversation with each user — voice, real
        questions, real follow-ups — and files a structured read-out by
        morning.
      </p>
    </div>
  );
}

/**
 * Three static mocks that narrate the flow visually:
 *   01 → workspace card  (study + queues at a glance)
 *   02 → transcript turn (a real-feeling exchange mid-interview)
 *   03 → read-out card   (the structured artifact you wake up to)
 *
 * Inline-styled rather than reusing the real card components — keeps the
 * mocks visually pinned even if the live components evolve, and avoids
 * pulling agent-card props/types into a public route.
 */
function SampleGrid() {
  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <Kicker>What you'll get</Kicker>
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
          Sample · not your data
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <MockCard step="01" label="Brief the researcher">
          <WorkspaceMock />
        </MockCard>
        <MockCard step="02" label="Share the link">
          <TranscriptMock />
        </MockCard>
        <MockCard step="03" label="Read the findings">
          <ReadOutMock />
        </MockCard>
      </div>
    </div>
  );
}

function MockCard({
  step,
  label,
  children,
}: {
  step: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[11px] tracking-[0.15em] text-muted-foreground">
          {step}
        </span>
        <span
          className="font-serif text-lg leading-snug"
          style={{ fontVariationSettings: "'opsz' 20" }}
        >
          {label}
        </span>
      </div>
      <div className="border border-border/60 bg-card p-4 min-h-[180px]">
        {children}
      </div>
    </div>
  );
}

function WorkspaceMock() {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
        Workspace
      </div>
      <p className="font-serif italic text-sm text-muted-foreground mt-1">
        3 studies · 17 candidates · 4 interviews
      </p>
      <div className="mt-4">
        <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent mb-1.5">
          Candidates to review · 8
        </div>
        <ul className="space-y-1">
          <MockRow left="OpenAI Platform" right="8 pending" />
          <MockRow left="Stripe Atlas" right="3 pending" muted />
        </ul>
      </div>
    </div>
  );
}

function TranscriptMock() {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
        Transcript · 03:42
      </div>
      <div className="mt-3 space-y-3">
        <div>
          <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground">
            Researcher
          </div>
          <p className="font-serif text-sm leading-relaxed mt-0.5">
            Why did you pick Notion over Coda?
          </p>
        </div>
        <div>
          <div className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground">
            Tania
          </div>
          <p className="font-serif italic text-sm leading-relaxed text-foreground/85 mt-0.5">
            Honestly, the database felt like a thing I had to fight. With
            Notion, blocks just compose. It's the same hand the whole way.
          </p>
        </div>
      </div>
    </div>
  );
}

function ReadOutMock() {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-accent">
          Read-out
        </span>
        <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-emerald-700 border border-emerald-700/30 rounded-full px-2 py-0.5">
          positive
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        <MockBullet>
          Database flexibility is the single largest pull factor.
        </MockBullet>
        <MockBullet>
          Onboarding friction described as "no fight" — a strong PMF signal.
        </MockBullet>
        <MockBullet>
          Mentions Coda, Airtable, Linear; positions Notion as the daily hand.
        </MockBullet>
      </ul>
    </div>
  );
}

function MockRow({
  left,
  right,
  muted = false,
}: {
  left: string;
  right: string;
  muted?: boolean;
}) {
  return (
    <li className={`flex justify-between items-baseline gap-3 ${muted ? 'opacity-60' : ''}`}>
      <span className="font-serif text-sm leading-snug truncate">{left}</span>
      <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-muted-foreground shrink-0">
        {right}
      </span>
    </li>
  );
}

function MockBullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-sm leading-snug">
      <span className="font-mono text-[10px] text-accent pt-0.5 shrink-0">·</span>
      <span className="font-serif">{children}</span>
    </li>
  );
}

function CtaRow({ user }: { user: User | null }) {
  return (
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
  );
}

/**
 * Footer addresses two audiences:
 *   1. Curious interviewees who landed on `/` instead of their direct
 *      `/interview/:briefId` link — point them back to their email.
 *   2. The visitor expecting standard product furniture (legal/contact).
 * Footer links are stubs (#) until those pages exist; better to render
 * them dim than to omit them entirely.
 */
function Footer() {
  return (
    <footer className="border-t border-border/60 mt-12">
      <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4">
        <p className="font-serif italic text-sm text-muted-foreground max-w-md leading-relaxed">
          If you were sent here for an interview, look for the link in your
          email — it goes straight to the call.
        </p>
        <nav className="flex flex-wrap gap-4 font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground/80">
          <a href="#" className="hover:text-foreground transition-colors">
            Privacy
          </a>
          <a href="#" className="hover:text-foreground transition-colors">
            Terms
          </a>
          <a href="mailto:hello@mirars.app" className="hover:text-foreground transition-colors">
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}

export default LandingRoute;
