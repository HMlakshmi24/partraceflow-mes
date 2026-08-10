'use client';

import { FormEvent, useState } from 'react';

const initial = {
  enterpriseCode: '',
  enterpriseName: '',
  plantCode: '',
  plantName: '',
  areaCode: '',
  areaName: '',
  lineCode: '',
  lineName: '',
  machineCode: '',
  machineName: '',
  shiftCode: '',
  shiftName: '',
  shiftStart: '',
  shiftEnd: '',
  shiftHours: '8',
  username: '',
  password: '',
  role: 'ADMIN',
};

export default function SetupPage() {
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enterprise: { code: form.enterpriseCode, name: form.enterpriseName },
          plant: { code: form.plantCode, name: form.plantName },
          productionArea: { code: form.areaCode, name: form.areaName },
          productionLine: { code: form.lineCode, name: form.lineName },
          machine: { code: form.machineCode, name: form.machineName },
          shift: { code: form.shiftCode, name: form.shiftName, startTime: form.shiftStart, endTime: form.shiftEnd, durationHours: Number(form.shiftHours) },
          user: { username: form.username, password: form.password, role: form.role },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Setup failed');
      setMessage('Setup complete.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: 780, margin: '0 auto', padding: 24 }}>
      <h1>System Setup</h1>
      <p>Create first-time ISA-95 master data.</p>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
        {Object.entries(form).map(([k, v]) => (
          <input
            key={k}
            type={k.includes('password') ? 'password' : 'text'}
            placeholder={k}
            value={v}
            onChange={(e) => setForm((s) => ({ ...s, [k]: e.target.value }))}
            required
            style={{ padding: 10, border: '1px solid #d1d5db', borderRadius: 8 }}
          />
        ))}
        <button disabled={loading} type="submit" style={{ padding: 12, borderRadius: 8, border: 'none', background: '#111827', color: '#fff' }}>
          {loading ? 'Saving...' : 'Run Setup'}
        </button>
      </form>
      {message ? <p style={{ color: '#166534' }}>{message}</p> : null}
      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
    </main>
  );
}
