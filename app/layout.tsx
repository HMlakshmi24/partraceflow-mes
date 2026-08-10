import type { Metadata } from "next";
import "./globals.css";
import GlobalSidebar from "@/components/GlobalSidebar";
import PLCConnection from "@/components/PLCConnection";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/components/ThemeProvider";
import SessionGuard from "@/components/SessionGuard";
import PwaRegistrar from "@/components/PwaRegistrar";





export const metadata: Metadata = {
  title: "ParTraceflow MES",
  description: "Industry 4.0 Manufacturing Execution System",
  icons: {
    icon: '/favicon.ico',
    apple: '/favicon-192.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png" />
        <link rel="apple-touch-icon" href="/favicon-192.png" />

        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f2a4a" />
      </head>
      <body className="theme-transition" style={{ margin: 0, display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <PwaRegistrar />
          <SessionGuard />

          <PLCConnection />
          <GlobalSidebar />
          <div style={{ flex: 1, overflow: 'auto', position: 'relative', background: 'var(--background)' }}>
            <ErrorBoundary>{children}</ErrorBoundary>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}

