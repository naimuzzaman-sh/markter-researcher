import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { startSetup, sendSetupMessage } from '@/lib/api';
function SetupChat({ onReady }) {
    const [messages, setMessages] = useState([]);
    const [sessionId, setSessionId] = useState(null);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isTyping, setIsTyping] = useState(false);
    const [draftContext, setDraftContext] = useState(null);
    const [error, setError] = useState(null);
    const scrollRef = useRef(null);
    const bootRef = useRef(false);
    useEffect(() => {
        if (bootRef.current)
            return;
        bootRef.current = true;
        (async () => {
            try {
                const { sessionId: id, firstMessage } = await startSetup();
                setSessionId(id);
                setMessages([{ role: 'assistant', content: firstMessage }]);
            }
            catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to start setup');
            }
            finally {
                setIsLoading(false);
            }
        })();
    }, []);
    useEffect(() => {
        scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
            behavior: 'smooth',
        });
    }, [messages, isTyping]);
    const handleSend = useCallback(async () => {
        const text = input.trim();
        if (!text || !sessionId || isTyping)
            return;
        setInput('');
        setMessages((prev) => [...prev, { role: 'user', content: text }]);
        setIsTyping(true);
        setError(null);
        try {
            const response = await sendSetupMessage(sessionId, text);
            setMessages((prev) => [...prev, { role: 'assistant', content: response.reply }]);
            if (response.done && response.context) {
                setDraftContext(response.context);
            }
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send message');
        }
        finally {
            setIsTyping(false);
        }
    }, [input, sessionId, isTyping]);
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };
    if (isLoading) {
        return (_jsx("div", { className: "min-h-screen flex items-center justify-center", children: _jsx(Dots, {}) }));
    }
    if (draftContext) {
        return (_jsx(ContextReview, { context: draftContext, onConfirm: () => onReady(draftContext), onRefine: () => setDraftContext(null) }));
    }
    return (_jsxs("div", { className: "min-h-screen flex flex-col", children: [_jsx("header", { className: "border-b border-border/60 sticky top-0 bg-background/85 backdrop-blur-sm z-10", children: _jsxs("div", { className: "max-w-2xl mx-auto px-6 py-5 flex items-baseline justify-between", children: [_jsxs("div", { children: [_jsx("div", { className: "font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground", children: "Issue \u2116 001 \u2014 Setup" }), _jsx("h1", { className: "font-serif text-2xl mt-1 tracking-tight", style: { fontVariationSettings: "'opsz' 36" }, children: "The Interview Journal" })] }), _jsx("div", { className: "font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground", children: "Pre-brief" })] }) }), _jsx("div", { ref: scrollRef, className: "flex-1 overflow-y-auto", children: _jsxs("div", { className: "max-w-2xl mx-auto px-6 py-12 space-y-10", children: [_jsx(Lead, {}), messages.map((msg, i) => (_jsx(MessageRow, { message: msg, index: i }, i))), isTyping && _jsx(TypingRow, {}), error && (_jsx("div", { className: "font-mono text-xs text-destructive border-l-2 border-destructive pl-3", children: error }))] }) }), _jsx("div", { className: "border-t border-border/60 bg-background/85 backdrop-blur-sm", children: _jsx("div", { className: "max-w-2xl mx-auto px-6 py-5", children: _jsxs("div", { className: "flex items-end gap-3", children: [_jsx("span", { className: "font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground pb-3 pt-3 shrink-0", children: "You \u2014" }), _jsx(Textarea, { value: input, onChange: (e) => setInput(e.target.value), onKeyDown: handleKeyDown, placeholder: "Type a response\u2026  (\u23CE to send, \u21E7\u23CE for newline)", disabled: isTyping, className: "flex-1 bg-transparent border-0 shadow-none focus-visible:ring-0 font-serif text-base leading-relaxed placeholder:italic placeholder:text-muted-foreground/60 min-h-[44px] max-h-[200px] py-3", rows: 1 }), _jsx(Button, { onClick: handleSend, disabled: !input.trim() || isTyping, className: "shrink-0 rounded-full h-10 px-5 font-mono text-[11px] tracking-[0.15em] uppercase bg-foreground text-background hover:bg-accent", children: "Send \u2192" })] }) }) })] }));
}
function Lead() {
    return (_jsxs("div", { className: "space-y-3 pb-4", children: [_jsx("div", { className: "font-mono text-[10px] tracking-[0.25em] uppercase text-accent", children: "Prologue" }), _jsx("p", { className: "font-serif text-xl leading-snug text-foreground max-w-xl", style: { fontVariationSettings: "'opsz' 24" }, children: "Before we interview your users, tell me what you want to learn. I'll turn your intent into a tailored research brief." }), _jsx("div", { className: "hairline w-24 mt-6" })] }));
}
function MessageRow({ message, index }) {
    const isAssistant = message.role === 'assistant';
    return (_jsxs("article", { className: "slide-in", style: { animationDelay: `${Math.min(index * 40, 200)}ms` }, children: [_jsxs("div", { className: "font-mono text-[10px] tracking-[0.25em] uppercase text-accent mb-2", children: [isAssistant ? 'Researcher' : 'You', " \u2014 ", _jsxs("span", { className: "text-muted-foreground", children: ["\u2116 ", String(index + 1).padStart(2, '0')] })] }), isAssistant ? (_jsx("p", { className: "font-serif text-lg leading-relaxed text-foreground whitespace-pre-wrap", style: { fontVariationSettings: "'opsz' 18" }, children: message.content })) : (_jsx("p", { className: "text-base leading-relaxed text-foreground/85 whitespace-pre-wrap pl-4 border-l-2 border-border", children: message.content }))] }));
}
function TypingRow() {
    return (_jsxs("div", { className: "slide-in", children: [_jsx("div", { className: "font-mono text-[10px] tracking-[0.25em] uppercase text-accent mb-2", children: "Researcher \u2014" }), _jsxs("div", { className: "flex gap-1.5 py-2", children: [_jsx("span", { className: "typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" }), _jsx("span", { className: "typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" }), _jsx("span", { className: "typing-dot w-1.5 h-1.5 rounded-full bg-foreground/60" })] })] }));
}
function Dots() {
    return (_jsxs("div", { className: "flex gap-1.5", children: [_jsx("span", { className: "typing-dot w-2 h-2 rounded-full bg-foreground/60" }), _jsx("span", { className: "typing-dot w-2 h-2 rounded-full bg-foreground/60" }), _jsx("span", { className: "typing-dot w-2 h-2 rounded-full bg-foreground/60" })] }));
}
function ContextReview({ context, onConfirm, onRefine, }) {
    return (_jsxs("div", { className: "min-h-screen flex flex-col", children: [_jsx("header", { className: "border-b border-border/60", children: _jsxs("div", { className: "max-w-2xl mx-auto px-6 py-5 flex items-baseline justify-between", children: [_jsxs("div", { children: [_jsx("div", { className: "font-mono text-[10px] tracking-[0.2em] uppercase text-muted-foreground", children: "Issue \u2116 001 \u2014 Brief" }), _jsx("h1", { className: "font-serif text-2xl mt-1 tracking-tight", style: { fontVariationSettings: "'opsz' 36" }, children: "The Interview Journal" })] }), _jsx("div", { className: "font-mono text-[10px] tracking-[0.2em] uppercase text-accent", children: "Ready" })] }) }), _jsx("div", { className: "flex-1 overflow-y-auto", children: _jsxs("div", { className: "max-w-2xl mx-auto px-6 py-12 space-y-10 slide-in", children: [_jsxs("div", { children: [_jsx("div", { className: "font-mono text-[10px] tracking-[0.25em] uppercase text-accent", children: "Brief \u2014 Ready for launch" }), _jsx("h2", { className: "font-serif text-4xl mt-3 leading-[1.05] tracking-tight", style: { fontVariationSettings: "'opsz' 72" }, children: context.product.name }), _jsxs("p", { className: "font-serif text-lg text-muted-foreground mt-2 italic", children: [context.company.name, " \u00B7 ", context.company.industry] })] }), _jsx("div", { className: "hairline" }), _jsx(Field, { label: "Objective", body: context.research.objective, large: true }), _jsx(Field, { label: "Target audience", body: context.product.targetAudience }), _jsx(Field, { label: "Product description", body: context.product.description }), _jsxs("div", { children: [_jsx(FieldLabel, { children: "Key features" }), _jsx("ul", { className: "mt-3 space-y-1.5", children: context.product.keyFeatures.map((f, i) => (_jsxs("li", { className: "font-serif text-base leading-relaxed flex gap-3", children: [_jsx("span", { className: "font-mono text-xs text-muted-foreground pt-1.5 w-6 shrink-0", children: String(i + 1).padStart(2, '0') }), _jsx("span", { children: f })] }, i))) })] }), _jsxs("div", { children: [_jsxs(FieldLabel, { children: ["Interview questions \u00B7 ", context.research.questions.length] }), _jsx("ol", { className: "mt-3 space-y-4", children: context.research.questions.map((q, i) => (_jsxs("li", { className: "flex gap-3", children: [_jsx("span", { className: "font-mono text-xs text-muted-foreground pt-2 w-6 shrink-0", children: String(i + 1).padStart(2, '0') }), _jsxs("div", { children: [_jsx("p", { className: "font-serif text-base leading-relaxed", children: q.text }), _jsx("p", { className: "font-mono text-[10px] tracking-[0.15em] uppercase text-muted-foreground mt-1", children: q.category.replace('-', ' ') })] })] }, q.id))) })] }), context.research.productMarketFit.hypothesis && (_jsx(Field, { label: "Hypothesis", body: context.research.productMarketFit.hypothesis })), _jsx("div", { className: "hairline" }), _jsxs("div", { className: "flex flex-wrap gap-3 pt-2", children: [_jsx(Button, { onClick: onConfirm, className: "rounded-full h-11 px-7 font-mono text-[11px] tracking-[0.2em] uppercase bg-accent text-accent-foreground hover:bg-accent/90", children: "Begin interview \u2192" }), _jsx(Button, { onClick: onRefine, variant: "outline", className: "rounded-full h-11 px-6 font-mono text-[11px] tracking-[0.2em] uppercase border-foreground/20 hover:bg-foreground/5", children: "Refine brief" })] })] }) })] }));
}
function FieldLabel({ children }) {
    return (_jsx("div", { className: "font-mono text-[10px] tracking-[0.25em] uppercase text-accent", children: children }));
}
function Field({ label, body, large, }) {
    return (_jsxs("div", { children: [_jsx(FieldLabel, { children: label }), _jsx("p", { className: `mt-2 font-serif leading-relaxed ${large ? 'text-xl' : 'text-base'}`, style: large ? { fontVariationSettings: "'opsz' 24" } : undefined, children: body })] }));
}
export default SetupChat;
