import type { Metadata } from "next";
import { Sora, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import GlobalSidebar from "@/components/GlobalSidebar";
import PLCConnection from "@/components/PLCConnection";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/components/ThemeProvider";
import SessionGuard from "@/components/SessionGuard";

const sora = Sora({
  variable: "--font-sans",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ParTraceflow MES",
  description: "Industry 4.0 Manufacturing Execution System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sora.variable} ${plexMono.variable} theme-transition`} style={{ margin: 0, display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
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
