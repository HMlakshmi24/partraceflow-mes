import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Unauthorized',
  description: 'You do not have permission to view this page.',
};

export default function UnauthorizedPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 520,
          width: '100%',
          borderRadius: 16,
          padding: 28,
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <div style={{ fontSize: 44, marginBottom: 12 }}>⛔</div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>Unauthorized</h1>
        <p style={{ marginTop: 10, color: 'var(--muted-foreground)', fontSize: 14, lineHeight: 1.6 }}>
          Your account does not have the required role permissions to access this resource.
        </p>

        <div style={{ marginTop: 18, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a
            href="/login"
            style={{
              textDecoration: 'none',
              padding: '10px 16px',
              borderRadius: 10,
              background: '#3b82f6',
              color: '#fff',
              fontWeight: 900,
            }}
          >
            Go to Login
          </a>
          <a
            href="/dashboard"
            style={{
              textDecoration: 'none',
              padding: '10px 16px',
              borderRadius: 10,
              background: 'transparent',
              color: 'var(--foreground)',
              border: '1px solid var(--card-border)',
              fontWeight: 800,
            }}
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

