'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, FileText, CheckCircle, AlertTriangle } from 'lucide-react';
import { getSystemEvents } from '@/lib/actions/workflow';

// Mock fetching for now - real app would use Server Action with filter
// We will modify this to client-side filter the full list for MVP
export default function TraceabilityPage() {
    const [query, setQuery] = useState('');
    const [events, setEvents] = useState<any[]>([]);
    const [hasSearched, setHasSearched] = useState(false);

    async function handleSearch(e: React.FormEvent) {
        e.preventDefault();
        if (!query) return;

        // In real app: const data = await searchEvents(query);
        // Here we fetch all and filter
        const allEvents = await getSystemEvents();

        // Simple mock filter: check if query is in details or type
        const filtered = allEvents.filter((ev: any) =>
            ev.details.toLowerCase().includes(query.toLowerCase()) ||
            ev.type.toLowerCase().includes(query.toLowerCase()) ||
            ev.user.toLowerCase().includes(query.toLowerCase())
        );

        setEvents(filtered);
        setHasSearched(true);
    }

    return (
        <div style={{ padding: '2rem' }}>
            <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--primary)' }}>End-to-End Traceability (Genealogy)</h1>

            <div className="card" style={{ marginBottom: '2rem' }}>
                <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem' }}>
                    <input
                        className="input"
                        type="text"
                        placeholder="Search Serial #, Work Order, or User..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        style={{ flex: 1, padding: '12px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                    <button type="submit" className="btn-primary-large" style={{ minWidth: '120px', fontSize: '16px' }}>
                        <Search size={18} /> Search
                    </button>
                </form>
            </div>

            {hasSearched && (
                <div className="card">
                    <h2 style={{ marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>
                        Audit Trail: {query}
                    </h2>

                    {events.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>No records found matching criteria.</div>
                    ) : (
                        <div className="timeline">
                            {events.map((ev: any) => (
                                <div key={ev.id} style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', alignItems: 'flex-start' }}>
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '50%',
                                        backgroundColor: ev.type.includes('STOP') ? 'var(--danger)' : 'var(--secondary)',
                                        color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                    }}>
                                        {ev.type.includes('STOP') ? <AlertTriangle size={20} /> : <CheckCircle size={20} />}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.85rem', color: '#888' }}>{new Date(ev.timestamp).toLocaleString()}</div>
                                        <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.2rem' }}>{ev.type}</div>
                                        <div style={{ color: '#444' }}>{ev.details}</div>
                                        <div style={{ fontSize: '0.8rem', marginTop: '0.4rem', backgroundColor: '#f0f0f0', display: 'inline-block', padding: '2px 8px', borderRadius: '4px' }}>
                                            User: {ev.user}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
