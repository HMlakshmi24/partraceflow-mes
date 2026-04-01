/*
    WorkflowDesigner Component — Visual BPMN-style workflow editor

    Features:
    - Drag nodes from toolbox → drop onto canvas
    - Drag existing nodes to reposition (pointer capture)
    - Dynamic SVG bezier arrows connecting all nodes in flow order
    - Color-coded node types: Start (green), Task (blue), Gateway (orange diamond), End (red)
    - Editable workflow name
    - Save / Deploy / Import-Export BPMN
*/

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Save, Play, Upload, Info, X, Trash2 } from 'lucide-react';

type NodeType = 'start' | 'task' | 'gateway' | 'end';

interface WorkflowNode {
    id: string;
    type: NodeType;
    title: string;
    x: number;
    y: number;
}

interface Edge { from: string; to: string; }

const NW: Record<NodeType, number> = { start: 64, task: 140, gateway: 72, end: 64 };
const NH: Record<NodeType, number> = { start: 64, task: 56,  gateway: 72, end: 64 };

const NODE_STYLE: Record<NodeType, { bg: string; border: string; text: string; label: string }> = {
    start:   { bg: '#10b981', border: '#059669', text: '#fff', label: 'Start Event'  },
    task:    { bg: '#3b82f6', border: '#1d4ed8', text: '#fff', label: 'Human Task'   },
    gateway: { bg: '#f59e0b', border: '#d97706', text: '#fff', label: 'Gateway'      },
    end:     { bg: '#ef4444', border: '#dc2626', text: '#fff', label: 'End Event'    },
};

function outPort(n: WorkflowNode): [number, number] {
    if (n.type === 'start' || n.type === 'end') return [n.x + NW[n.type], n.y + NH[n.type] / 2];
    if (n.type === 'gateway') return [n.x + NW.gateway, n.y + NH.gateway / 2];
    return [n.x + NW.task, n.y + NH.task / 2];
}
function inPort(n: WorkflowNode): [number, number] {
    if (n.type === 'start' || n.type === 'end') return [n.x, n.y + NH[n.type] / 2];
    if (n.type === 'gateway') return [n.x, n.y + NH.gateway / 2];
    return [n.x, n.y + NH.task / 2];
}

const INITIAL_NODES: WorkflowNode[] = [
    { id: 'start',  type: 'start',   title: 'Start',            x: 60,  y: 120 },
    { id: 'task1',  type: 'task',    title: 'Prepare Material',  x: 190, y: 112 },
    { id: 'task2',  type: 'task',    title: 'CNC Machining',     x: 390, y: 112 },
    { id: 'gate1',  type: 'gateway', title: 'QC Pass?',          x: 590, y: 108 },
    { id: 'end',    type: 'end',     title: 'End',               x: 740, y: 120 },
];

const INITIAL_EDGES: Edge[] = [
    { from: 'start', to: 'task1' },
    { from: 'task1', to: 'task2' },
    { from: 'task2', to: 'gate1' },
    { from: 'gate1', to: 'end'   },
];

// ─── Arrow SVG Layer ──────────────────────────────────────────────────────────

function ArrowLayer({ nodes, edges }: { nodes: WorkflowNode[]; edges: Edge[] }) {
    const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
    return (
        <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
            <defs>
                <marker id="ah" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
                </marker>
            </defs>
            {edges.map(edge => {
                const src = nodeMap[edge.from];
                const dst = nodeMap[edge.to];
                if (!src || !dst) return null;
                const [x1, y1] = outPort(src);
                const [x2, y2] = inPort(dst);
                const dx = Math.max(50, Math.abs(x2 - x1) * 0.45);
                return (
                    <path
                        key={`${edge.from}-${edge.to}`}
                        d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                        stroke="#64748b"
                        strokeWidth="2"
                        fill="none"
                        markerEnd="url(#ah)"
                    />
                );
            })}
        </svg>
    );
}

// ─── Node Shape ───────────────────────────────────────────────────────────────

function NodeShape({
    node, selected,
    onDown, onClick,
    onMove, onUp,
}: {
    node: WorkflowNode;
    selected: boolean;
    onDown: (e: React.PointerEvent, id: string) => void;
    onClick: (id: string) => void;
    onMove: (e: React.PointerEvent) => void;
    onUp: (e: React.PointerEvent) => void;
}) {
    const s = NODE_STYLE[node.type];
    const ring = selected ? '0 0 0 3px #6366f1, 0 4px 16px rgba(99,102,241,0.3)' : '0 2px 8px rgba(0,0,0,0.15)';

    const common = {
        position: 'absolute' as const,
        left: node.x,
        top: node.y,
        cursor: 'grab',
        userSelect: 'none' as const,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: selected ? 20 : 10,
        boxShadow: ring,
        touchAction: 'none' as const,
    };

    const handleDown = (e: React.PointerEvent) => { e.stopPropagation(); onDown(e, node.id); };
    const handleClick = (e: React.MouseEvent) => { e.stopPropagation(); onClick(node.id); };

    if (node.type === 'start' || node.type === 'end') {
        return (
            <div
                style={{
                    ...common,
                    width: NW[node.type],
                    height: NH[node.type],
                    borderRadius: '50%',
                    background: s.bg,
                    border: `${node.type === 'end' ? '4px' : '2px'} solid ${selected ? '#6366f1' : s.border}`,
                    flexDirection: 'column',
                    gap: 2,
                }}
                onPointerDown={handleDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onClick={handleClick}
            >
                <span style={{ fontSize: '0.68rem', color: s.text, fontWeight: 700, textAlign: 'center', lineHeight: 1.2, padding: '0 6px' }}>
                    {node.title}
                </span>
            </div>
        );
    }

    if (node.type === 'gateway') {
        return (
            <div
                style={{ ...common, width: NW.gateway, height: NH.gateway, background: 'transparent' }}
                onPointerDown={handleDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onClick={handleClick}
            >
                <div style={{
                    position: 'absolute',
                    width: 52, height: 52,
                    background: s.bg,
                    border: `2px solid ${selected ? '#6366f1' : s.border}`,
                    transform: 'rotate(45deg)',
                    boxShadow: ring,
                }} />
                <span style={{ position: 'relative', zIndex: 2, fontSize: '0.65rem', color: s.text, fontWeight: 700, textAlign: 'center', lineHeight: 1.2, padding: '0 4px', maxWidth: 62, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                    {node.title}
                </span>
            </div>
        );
    }

    // task
    return (
        <div
            style={{
                ...common,
                width: NW.task,
                height: NH.task,
                borderRadius: '8px',
                background: s.bg,
                border: `2px solid ${selected ? '#6366f1' : s.border}`,
                flexDirection: 'column',
                padding: '6px 10px',
                gap: 3,
            }}
            onPointerDown={handleDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onClick={handleClick}
        >
            <span style={{ fontSize: '0.78rem', color: s.text, fontWeight: 700, textAlign: 'center', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                {node.title}
            </span>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorkflowDesigner() {
    const [nodes, setNodes] = useState<WorkflowNode[]>(INITIAL_NODES);
    const [edges, setEdges] = useState<Edge[]>(INITIAL_EDGES);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [workflowName, setWorkflowName] = useState('Standard Assembly');
    const [isSaving, setIsSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);
    const [lastSaved, setLastSaved] = useState('');
    const [savedWorkflows, setSavedWorkflows] = useState<{ id: string; name: string }[]>([]);
    const [showPlcInfo, setShowPlcInfo] = useState(false);

    const canvasRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null);

    const selectedNode = nodes.find(n => n.id === selectedId) ?? null;

    useEffect(() => {
        fetch('/api/designer')
            .then(r => r.json())
            .then(d => {
                if (Array.isArray(d.list)) {
                    const map = new Map<string, { id: string; name: string }>();
                    d.list.forEach((w: { id?: string; name?: string }) => {
                        if (w?.name && w?.id && !map.has(w.name)) map.set(w.name, { id: w.id, name: w.name });
                    });
                    setSavedWorkflows(Array.from(map.values()));
                }
            })
            .catch(() => {});
    }, []);

    // ── Drag handlers ──────────────────────────────────────────────────────────

    const handleNodeDown = useCallback((e: React.PointerEvent, id: string) => {
        e.preventDefault();
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        const node = nodes.find(n => n.id === id);
        if (!node) return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        dragRef.current = { id, ox: e.clientX - rect.left - node.x, oy: e.clientY - rect.top - node.y };
        setSelectedId(id);
    }, [nodes]);

    const handleNodeMove = useCallback((e: React.PointerEvent) => {
        if (!dragRef.current) return;
        const { id, ox, oy } = dragRef.current;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const nx = Math.max(0, e.clientX - rect.left - ox);
        const ny = Math.max(0, e.clientY - rect.top - oy);
        setNodes(prev => prev.map(n => n.id === id ? { ...n, x: nx, y: ny } : n));
    }, []);

    const handleNodeUp = useCallback((e: React.PointerEvent) => {
        dragRef.current = null;
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    }, []);

    // ── Canvas drop (new nodes from toolbox) ──────────────────────────────────

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        const type = e.dataTransfer.getData('nodeType') as NodeType;
        if (!type) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left - NW[type] / 2;
        const y = e.clientY - rect.top - NH[type] / 2;
        const newNode: WorkflowNode = {
            id: `node-${Date.now()}`,
            type,
            title: type === 'start' ? 'Start' : type === 'end' ? 'End' : type === 'gateway' ? 'Gateway' : 'New Task',
            x: Math.max(0, x),
            y: Math.max(0, y),
        };
        setNodes(prev => {
            const next = [...prev, newNode];
            // Auto-connect: insert node between adjacent nodes sorted by x
            const sorted = [...next].sort((a, b) => a.x - b.x);
            const idx = sorted.findIndex(n => n.id === newNode.id);
            const leftNode = idx > 0 ? sorted[idx - 1] : null;
            const rightNode = idx < sorted.length - 1 ? sorted[idx + 1] : null;
            if (leftNode && rightNode) {
                setEdges(ev => {
                    const without = ev.filter(e => !(e.from === leftNode.id && e.to === rightNode.id));
                    return [...without, { from: leftNode.id, to: newNode.id }, { from: newNode.id, to: rightNode.id }];
                });
            } else if (leftNode) {
                setEdges(ev => [...ev, { from: leftNode.id, to: newNode.id }]);
            } else if (rightNode) {
                setEdges(ev => [...ev, { from: newNode.id, to: rightNode.id }]);
            }
            return next;
        });
        setSelectedId(newNode.id);
    }

    function updateNode(key: keyof WorkflowNode, value: string | number) {
        if (!selectedId) return;
        setNodes(prev => prev.map(n => n.id === selectedId ? { ...n, [key]: value } : n));
    }

    function deleteNode() {
        if (!selectedId) return;
        setEdges(prev => prev.filter(e => e.from !== selectedId && e.to !== selectedId));
        setNodes(prev => prev.filter(n => n.id !== selectedId));
        setSelectedId(null);
    }

    // ── Save / Deploy ──────────────────────────────────────────────────────────

    async function handleSave() {
        setIsSaving(true);
        try {
            const res = await fetch('/api/designer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: workflowName, payload: JSON.stringify({ nodes, edges }) }),
            });
            if (!res.ok) throw new Error('Save failed');
            const ts = new Date().toLocaleTimeString();
            setLastSaved(ts);
            setSaveMsg(`✅ Saved "${workflowName}" at ${ts}`);
            setTimeout(() => setSaveMsg(null), 3500);
        } catch (e) {
            setSaveMsg(`❌ ${(e as Error).message}`);
            setTimeout(() => setSaveMsg(null), 4000);
        } finally { setIsSaving(false); }
    }

    async function handleDeploy() {
        if (!confirm(`Deploy "${workflowName}" to the shop floor?`)) return;
        try {
            const res = await fetch('/api/designer/deploy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: workflowName }),
            });
            if (!res.ok) throw new Error('Deploy failed');
            setSaveMsg('🚀 Workflow deployed to shop floor!');
            setTimeout(() => setSaveMsg(null), 4000);
        } catch (e) {
            setSaveMsg(`❌ ${(e as Error).message}`);
            setTimeout(() => setSaveMsg(null), 4000);
        }
    }

    function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const { nodes: imported, issues } = parseBpmnXml(reader.result as string);
            if (issues.length) alert('BPMN Import issues:\n' + issues.join('\n'));
            if (imported.length > 0) {
                const placed = imported.map((n, i) => ({ ...n, x: 80 + i * 160, y: 100 + (i % 2) * 80 }));
                setNodes(placed);
                const autoEdges: Edge[] = placed.slice(0, -1).map((n, i) => ({ from: n.id, to: placed[i + 1].id }));
                setEdges(autoEdges);
                setSelectedId(null);
            } else {
                alert(`No BPMN elements found in "${file.name}".`);
            }
        };
        reader.readAsText(file);
    }

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div style={{ height: '85vh', display: 'flex', flexDirection: 'column', position: 'relative', fontFamily: 'inherit' }}>

            {/* Toast */}
            {saveMsg && (
                <div style={{ position: 'fixed', top: '1rem', right: '1rem', zIndex: 2000, padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: 600, color: '#fff', background: saveMsg.startsWith('✅') || saveMsg.startsWith('🚀') ? '#10b981' : '#ef4444', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                    {saveMsg}
                </div>
            )}

            {/* PLC Info Modal */}
            {showPlcInfo && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
                    onClick={e => { if (e.target === e.currentTarget) setShowPlcInfo(false); }}>
                    <div style={{ background: '#fff', borderRadius: '1rem', padding: '2rem', maxWidth: 520, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>What is a PLC?</h2>
                            <button onClick={() => setShowPlcInfo(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={20} /></button>
                        </div>
                        <p style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.6 }}><strong>PLC = Programmable Logic Controller.</strong> A rugged industrial computer on the factory floor that controls machines — CNC mills, robots, conveyors.</p>
                        <div style={{ background: '#f0f9ff', borderRadius: '0.5rem', padding: '1rem', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                            In this MES, demo tick simulates PLC telemetry (temperature, vibration, cycle count). In production, replace with OPC-UA or Modbus TCP.
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.83rem', marginTop: '1rem' }}>
                            {[['OPC-UA', 'Industry standard secure read/write of PLC data'], ['Modbus TCP', 'Legacy protocol for older factory machines'], ['MQTT', 'Lightweight IoT message bus for sensors'], ['RFID', 'Radio tags on parts for automatic traceability']].map(([k, v]) => (
                                <div key={k} style={{ background: '#f9fafb', borderRadius: '0.5rem', padding: '0.75rem' }}>
                                    <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: '0.25rem' }}>{k}</div>
                                    <div style={{ color: '#6b7280' }}>{v}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Header toolbar */}
            <div style={{ padding: '0.85rem 1.25rem', borderBottom: '1px solid #e5e7eb', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1 }}>
                    <input
                        value={workflowName}
                        onChange={e => setWorkflowName(e.target.value)}
                        style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', border: '1.5px solid #e5e7eb', borderRadius: '0.4rem', padding: '0.35rem 0.65rem', background: '#f8fafc', minWidth: 200 }}
                    />
                    <span style={{ padding: '3px 10px', borderRadius: '999px', background: '#fef3c7', color: '#92400e', fontSize: '0.75rem', fontWeight: 700 }}>Draft</span>
                    {lastSaved && <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Saved {lastSaved}</span>}
                    <button onClick={() => setShowPlcInfo(true)} style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '0.4rem', padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', color: '#0369a1', fontWeight: 600 }}>
                        <Info size={14} /> What is PLC?
                    </button>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', borderRadius: '0.4rem', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#374151' }}>
                        <Upload size={15} /> Import BPMN
                        <input type="file" accept=".bpmn,.xml" hidden onChange={handleFileUpload} />
                    </label>
                    <button onClick={() => {
                        const blob = new Blob([exportNodesToBpmn(nodes)], { type: 'application/xml' });
                        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'workflow.bpmn' });
                        a.click(); URL.revokeObjectURL(a.href);
                    }} style={{ padding: '0.5rem 0.9rem', borderRadius: '0.4rem', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', color: '#374151' }}>
                        Export BPMN
                    </button>
                    <button onClick={handleSave} disabled={isSaving} style={{ padding: '0.5rem 0.9rem', borderRadius: '0.4rem', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: isSaving ? 0.7 : 1 }}>
                        <Save size={15} /> {isSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={handleDeploy} style={{ padding: '0.5rem 0.9rem', borderRadius: '0.4rem', border: 'none', background: '#10b981', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Play size={15} /> Deploy
                    </button>
                </div>
            </div>

            {/* Sub-toolbar: saved workflows + export JSON */}
            <div style={{ padding: '0.5rem 1.25rem', borderBottom: '1px solid #f1f5f9', background: '#fafbff', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <label style={{ fontSize: '0.82rem', color: '#6b7280', fontWeight: 600 }}>Load:</label>
                <select onChange={async e => {
                    const name = e.target.value;
                    if (!name) return;
                    try {
                        const r = await fetch(`/api/designer?name=${encodeURIComponent(name)}`);
                        const d = await r.json();
                        if (d.success && d.workflow) {
                            const payload = JSON.parse(d.workflow.payload || '{}');
                            if (payload.nodes) { setNodes(payload.nodes); setEdges(payload.edges ?? []); setSelectedId(null); }
                        }
                    } catch { /* ignore */ }
                }} style={{ padding: '4px 8px', border: '1px solid #e5e7eb', borderRadius: '0.4rem', fontSize: '0.85rem', color: '#374151' }}>
                    <option value="">-- Saved workflows --</option>
                    {savedWorkflows.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                </select>
                <button onClick={() => {
                    const blob = new Blob([JSON.stringify({ nodes, edges }, null, 2)], { type: 'application/json' });
                    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'workflow.json' });
                    a.click(); URL.revokeObjectURL(a.href);
                }} style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: '0.4rem', border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '0.82rem', color: '#6b7280', fontWeight: 600 }}>
                    Export JSON
                </button>
            </div>

            {/* Main editor area */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* Toolbox */}
                <div style={{ width: 180, background: '#fff', borderRight: '1px solid #e5e7eb', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto' }}>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#9ca3af', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Toolbox</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginBottom: '0.75rem' }}>Drag items to canvas</div>
                    {(['start', 'task', 'gateway', 'end'] as NodeType[]).map(type => (
                        <div key={type} draggable onDragStart={e => e.dataTransfer.setData('nodeType', type)}
                            style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', padding: '0.6rem 0.75rem', borderRadius: '0.5rem', border: `1px solid ${NODE_STYLE[type].border}30`, background: `${NODE_STYLE[type].bg}15`, cursor: 'grab', fontSize: '0.85rem', color: NODE_STYLE[type].bg, fontWeight: 600, marginBottom: '0.35rem' }}>
                            <div style={{ width: 14, height: 14, borderRadius: type === 'start' || type === 'end' ? '50%' : type === 'gateway' ? '3px' : '3px', background: NODE_STYLE[type].bg, transform: type === 'gateway' ? 'rotate(45deg)' : 'none', flexShrink: 0 }} />
                            {NODE_STYLE[type].label}
                        </div>
                    ))}

                    <div style={{ marginTop: '1.5rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.5 }}>
                        <strong style={{ color: '#374151' }}>Tips</strong><br />
                        • Drag nodes to reposition<br />
                        • Click to select &amp; edit<br />
                        • Drop between nodes to auto-connect
                    </div>
                </div>

                {/* Canvas */}
                <div
                    ref={canvasRef}
                    style={{ flex: 1, position: 'relative', backgroundImage: 'radial-gradient(#d1d5db 1px, transparent 1px)', backgroundSize: '24px 24px', overflow: 'auto', cursor: 'default' }}
                    onClick={() => setSelectedId(null)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={handleDrop}
                >
                    {/* SVG arrow layer */}
                    <ArrowLayer nodes={nodes} edges={edges} />

                    {/* Nodes */}
                    {nodes.map(node => (
                        <NodeShape
                            key={node.id}
                            node={node}
                            selected={selectedId === node.id}
                            onDown={handleNodeDown}
                            onClick={setSelectedId}
                            onMove={handleNodeMove}
                            onUp={handleNodeUp}
                        />
                    ))}
                </div>

                {/* Properties Panel */}
                <div style={{ width: 260, background: '#fff', borderLeft: '1px solid #e5e7eb', padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#9ca3af', fontWeight: 700, letterSpacing: '0.08em' }}>Properties</div>

                    {selectedNode ? (
                        <>
                            <div style={{ padding: '0.6rem 0.8rem', borderRadius: '0.5rem', background: `${NODE_STYLE[selectedNode.type].bg}18`, borderLeft: `4px solid ${NODE_STYLE[selectedNode.type].bg}`, fontSize: '0.8rem', fontWeight: 700, color: NODE_STYLE[selectedNode.type].bg }}>
                                {NODE_STYLE[selectedNode.type].label}
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#6b7280', marginBottom: '0.3rem' }}>ID</label>
                                <input readOnly value={selectedNode.id} style={{ width: '100%', padding: '6px 8px', borderRadius: '0.4rem', border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: '0.82rem', color: '#9ca3af', boxSizing: 'border-box' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>Label</label>
                                <input value={selectedNode.title} onChange={e => updateNode('title', e.target.value)}
                                    style={{ width: '100%', padding: '6px 8px', borderRadius: '0.4rem', border: '1.5px solid #e5e7eb', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>X</label>
                                    <input type="number" value={Math.round(selectedNode.x)} onChange={e => updateNode('x', parseInt(e.target.value) || 0)}
                                        style={{ width: '100%', padding: '6px 8px', borderRadius: '0.4rem', border: '1.5px solid #e5e7eb', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>Y</label>
                                    <input type="number" value={Math.round(selectedNode.y)} onChange={e => updateNode('y', parseInt(e.target.value) || 0)}
                                        style={{ width: '100%', padding: '6px 8px', borderRadius: '0.4rem', border: '1.5px solid #e5e7eb', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                                </div>
                            </div>

                            {selectedNode.type === 'task' && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem' }}>Connections</label>
                                    <div style={{ fontSize: '0.78rem', color: '#6b7280', background: '#f9fafb', borderRadius: '0.4rem', padding: '0.5rem 0.75rem' }}>
                                        From: {edges.filter(e => e.to === selectedNode.id).map(e => e.from).join(', ') || '—'}<br />
                                        To: {edges.filter(e => e.from === selectedNode.id).map(e => e.to).join(', ') || '—'}
                                    </div>
                                </div>
                            )}

                            <button onClick={deleteNode} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.55rem', borderRadius: '0.4rem', border: 'none', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', marginTop: 'auto' }}>
                                <Trash2 size={15} /> Delete Node
                            </button>
                        </>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.85rem', textAlign: 'center' }}>
                            Click a node<br />to edit its properties
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── BPMN helpers ─────────────────────────────────────────────────────────────

function parseBpmnXml(xmlText: string): { nodes: WorkflowNode[]; issues: string[] } {
    const issues: string[] = [];
    const nodes: WorkflowNode[] = [];
    try {
        const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) { issues.push('Invalid XML'); return { nodes, issues }; }
        const process = doc.getElementsByTagName('process')[0];
        if (!process) { issues.push('No <process> element'); return { nodes, issues }; }
        for (const el of Array.from(process.getElementsByTagName('startEvent')))
            nodes.push({ id: el.getAttribute('id') || 'start', type: 'start', title: el.getAttribute('name') || 'Start', x: 0, y: 0 });
        for (const tag of ['userTask', 'serviceTask', 'task', 'manualTask'])
            for (const el of Array.from(process.getElementsByTagName(tag)))
                nodes.push({ id: el.getAttribute('id') || `task-${Date.now()}`, type: 'task', title: el.getAttribute('name') || 'Task', x: 0, y: 0 });
        for (const el of Array.from(process.getElementsByTagName('exclusiveGateway')).concat(Array.from(process.getElementsByTagName('inclusiveGateway'))))
            nodes.push({ id: el.getAttribute('id') || 'gate', type: 'gateway', title: el.getAttribute('name') || 'Gateway', x: 0, y: 0 });
        for (const el of Array.from(process.getElementsByTagName('endEvent')))
            nodes.push({ id: el.getAttribute('id') || 'end', type: 'end', title: el.getAttribute('name') || 'End', x: 0, y: 0 });
        if (nodes.length === 0) issues.push('No BPMN nodes found');
    } catch (e) { issues.push('Parse error: ' + (e as Error).message); }
    return { nodes, issues };
}

function exportNodesToBpmn(nodes: WorkflowNode[]): string {
    const id = 'Process_' + Date.now();
    const start = nodes.find(n => n.type === 'start') || nodes[0];
    const end = nodes.find(n => n.type === 'end') || nodes[nodes.length - 1];
    const tasks = nodes.filter(n => n.type === 'task');
    const gateways = nodes.filter(n => n.type === 'gateway');
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const elems = [
        `<startEvent id="${start.id}" name="${esc(start.title)}"/>`,
        ...tasks.map(t => `<userTask id="${t.id}" name="${esc(t.title)}"/>`),
        ...gateways.map(g => `<exclusiveGateway id="${g.id}" name="${esc(g.title)}"/>`),
        `<endEvent id="${end.id}" name="${esc(end.title)}"/>`,
    ];
    const seq = [start, ...tasks, ...gateways, end].sort((a, b) => a.x - b.x);
    const flows = seq.slice(0, -1).map((n, i) => `<sequenceFlow id="f${i}" sourceRef="${n.id}" targetRef="${seq[i + 1].id}"/>`);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="http://partraceflow.local">\n  <process id="${id}" isExecutable="true">\n    ${[...elems, ...flows].join('\n    ')}\n  </process>\n</definitions>`;
}
