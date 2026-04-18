import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import SetupRoute from './routes/SetupRoute';
import BriefCreatedRoute from './routes/BriefCreatedRoute';
import InterviewRoute from './routes/InterviewRoute';
import { EditorialLayout, Kicker } from './components/editorial';
import { Button } from './components/ui/button';

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
            Back to setup →
          </Button>
        </Link>
      </div>
    </EditorialLayout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SetupRoute />} />
        <Route path="/briefs/:briefId" element={<BriefCreatedRoute />} />
        <Route path="/interview/:briefId" element={<InterviewRoute />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
