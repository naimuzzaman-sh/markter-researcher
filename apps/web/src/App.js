import { jsx as _jsx } from "react/jsx-runtime";
import { useCallback, useState } from 'react';
import SetupChat from './components/SetupChat';
import CallPanel from './components/CallPanel';
function App() {
    const [stage, setStage] = useState('setup');
    const [context, setContext] = useState(null);
    const handleReady = useCallback((ctx) => {
        setContext(ctx);
        setStage('call');
    }, []);
    const handleReset = useCallback(() => {
        setContext(null);
        setStage('setup');
    }, []);
    if (stage === 'setup' || !context) {
        return _jsx(SetupChat, { onReady: handleReady });
    }
    return _jsx(CallPanel, { context: context, onReset: handleReset });
}
export default App;
