'use client';

import { RefreshCw, CheckCircle, XCircle, Link, Server } from 'lucide-react';

export default function ConnectorsPage() {
    const connectors = [
        { name: 'PostgreSQL Database', type: 'Database', status: 'PENDING', latency: '-', message: 'Waiting for Phase 1 Setup' },
        { name: 'Oracle NetSuite', type: 'ERP', status: 'DISCONNECTED', latency: '-', message: 'Auth Token Missing' },
        { name: 'SAP S/4HANA', type: 'ERP', status: 'DISCONNECTED', latency: '-', message: 'Gateway unreachable' },
        { name: 'Siemens S7-1500 PLC', type: 'Hardware', status: 'CONNECTED', latency: '45ms', message: 'OPC-UA Streaming Active' },
        { name: 'Zebra FX9600 RFID', type: 'Hardware', status: 'CONNECTED', latency: '12ms', message: 'Scanning (LLRP)' },
        { name: 'MQTT Broker', type: 'Messaging', status: 'CONNECTED', latency: '4ms', message: 'Topic: factory/#' },
    ];

    return (
        <div style={{ padding: '2rem' }}>
            <h1 className="text-2xl font-bold mb-6 flex items-center gap-2 text-primary">
                <Link /> Enterprise Connectors & Status
            </h1>

            <div className="grid gap-4">
                {connectors.map((c, i) => (
                    <div key={i} className="card flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-lg ${c.status === 'CONNECTED' ? 'bg-green-100 text-green-600' : c.status === 'PENDING' ? 'bg-gray-100 text-gray-500' : 'bg-red-100 text-red-600'}`}>
                                <Server size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold">{c.name}</h3>
                                <div className="text-sm text-gray-500">{c.type} • {c.message}</div>
                            </div>
                        </div>

                        <div className="text-right">
                            <div className={`font-bold inline-flex items-center gap-2 ${c.status === 'CONNECTED' ? 'text-green-600' : c.status === 'PENDING' ? 'text-gray-500' : 'text-red-500'}`}>
                                {c.status === 'CONNECTED' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                                {c.status}
                            </div>
                            <div className="text-xs text-gray-400 mt-1 font-mono">Ping: {c.latency}</div>
                        </div>
                    </div>
                ))}
            </div>

        </div>
    );
}
