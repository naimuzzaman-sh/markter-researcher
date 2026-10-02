import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import LandingRoute from './routes/LandingRoute';
import LoginRoute from './routes/LoginRoute';
import SignupRoute from './routes/SignupRoute';
import StudyCreatedRoute from './routes/StudyCreatedRoute';
import InterviewRoute from './routes/InterviewRoute';
import AuthorizeRoute from './routes/AuthorizeRoute';
import AssistantRoute from './routes/AssistantRoute';
import { EditorialLayout, Kicker } from './components/editorial';
import { Button } from './components/ui/button';
import { AuthProvider } from './auth/AuthProvider';
import { RequireAuth } from './auth/RequireAuth';

function NotFound() {
  return (
    <EditorialLayout issueLabel="Issue № 001 — Not found" statusLabel="404">
      <div className="space-y-8 slide-in">
        <Kicker>404</Kicker>
        <p
          className="font-serif text-4xl leading-[1.1]"
          style={{ fontVariationSettings: "'opsz' 72" }}
        >
          That page doesn't exist.
        </p>
        <Link to="/">
          <Button
            variant="outline"
            className="rounded-full h-11 px-6 font-mono text-[11px] tracking-[0.2em] uppercase border-foreground/20 hover:bg-foreground/5"
          >
            Back to home →
          </Button>
        </Link>
      </div>
    </EditorialLayout>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<LandingRoute />} />
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/signup" element={<SignupRoute />} />
          {/*
            Interview landing — public. Both `/interview/:studyId` (current)
            and `/interview/:briefId` (legacy) resolve to the same handler.
            The legacy alias keeps invite emails issued before the brief→study
            rename working. The route param name differs but `useParams()`
            is read narrowly inside the component, normalized to studyId.
          */}
          <Route path="/interview/:studyId" element={<InterviewRoute />} />
          <Route path="/interview/:briefId" element={<InterviewRoute />} />

          {/* Protected (researcher only) */}
          <Route element={<RequireAuth />}>
            <Route path="/assistant" element={<AssistantRoute />} />
            {/* Same alias pair for the post-create confirmation page. */}
            <Route path="/studies/:studyId" element={<StudyCreatedRoute />} />
            <Route path="/briefs/:studyId" element={<StudyCreatedRoute />} />
            <Route path="/authorize/:userCode" element={<AuthorizeRoute />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
