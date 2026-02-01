'use client';

import { useState } from 'react';
import { Save, Play, Square, Circle, GitBranch, Trash2, Upload } from 'lucide-react';
import { saveWorkflow, deployWorkflow } from '@/lib/actions/designer';

type NodeType = 'start' | 'task' | 'gateway' | 'end';

interface WorkflowNode {
    id: string;
    type: NodeType;
    title: string;
    x: number;
    y: number;
}

const INITIAL_NODES: WorkflowNode[] = [
    { id: 'start', type: 'start', title: 'Start', x: 100, y: 150 },
    { id: 'task1', type: 'task', title: 'Assembly Step 1', x: 250, y: 140 },
    { id: 'gate1', type: 'gateway', title: 'Quality Check', x: 450, y: 140 },
    { id: 'end', type: 'end', title: 'Finish', x: 650, y: 150 },
];

export default function WorkflowDesigner() {
    const [nodes, setNodes] = useState<WorkflowNode[]>(INITIAL_NODES);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<string>('');

    const selectedNode = nodes.find(n => n.id === selectedId);

    // Update Node Property
    function updateNode(key: keyof WorkflowNode, value: string | number) {
        if (!selectedId) return;
        setNodes(nodes.map(n => n.id === selectedId ? { ...n, [key]: value } : n));
    }

    // Delete Node
    function deleteNode() {
        if (!selectedId) return;
        setNodes(nodes.filter(n => n.id !== selectedId));
        setSelectedId(null);
    }

    // Drag & Drop Handlers
    function handleDragStart(e: React.DragEvent, type: NodeType) {
        e.dataTransfer.setData('nodeType', type);
    }

    function handleDragOver(e: React.DragEvent) {
        e.preventDefault(); // Allow drop
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        const type = e.dataTransfer.getData('nodeType') as NodeType;
        if (!type) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left - 50; // Center offset
        const y = e.clientY - rect.top - 40;

        const newNode: WorkflowNode = {
            id: `node-${Date.now()}`,
            type,
            title: type === 'start' ? 'Start' : type === 'end' ? 'End' : 'New Task',
            x,
            y
        };

        setNodes([...nodes, newNode]);
        setSelectedId(newNode.id);
    }

    // File Upload Handler
    function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        if (e.target.files && e.target.files[0]) {
            alert(`File "${e.target.files[0].name}" uploaded to workflow context.`);
        }
    }

    async function handleSave() {
        setIsSaving(true);
        // In real app, we send `nodes` to server
        await saveWorkflow('wf-bracket');
        setTimeout(() => {
            setIsSaving(false);
            setLastSaved(new Date().toLocaleTimeString());
        }, 500);
    }

    async function handleDeploy() {
        if (!confirm('Deploy this workflow to production?')) return;
        await deployWorkflow('wf-bracket');
        alert('Workflow Deployed Successfully!');
    }

    return (
        <div style={{ height: '85vh', display: 'flex', flexDirection: 'column' }}>

            {/* TOOLBAR */}
            <div style={{
                padding: '1rem', borderBottom: '1px solid #ddd', backgroundColor: 'white',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontWeight: 'bold', color: 'var(--primary)' }}>Workflow Editor: Standard Assembly</h2>
                    <span className="status-badge warning">Draft</span>
                    {lastSaved && <span style={{ fontSize: '0.8rem', color: '#666' }}>Saved: {lastSaved}</span>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <label className="btn-primary-large" style={{ minWidth: 'auto', minHeight: '40px', fontSize: '14px', backgroundColor: '#fff', color: '#333', border: '1px solid #ddd', cursor: 'pointer' }}>
                        <Upload size={16} /> Import BPMN
                        <input type="file" accept=".bpmn,.xml" hidden onChange={handleFileUpload} />
                    </label>
                    <button className="btn-primary-large" style={{ minWidth: 'auto', minHeight: '40px', fontSize: '14px', backgroundColor: '#666' }} onClick={handleSave}>
                        <Save size={16} /> Save
                    </button>
                    <button className="btn-primary-large" style={{ minWidth: 'auto', minHeight: '40px', fontSize: '14px' }} onClick={handleDeploy}>
                        <Play size={16} /> Deploy
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, display: 'flex', backgroundColor: '#f0f0f0', overflow: 'hidden' }}>

                {/* PALETTE */}
                <div style={{ width: '200px', backgroundColor: 'white', borderRight: '1px solid #ddd', padding: '1rem' }}>
                    <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#888', marginBottom: '1rem' }}>Toolbox</h3>
                    <p className="text-xs text-gray-400 mb-2">Drag items to canvas</p>

                    <div draggable onDragStart={(e) => handleDragStart(e, 'start')}>
                        <ToolItem icon={<Circle size={18} />} label="Start Event" />
                    </div>
                    <div draggable onDragStart={(e) => handleDragStart(e, 'task')}>
                        <ToolItem icon={<Square size={18} />} label="Human Task" />
                    </div>
                    <div draggable onDragStart={(e) => handleDragStart(e, 'gateway')}>
                        <ToolItem icon={<GitBranch size={18} />} label="Gateway" />
                    </div>
                    <div draggable onDragStart={(e) => handleDragStart(e, 'end')}>
                        <ToolItem icon={<Circle size={18} style={{ border: '3px solid black' }} />} label="End Event" />
                    </div>
                </div>

                {/* CANVAS */}
                <div
                    style={{ flex: 1, position: 'relative', backgroundImage: 'radial-gradient(#ccc 1px, transparent 1px)', backgroundSize: '20px 20px', overflow: 'auto' }}
                    onClick={() => setSelectedId(null)}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                >
                    {nodes.map(node => (
                        <div key={node.id}
                            onClick={(e) => { e.stopPropagation(); setSelectedId(node.id); }}
                            style={{
                                position: 'absolute',
                                left: node.x,
                                top: node.y,
                                width: node.type === 'start' || node.type === 'end' ? '60px' : '120px',
                                height: node.type === 'start' || node.type === 'end' ? '60px' : '80px',
                                backgroundColor: selectedId === node.id ? '#e3f2fd' : 'white',
                                border: selectedId === node.id ? '2px solid var(--secondary)' : '1px solid #999',
                                borderRadius: node.type === 'start' || node.type === 'end' ? '50%' : '8px',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '2px 2px 5px rgba(0,0,0,0.1)', cursor: 'grab',
                                zIndex: 10
                            }}
                        >
                            {node.type === 'start' && <Circle size={24} />}
                            {node.type === 'end' && <Circle size={24} style={{ border: '3px solid black', borderRadius: '50%' }} />}
                            {node.type === 'task' && <Square size={24} />}
                            {node.type === 'gateway' && <GitBranch size={24} />}

                            {node.type !== 'start' && node.type !== 'end' && (
                                <div style={{ fontSize: '0.75rem', marginTop: '5px', textAlign: 'center', lineHeight: '1' }}>
                                    {node.title}
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Simple Arrows (Simplified connection lines) */}
                    <Arrow x1={150} y1={180} x2={250} y2={180} />
                </div>

                {/* PROPERTIES */}
                {selectedNode ? (
                    <div style={{ width: '280px', backgroundColor: 'white', borderLeft: '1px solid #ddd', padding: '1rem' }}>
                        <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: '#888', marginBottom: '1rem' }}>Properties</h3>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold' }}>ID</label>
                            <input type="text" value={selectedNode.id} disabled style={{ width: '100%', padding: '8px', backgroundColor: '#f0f0f0', border: '1px solid #ddd' }} />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold' }}>Step Name</label>
                            <input type="text" value={selectedNode.title} onChange={(e) => updateNode('title', e.target.value)}
                                style={{ width: '100%', padding: '8px', border: '1px solid #ddd' }} />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold' }}>Position X</label>
                            <input type="number" value={selectedNode.x} onChange={(e) => updateNode('x', parseInt(e.target.value))}
                                style={{ width: '100%', padding: '8px', border: '1px solid #ddd' }} />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold' }}>Attachments</label>
                            <input type="file" style={{ width: '100%', fontSize: '0.8rem' }} />
                        </div>

                        <button className="btn-primary-large"
                            style={{ backgroundColor: '#d32f2f', minHeight: '40px', fontSize: '14px', width: '100%' }}
                            onClick={deleteNode}
                        >
                            <Trash2 size={16} /> Delete Node
                        </button>
                    </div>
                ) : (
                    <div style={{ width: '280px', backgroundColor: 'white', borderLeft: '1px solid #ddd', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                        Select a node to edit
                    </div>
                )}

            </div>
        </div>
    );
}

function ToolItem({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px', marginBottom: '5px', border: '1px solid transparent', borderRadius: '4px', fontSize: '0.9rem', color: '#555', cursor: 'grab' }}>
            {icon} {label}
        </div>
    )
}

function Arrow({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
    return (
        <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#999" strokeWidth="2" markerEnd="url(#arrowhead)" />
            <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#999" />
                </marker>
            </defs>
        </svg>
    )
}
