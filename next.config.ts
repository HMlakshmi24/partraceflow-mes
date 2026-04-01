import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Fix Turbopack root detection warning when multiple lockfiles exist
    turbopack: {
        root: __dirname,
    },

    // ── Security headers on every response ────────────────────────────────────
    // (Additional headers are also set in middleware.ts per-request)
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    { key: 'X-DNS-Prefetch-Control', value: 'on' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
                ],
            },
            {
                // CORS for API routes — restrict to same origin in production
                source: '/api/(.*)',
                headers: [
                    { key: 'Access-Control-Allow-Origin',  value: process.env.ALLOWED_ORIGIN ?? '*' },
                    { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
                    { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-API-Key' },
                ],
            },
        ];
    },

    // ── Performance ───────────────────────────────────────────────────────────
    compress: true,
    poweredByHeader: false,   // Don't expose X-Powered-By: Next.js

    // ── Image optimisation ─────────────────────────────────────────────────────
    images: {
        formats: ['image/avif', 'image/webp'],
    },

    // ── Production logging ─────────────────────────────────────────────────────
    // Set LOG_LEVEL=debug in .env for verbose output
    // logging: { fetches: { fullUrl: process.env.LOG_LEVEL === 'debug' } },
};

export default nextConfig;
