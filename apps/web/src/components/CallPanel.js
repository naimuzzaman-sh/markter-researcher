import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback, useEffect, useRef } from 'react';
import { ConversationProvider, useConversationControls, useConversationStatus, } from '@elevenlabs/react';
import { Button } from './ui/button';
import { startCall, endCall } from '@/lib/api';
function CallPanel({ context, onReset }) {
    const [appState, setAppState] = useState('idle');
    const [callId, setCallId] = useState(null);
    const [sessionData, setSessionData] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const handleStart = useCallback(async () => {
        setError(null);
        setResult(null);
        setAppState('connecting');
        try {
            const response = await startCall(context);
            setCallId(response.callId);
            setSessionData({ agentId: response.agentId, signedUrl: response.signedUrl });
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to start call');
            setAppState('error');
        }
    }, [context]);
    const handleTryAgain = useCallback(() => {
        setAppState('idle');
        setCallId(null);
        setSessionData(null);
        setResult(null);
        setError(null);
    }, []);
    if (sessionData && (appState === 'connecting' || appState === 'live')) {
        return (_jsx(ConversationProvider, { children: _jsx(ActiveCall, { callId: callId, signedUrl: sessionData.signedUrl, productName: context.product.name, maxDurationMinutes: context.interviewSettings.maxDurationMinutes, onComplete: (callResult) => {
                    setResult(callResult);
                    setSessionData(null);
                    setAppState('completed');
                }, onError: (msg) => {
                    setError(msg);
                    setSessionData(null);
                    setAppState('error');
                } }) }));
    }
    if (appState === 'completed' && result?.analysis) {
        return (_jsx(AnalysisView, { analysis: result.analysis, productName: context.product.name, onReset: onReset }));
    }
    return (_jsx(EditorialLayout, { issueLabel: `Issue № 001 — Dispatch`, statusLabel: appState === 'processing'
            ? 'Processing'
            : appState === 'error'
                ? 'Interrupted'
                : 'Standing by', children: _jsxs("div", { className: "space-y-10 slide-in", children: [_jsx(Kicker, { children: "Live dispatch" }), _jsx("h2", { className: "font-serif text-5xl leading-[1.02] tracking-tight", style: { fontVariationSettings: "'opsz' 96" }, children: context.product.name }), _jsx("p", { className: "font-serif text-lg text-muted-foreground italic -mt-6", children: context.research.objective }), _jsx("div", { className: "hairline" }), _jsx("p", { className: "font-serif text-base leading-relaxed max-w-xl", children: "When you're ready, begin the voice call. I'll conduct the interview and return a structured read-out. Keep this tab open \u2014 your microphone will be live." }), appState === 'idle' && (_jsx(Button, { onClick: handleStart, className: "rounded-full h-12 px-8 font-mono text-[11px] tracking-[0.2em] uppercase bg-accent text-accent-foreground hover:bg-accent/90", children: "Begin interview \u2192" })), appState === 'processing' && (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex gap-1.5", children: [_jsx("span", { className: "typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" }), _jsx("span", { className: "typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" }), _jsx("span", { className: "typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" })] }), _jsx("p", { className: "font-serif italic text-muted-foreground", children: "Transcribing and analysing the conversation\u2026" })] })), appState === 'error' && (_jsxs("div", { className: "space-y-4", children: [_jsx("p", { className: "font-mono text-xs text-destructive border-l-2 border-destructive pl-3", children: error }), _jsxs("div", { className: "flex gap-3", children: [_jsx(Button, { onClick: handleTryAgain, className: "rounded-full h-11 px-6 font-mono text-[11px] tracking-[0.2em] uppercase bg-foreground text-background hover:bg-accent", children: "Try again" }), _jsx(Button, { onClick: onReset, variant: "outline", className: "rounded-full h-11 px-6 font-mono text-[11px] tracking-[0.2em] uppercase border-foreground/20 hover:bg-foreground/5", children: "Start new brief" })] })] }))] }) }));
}
function ActiveCall({ callId, signedUrl, productName, maxDurationMinutes, onComplete, onError, }) {
    const { startSession, endSession } = useConversationControls();
    const { status } = useConversationStatus();
    const startedRef = useRef(false);
    const conversationIdRef = useRef(null);
    const processingRef = useRef(false);
    const processCallEnd = useCallback(async () => {
        if (processingRef.current)
            return;
        processingRef.current = true;
        const convId = conversationIdRef.current;
        if (!callId || !convId) {
            onError('Missing call or conversation ID');
            return;
        }
        try {
            const callResult = await endCall(callId, convId);
            onComplete(callResult);
        }
        catch (err) {
            onError(err instanceof Error ? err.message : 'Failed to process call');
        }
    }, [callId, onComplete, onError]);
    useEffect(() => {
        if (startedRef.current)
            return;
        startedRef.current = true;
        startSession({
            signedUrl,
            onConnect: ({ conversationId: connId }) => {
                conversationIdRef.current = connId;
            },
            onDisconnect: () => {
                processCallEnd();
            },
            onError: (message) => {
                onError(typeof message === 'string' ? message : 'Connection error');
            },
        });
    }, [startSession, signedUrl, onError, processCallEnd]);
    const handleEnd = useCallback(async () => {
        try {
            endSession();
        }
        catch {
            // Session may already be ended
        }
        await processCallEnd();
    }, [endSession, processCallEnd]);
    const isLive = status === 'connected';
    return (_jsx(EditorialLayout, { issueLabel: "Issue \u2116 001 \u2014 On air", statusLabel: isLive ? 'Recording' : 'Connecting…', children: _jsxs("div", { className: "space-y-10 slide-in", children: [_jsxs("div", { className: "space-y-3", children: [_jsx(Kicker, { children: "Transmission" }), _jsx("h2", { className: "font-serif text-5xl leading-[1.02] tracking-tight", style: { fontVariationSettings: "'opsz' 96" }, children: productName }), _jsxs("p", { className: "font-serif text-lg text-muted-foreground italic", children: ["Approximately ", maxDurationMinutes, " minutes"] })] }), _jsx("div", { className: "hairline" }), isLive ? (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("span", { className: "relative flex h-3 w-3", children: [_jsx("span", { className: "animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-70" }), _jsx("span", { className: "relative inline-flex rounded-full h-3 w-3 bg-accent" })] }), _jsx("span", { className: "font-mono text-[11px] tracking-[0.2em] uppercase", children: "On air \u2014 speak naturally" })] }), _jsx("p", { className: "font-serif text-base leading-relaxed max-w-xl", children: "The researcher is listening. Answer in your own words, take your time. When you're done, hang up below and I'll draft the read-out." }), _jsx(Button, { onClick: handleEnd, className: "rounded-full h-11 px-6 font-mono text-[11px] tracking-[0.2em] uppercase bg-destructive text-white hover:bg-destructive/90", children: "End interview \u25A0" })] })) : (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex gap-1.5", children: [_jsx("span", { className: "typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" }), _jsx("span", { className: "typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" }), _jsx("span", { className: "typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" })] }), _jsx("p", { className: "font-serif italic text-muted-foreground", children: "Opening the line\u2026" })] }))] }) }));
}
function AnalysisView({ analysis, productName, onReset, }) {
    return (_jsx(EditorialLayout, { issueLabel: "Issue \u2116 001 \u2014 Read-out", statusLabel: "Filed", children: _jsxs("div", { className: "space-y-14 slide-in pb-16", children: [_jsxs("header", { className: "space-y-3", children: [_jsx(Kicker, { children: "Findings" }), _jsx("h2", { className: "font-serif text-5xl leading-[1.02] tracking-tight", style: { fontVariationSettings: "'opsz' 96" }, children: productName }), _jsxs("div", { className: "flex items-center gap-3 pt-2", children: [_jsx(SentimentPill, { sentiment: analysis.overallSentiment }), _jsx("span", { className: "font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground", children: "Overall" })] })] }), _jsx("div", { className: "hairline" }), _jsxs(Section, { label: "The respondent", children: [_jsx("p", { className: "font-serif text-xl leading-snug", style: { fontVariationSettings: "'opsz' 24" }, children: analysis.participant.inferredRole }), _jsx("p", { className: "font-serif text-base text-muted-foreground mt-1", children: analysis.participant.background })] }), analysis.answers.length > 0 && (_jsx(Section, { label: `Responses · ${analysis.answers.length}`, children: _jsx("div", { className: "space-y-8 mt-4", children: analysis.answers.map((ans, i) => (_jsxs("div", { className: "flex gap-4", children: [_jsx("span", { className: "font-mono text-[11px] tracking-[0.15em] text-muted-foreground pt-1 w-6 shrink-0", children: String(i + 1).padStart(2, '0') }), _jsxs("div", { className: "space-y-2 flex-1", children: [_jsxs("p", { className: "font-serif text-base leading-relaxed text-muted-foreground italic", style: { fontVariationSettings: "'opsz' 18" }, children: ["\"", ans.questionText, "\""] }), _jsx("p", { className: "font-serif text-lg leading-relaxed", children: ans.response }), _jsx(SentimentPill, { sentiment: ans.sentiment })] })] }, ans.questionId))) }) })), analysis.keyInsights.length > 0 && (_jsx(Section, { label: "Key insights", children: _jsx("ul", { className: "space-y-4 mt-4", children: analysis.keyInsights.map((insight, i) => (_jsxs("li", { className: "flex gap-4", children: [_jsx("span", { className: "font-mono text-[11px] tracking-[0.15em] text-accent pt-1 w-6 shrink-0", children: "\u21B3" }), _jsx("p", { className: "font-serif text-lg leading-relaxed flex-1", style: { fontVariationSettings: "'opsz' 20" }, children: insight })] }, i))) }) })), analysis.productMarketFitSignals.length > 0 && (_jsx(Section, { label: "PMF signals", children: _jsx("ul", { className: "space-y-3 mt-4", children: analysis.productMarketFitSignals.map((sig, i) => (_jsxs("li", { className: "font-serif text-base leading-relaxed", children: ["\u2014 ", sig] }, i))) }) })), analysis.suggestedFollowUps.length > 0 && (_jsx(Section, { label: "Follow-ups for next time", children: _jsx("ul", { className: "space-y-2 mt-4", children: analysis.suggestedFollowUps.map((f, i) => (_jsxs("li", { className: "font-serif italic text-muted-foreground text-base", children: ["\u00B7 ", f] }, i))) }) })), _jsx("div", { className: "hairline" }), _jsx("div", { className: "flex flex-wrap gap-3", children: _jsx(Button, { onClick: onReset, className: "rounded-full h-11 px-7 font-mono text-[11px] tracking-[0.2em] uppercase bg-accent text-accent-foreground hover:bg-accent/90", children: "New brief \u2192" }) })] }) }));
}
/* --- Editorial primitives --- */
function EditorialLayout({ children, issueLabel, statusLabel, }) {
    return (_jsxs("div", { className: "min-h-screen flex flex-col", children: [_jsx("header", { className: "border-b border-border/60", children: _jsxs("div", { className: "max-w-2xl mx-auto px-6 py-5 flex items-baseline justify-between", children: [_jsxs("div", { children: [_jsx("div", { className: "font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground", children: issueLabel }), _jsx("h1", { className: "font-serif text-2xl mt-1 tracking-tight", style: { fontVariationSettings: "'opsz' 36" }, children: "The Interview Journal" })] }), _jsx("div", { className: "font-mono text-[10px] tracking-[0.2em] uppercase text-accent", children: statusLabel })] }) }), _jsx("div", { className: "flex-1", children: _jsx("div", { className: "max-w-2xl mx-auto px-6 py-12", children: children }) })] }));
}
function Kicker({ children }) {
    return (_jsx("div", { className: "font-mono text-[10px] tracking-[0.25em] uppercase text-accent", children: children }));
}
function Section({ label, children, }) {
    return (_jsxs("section", { className: "space-y-2", children: [_jsx("div", { className: "font-mono text-[10px] tracking-[0.25em] uppercase text-accent", children: label }), _jsx("div", { children: children })] }));
}
function SentimentPill({ sentiment, }) {
    const color = sentiment === 'positive'
        ? 'text-emerald-700 border-emerald-700/30'
        : sentiment === 'negative'
            ? 'text-destructive border-destructive/40'
            : 'text-muted-foreground border-border';
    return (_jsx("span", { className: `inline-flex items-center font-mono text-[10px] tracking-[0.2em] uppercase border rounded-full px-2.5 py-1 ${color}`, children: sentiment }));
}
export default CallPanel;
