import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import LandingRoute from './routes/LandingRoute';
import LoginRoute from './routes/LoginRoute';
import SignupRoute from './routes/SignupRoute';
import SetupRoute from './routes/SetupRoute';
import BriefCreatedRoute from './routes/BriefCreatedRoute';
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
          <Route path="/interview/:briefId" element={<InterviewRoute />} />

          {/* Protected (researcher only) */}
          <Route element={<RequireAuth />}>
            <Route path="/setup" element={<SetupRoute />} />
            <Route path="/assistant" element={<AssistantRoute />} />
            <Route path="/briefs/:briefId" element={<BriefCreatedRoute />} />
            <Route path="/authorize/:userCode" element={<AuthorizeRoute />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
