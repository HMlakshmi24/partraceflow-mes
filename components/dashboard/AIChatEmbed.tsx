'use client';

import { useState } from 'react';
import { Bot, Send, MessageCircle } from 'lucide-react';

export default function AIChatEmbed() {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', text: '🏭 Hi! I\'m your Factory Helper. Ask me anything about the dashboard!' },
    { role: 'assistant', text: '💡 Quick questions → "Why is Factory Score down?" "What\'s Machine #3 doing?" "Fix top problem?"' }
  ]);
  
  const smartSuggestions = [
    'Why Factory Score down?',
    'What\'s the biggest problem?',
    'Machine status?',
    'Shift progress good?',
    'Fix speed issue?'
  ];

  const sendQuestion = async () => {
    if (!question.trim()) return;
    
    const userMsg = { role: 'user', text: question };
    setMessages(prev => [...prev, userMsg]);
    setQuestion('');
    
    // Simulate smart factory-aware responses
    setTimeout(() => {
      let response = getSmartResponse(question.toLowerCase());
      setMessages(prev => [...prev, { role: 'assistant', text: response }]);
    }, 800);
  };

  const getSmartResponse = (q: string) => {
    if (q.includes('factory score') || q.includes('oee')) 
      return '🏭 Factory Score shows overall efficiency. 85%+ = Green 😊 (perfect day!). Below 65% = Red 😟 (needs fixes). Each 1% = $500+/day!';
    
    if (q.includes('speed') || q.includes('performance'))
      return '🚀 Speed % = how fast vs perfect speed. Down? Check tool wear or material issues. Top fix usually = clean tools!';
    
    if (q.includes('problem') || q.includes('downtime'))
      return '🔧 Biggest problem = #1 reason machines stop (45min lost). Click it → see all stops → Fix = +12% Factory Score!';
    
    if (q.includes('machine'))
      return '⚙️ Green machines = running good. Red = stopped. Yellow = slow. Click machine → see why + fix!';
    
    return '💡 Great question! Factory Score 85% = Excellent. Focus on Speed (89%) - small fix = BIG win! What else?';
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(248,250,252,0.9))',
      borderRadius: '1.5rem', 
      padding: '1.5rem',
      border: '1px solid rgba(255,255,255,0.3)',
      boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
      height: 'fit-content',
      backdropFilter: 'blur(20px)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <Bot size={28} style={{ color: '#7c3aed' }} />
        <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#1e293b' }}>
          Factory Helper 🤖
        </h3>
      </div>
      
      <div style={{
        maxHeight: '300px',
        overflowY: 'auto',
        border: '1px solid #e5e7eb',
        borderRadius: '1rem',
        padding: '1rem',
        background: '#f8fafc',
        marginBottom: '1rem',
        fontSize: '0.95rem',
        lineHeight: 1.5
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            marginBottom: '0.75rem',
            textAlign: msg.role === 'user' ? 'right' : 'left'
          }}>
            <div style={{
              display: 'inline-block',
              padding: '0.5rem 1rem',
              borderRadius: '1.25rem',
              maxWidth: '85%',
              background: msg.role === 'user' ? '#3b82f6' : '#e0e7ff',
              color: msg.role === 'user' ? 'white' : '#3730a3',
              fontWeight: msg.role === 'assistant' ? 500 : 600
            }}>
              {msg.text}
            </div>
          </div>
        ))}
      </div>
      
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about dashboard... (Why score down?)"
          style={{
            flex: 1,
            padding: '0.75rem 1rem',
            border: '1px solid #d1d5db',
            borderRadius: '1.5rem',
            fontSize: '0.95rem',
            outline: 'none'
          }}
          onKeyPress={(e) => e.key === 'Enter' && sendQuestion()}
        />
        <button
          onClick={sendQuestion}
          disabled={!question.trim()}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            border: 'none',
            background: '#7c3aed',
            color: 'white',
            cursor: question.trim() ? 'pointer' : 'not-allowed',
            opacity: question.trim() ? 1 : 0.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s'
          }}
        >
          <Send size={18} />
        </button>
      </div>
      
      <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {smartSuggestions.map(suggestion => (
          <button
            key={suggestion}
            onClick={() => {
              setQuestion(suggestion);
              sendQuestion();
            }}
            style={{
              padding: '0.4rem 0.8rem',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              borderRadius: '1rem',
              fontSize: '0.8rem',
              cursor: 'pointer',
              color: '#475569'
            }}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

