'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Ruler, Eye } from 'lucide-react';

export default function QualityPage() {
    const [orderId, setOrderId] = useState('');
    const [measurement, setMeasurement] = useState('');
    const [visual, setVisual] = useState('pass');
    const [result, setResult] = useState<string | null>(null);

    function handleInspect(e: React.FormEvent) {
        e.preventDefault();
        if (!orderId) return;

        // mock DMN Logic
        const meas = parseFloat(measurement);
        let decision = 'PASS';

        if (visual === 'fail') {
            decision = 'SCRAP';
        } else if (meas < 10.5 || meas > 11.5) {
            decision = 'REWORK';
        }

        if (meas < 9 || meas > 13) decision = 'SCRAP';

        setResult(decision);
    }

    return (
        <div style={{ padding: '2rem' }}>
            <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--primary)' }}>Quality Inspection Gate</h1>

            <div className="card" style={{ maxWidth: '600px' }}>
                <form onSubmit={handleInspect}>
                    <div className="mb-4">
                        <label className="block mb-2 font-bold">Scan Work Order / Part ID</label>
                        <input className="input w-full p-2 border rounded" value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="WO-2024-..." />
                    </div>

                    <div className="mb-4 p-4 bg-gray-50 rounded border">
                        <h3 className="font-bold flex items-center gap-2 mb-3"><Ruler size={18} /> Dimensional Check</h3>
                        <label className="block mb-1 text-sm">Diameter (Spec: 11.0 ± 0.5 mm)</label>
                        <input type="number" step="0.1" className="input w-full p-2 border rounded" value={measurement} onChange={e => setMeasurement(e.target.value)} />
                    </div>

                    <div className="mb-6 p-4 bg-gray-50 rounded border">
                        <h3 className="font-bold flex items-center gap-2 mb-3"><Eye size={18} /> Visual Inspection</h3>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="vis" checked={visual === 'pass'} onChange={() => setVisual('pass')} /> No Defects
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer text-red-600">
                                <input type="radio" name="vis" checked={visual === 'fail'} onChange={() => setVisual('fail')} /> Visible Crack/Scratch
                            </label>
                        </div>
                    </div>

                    <button className="btn-primary-large w-full">Submit Inspection</button>
                </form>

                {result && (
                    <div style={{
                        marginTop: '2rem', padding: '1.5rem', borderRadius: '8px', textAlign: 'center',
                        backgroundColor: result === 'PASS' ? '#e8f5e9' : result === 'REWORK' ? '#fff8e1' : '#ffebee',
                        color: result === 'PASS' ? 'green' : result === 'REWORK' ? '#f57f17' : 'red',
                        border: `2px solid ${result === 'PASS' ? 'green' : result === 'REWORK' ? 'orange' : 'red'}`
                    }}>
                        <div className="text-3xl font-bold mb-2">{result}</div>
                        <div>
                            {result === 'PASS' ? 'Part Approved for Packaging' : result === 'REWORK' ? 'Route to Rework Station' : 'Scrap Part Immediately'}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
