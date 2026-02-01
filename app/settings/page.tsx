'use client';

import { useState } from 'react';
import { Save, User, Settings as SettingsIcon, Cpu, RefreshCw } from 'lucide-react';

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState('general');
    const [factoryName, setFactoryName] = useState('Factory-01');

    return (
        <div style={{ padding: '2rem' }}>
            <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <SettingsIcon /> System Configuration
            </h1>

            <div style={{ display: 'flex', gap: '2rem' }}>

                {/* SIDEBAR TABS */}
                <div style={{ width: '250px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <Tab active={activeTab === 'general'} onClick={() => setActiveTab('general')} icon={<SettingsIcon size={18} />} label="General Settings" />
                    <Tab active={activeTab === 'users'} onClick={() => setActiveTab('users')} icon={<User size={18} />} label="User Management" />
                    <Tab active={activeTab === 'simulation'} onClick={() => setActiveTab('simulation')} icon={<Cpu size={18} />} label="PLC Simulation" />
                </div>

                {/* CONTENT AREA */}
                <div className="card" style={{ flex: 1, minHeight: '500px' }}>

                    {activeTab === 'general' && (
                        <div>
                            <h2 className="text-xl font-bold mb-4">General Configuration</h2>
                            <div className="form-group mb-4">
                                <label className="block mb-2 font-bold">Factory Name</label>
                                <input className="input w-full p-2 border rounded" value={factoryName} onChange={e => setFactoryName(e.target.value)} />
                            </div>
                            <div className="form-group mb-4">
                                <label className="block mb-2 font-bold">Timezone</label>
                                <select className="w-full p-2 border rounded">
                                    <option>UTC (Coordinated Universal Time)</option>
                                    <option>EST (Eastern Standard Time)</option>
                                    <option>IST (India Standard Time)</option>
                                </select>
                            </div>
                            <button className="btn-primary-large" style={{ fontSize: '1rem', minHeight: '40px' }} onClick={() => alert('Settings Saved')}>
                                <Save size={18} /> Save Changes
                            </button>
                        </div>
                    )}

                    {activeTab === 'users' && (
                        <div>
                            <h2 className="text-xl font-bold mb-4">User Management</h2>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                                        <th className="p-2">Username</th>
                                        <th className="p-2">Role</th>
                                        <th className="p-2">Status</th>
                                        <th className="p-2">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr><td className="p-2">admin</td><td className="p-2"><span className="status-badge success">Admin</span></td><td className="p-2">Active</td><td className="p-2"><button className="text-blue-600">Edit</button></td></tr>
                                    <tr><td className="p-2">planner</td><td className="p-2"><span className="status-badge success">Planner</span></td><td className="p-2">Active</td><td className="p-2"><button className="text-blue-600">Edit</button></td></tr>
                                    <tr><td className="p-2">operator</td><td className="p-2"><span className="status-badge warning">Operator</span></td><td className="p-2">Active</td><td className="p-2"><button className="text-blue-600">Edit</button></td></tr>
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'simulation' && (
                        <div>
                            <h2 className="text-xl font-bold mb-4">PLC Simulation Control</h2>
                            <p className="mb-4 text-gray-600">Manage the background Node.js service simulating factory machines.</p>

                            <div className="flex gap-4 mb-6">
                                <div className="p-4 border rounded bg-green-50 text-center w-32">
                                    <div className="text-2xl font-bold text-green-700">RUNNING</div>
                                    <div className="text-xs">Status</div>
                                </div>
                            </div>

                            <button className="btn-primary-large bg-red-600" style={{ fontSize: '1rem', minHeight: '40px', backgroundColor: '#d32f2f' }}>
                                <RefreshCw size={18} /> Restart Simulator
                            </button>
                        </div>
                    )}

                </div>
            </div>
        </div >
    );
}

function Tab({ active, onClick, icon, label }: any) {
    return (
        <div
            onClick={onClick}
            style={{
                padding: '1rem',
                borderRadius: '8px',
                backgroundColor: active ? 'white' : 'transparent',
                color: active ? 'var(--primary)' : '#666',
                fontWeight: active ? 'bold' : 'normal',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '10px',
                boxShadow: active ? '0 2px 4px rgba(0,0,0,0.1)' : 'none'
            }}
        >
            {icon} {label}
        </div>
    )
}
