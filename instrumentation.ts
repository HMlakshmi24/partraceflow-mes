/**
 * Next.js instrumentation hook — runs once when the server starts.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { validateEnvironment } = await import('@/lib/validateEnvironment');
        validateEnvironment();

        const { MQTTService } = await import('@/lib/services/MQTTService');
        void MQTTService.bootstrap();
    }
}
