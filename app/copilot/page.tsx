'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, Send, RefreshCw, Sparkles, AlertTriangle, TrendingUp, Package, Wrench, Clock } from 'lucide-react';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    intent?: string;
    suggestions?: string[];
    timestamp: Date;
}

const INTENT_ICONS: Record<string, React.ReactNode> = {
    MACHINE_STOP_ANALYSIS: <AlertTriangle size={14} />,
    OEE_QUERY: <TrendingUp size={14} />,
    QUALITY_ANALYSIS: <Sparkles size={14} />,
    BOTTLENECK_QUERY: <RefreshCw size={14} />,
    ORDER_STATUS: <Package size={14} />,
    MAINTENANCE_QUERY: <Wrench size={14} />,
    SHIFT_SUMMARY: <Clock size={14} />,
};

const STARTER_QUESTIONS = [
    'What machines are currently down?',
    'Show me OEE for today',
    'What is causing the most downtime?',
    'Are there any quality issues?',
    'Which work orders are overdue?',
    'What is the bottleneck on the line?',
];

export default function CopilotPage() {
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            role: 'assistant',
            text: 'Hello! I\'m the ParTraceflow MES Copilot. I can analyze your factory data and answer questions about machine performance, OEE, quality issues, downtime, and work order status. What would you like to know?',
            suggestions: STARTER_QUESTIONS.slice(0, 3),
            timestamp: new Date(),
        }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | undefined>();
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const send = async (question: string) => {
        if (!question.trim() || loading) return;
        const q = question.trim();
        setInput('');
        setLoading(true);

        const userMsg: Message = {
            id: Date.now() + '-u',
            role: 'user',
            text: q,
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMsg]);

        try {
            const res = await fetch('/api/copilot/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question: q, sessionId }),
            });
            const data = await res.json();
            if (data.sessionId) setSessionId(data.sessionId);

            const botMsg: Message = {
                id: Date.now() + '-b',
                role: 'assistant',
                text: data.answer ?? data.message ?? data.error ?? 'No response from copilot.',
                intent: data.intent,
                suggestions: data.suggestions ?? [],
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, botMsg]);
        } catch {
            setMessages(prev => [...prev, {
                id: Date.now() + '-err',
                role: 'assistant',
                text: 'Unable to reach the MES Copilot. Please check server connectivity.',
                timestamp: new Date(),
            }]);
        } finally {
            setLoading(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    };

    const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send(input);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--background)' }}>
            {/* Header */}
            <div style={{ padding: '1.25rem 1.75rem', borderBottom: '1px solid #e5e7eb', background: 'var(--card-bg)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Bot size={24} color="var(--card-bg)" />
                </div>
                <div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>MES Copilot</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>AI-powered factory intelligence · Rule-based + data analysis</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                    Online
                </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {messages.map(msg => (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: '0.75rem', alignItems: 'flex-start' }}>
                        {msg.role === 'assistant' && (
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Bot size={16} color="var(--card-bg)" />
                            </div>
                        )}
                        <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{
                                padding: '0.75rem 1rem', borderRadius: msg.role === 'user' ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem',
                                background: msg.role === 'user' ? '#3b82f6' : 'var(--card-bg)',
                                color: msg.role === 'user' ? 'var(--card-bg)' : '#1e293b',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                                fontSize: '0.9rem', lineHeight: 1.6, whiteSpace: 'pre-wrap',
                                border: msg.role === 'assistant' ? '1px solid #e5e7eb' : 'none',
                            }}>
                                {msg.intent && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', fontWeight: 600, color: 'var(--muted-foreground)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {INTENT_ICONS[msg.intent] ?? <Sparkles size={12} />}
                                        {msg.intent.replace(/_/g, ' ')}
                                    </div>
                                )}
                                {msg.text}
                            </div>
                            {msg.suggestions && msg.suggestions.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                    {msg.suggestions.map((s, i) => (
                                        <button key={i} onClick={() => send(s)} style={{
                                            padding: '0.3rem 0.75rem', fontSize: '0.78rem', borderRadius: '999px',
                                            border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8',
                                            cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s',
                                        }}
                                            onMouseEnter={e => { (e.target as HTMLElement).style.background = '#dbeafe'; }}
                                            onMouseLeave={e => { (e.target as HTMLElement).style.background = '#eff6ff'; }}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div style={{ fontSize: '0.7rem', color: '#9ca3af', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                                {msg.timestamp.toLocaleTimeString()}
                            </div>
                        </div>
                    </div>
                ))}
                {loading && (
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Bot size={16} color="var(--card-bg)" />
                        </div>
                        <div style={{ padding: '0.75rem 1rem', borderRadius: '1rem 1rem 1rem 0.25rem', background: 'var(--card-bg)', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                            {[0, 1, 2].map(i => (
                                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6', animation: `pulse 1.2s ${i * 0.2}s infinite` }} />
                            ))}
                        </div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Quick questions */}
            <div style={{ padding: '0.75rem 1.75rem 0', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid #f1f5f9' }}>
                {STARTER_QUESTIONS.map((q, i) => (
                    <button key={i} onClick={() => send(q)} disabled={loading} style={{
                        padding: '0.3rem 0.8rem', fontSize: '0.78rem', borderRadius: '999px',
                        border: '1px solid #e5e7eb', background: 'var(--background)', color: 'var(--foreground)',
                        cursor: 'pointer', fontWeight: 500,
                    }}>
                        {q}
                    </button>
                ))}
            </div>

            {/* Input */}
            <div style={{ padding: '1rem 1.75rem 1.5rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Ask about machines, OEE, downtime, quality... (Enter to send)"
                    rows={2}
                    style={{
                        flex: 1, padding: '0.75rem 1rem', borderRadius: '0.75rem',
                        border: '1.5px solid #e5e7eb', fontSize: '0.9rem', fontFamily: 'inherit',
                        resize: 'none', outline: 'none', background: 'var(--card-bg)',
                        transition: 'border-color 0.15s',
                    }}
                    onFocus={e => { e.target.style.borderColor = '#3b82f6'; }}
                    onBlur={e => { e.target.style.borderColor = 'var(--card-border)'; }}
                />
                <button
                    onClick={() => send(input)}
                    disabled={loading || !input.trim()}
                    style={{
                        padding: '0.75rem', borderRadius: '0.75rem', border: 'none',
                        background: loading || !input.trim() ? 'var(--card-border)' : '#3b82f6',
                        color: loading || !input.trim() ? '#9ca3af' : 'var(--card-bg)',
                        cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.15s',
                    }}
                >
                    {loading ? <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={20} />}
                </button>
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
                    40% { transform: scale(1); opacity: 1; }
                }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
