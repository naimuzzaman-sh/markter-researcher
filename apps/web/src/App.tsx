import { useCallback, useState } from 'react';
import SetupChat from './components/SetupChat';
import CallPanel from './components/CallPanel';
import type { ResearchContext } from '@/types/research-context.type';

type Stage = 'setup' | 'call';

function App() {
  const [stage, setStage] = useState<Stage>('setup');
  const [context, setContext] = useState<ResearchContext | null>(null);

  const handleReady = useCallback((ctx: ResearchContext) => {
    setContext(ctx);
    setStage('call');
  }, []);

  const handleReset = useCallback(() => {
    setContext(null);
    setStage('setup');
  }, []);

  if (stage === 'setup' || !context) {
    return <SetupChat onReady={handleReady} />;
  }

  return <CallPanel context={context} onReset={handleReset} />;
}

export default App;
