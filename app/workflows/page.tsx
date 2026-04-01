import Link from 'next/link';

export default function WorkflowsIndexPage() {
    return (
        <div style={{ padding: '2.5rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700 }}>Workflows</h1>
            <p style={{ marginTop: '0.75rem', color: '#64748b' }}>
                Manage workflow definitions and publish to the shop floor.
            </p>
            <div style={{ marginTop: '1.5rem' }}>
                <Link href="/workflows/designer" style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1.25rem',
                    borderRadius: '0.6rem',
                    background: '#2563eb',
                    color: '#fff',
                    textDecoration: 'none',
                    fontWeight: 600
                }}>
                    Open Workflow Designer
                </Link>
            </div>
        </div>
    );
}
