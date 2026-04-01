import { NextResponse } from 'next/server';

export async function GET() {
    const spec = {
        openapi: '3.0.0',
        info: {
            title: 'ParTraceflow MES API',
            version: '1.0.0',
            description: 'Manufacturing Execution System — Real-time factory floor management, OEE analytics, quality gate, traceability, and AI copilot.',
            contact: { name: 'API Support', email: 'api@partraceflow.com' },
        },
        servers: [
            { url: '/api', description: 'Current server' },
        ],
        tags: [
            { name: 'Machines', description: 'Machine inventory and live telemetry' },
            { name: 'OEE', description: 'Overall Equipment Effectiveness calculations' },
            { name: 'Orders', description: 'Work order management' },
            { name: 'Quality', description: 'Quality gate and inspection records' },
            { name: 'Downtime', description: 'Downtime events and KPIs' },
            { name: 'Dashboard', description: 'Aggregated KPI snapshots' },
            { name: 'Andon', description: 'Andon alert board system' },
            { name: 'Maintenance', description: 'Predictive maintenance health scores' },
            { name: 'Copilot', description: 'AI-powered MES Q&A' },
            { name: 'System', description: 'Health, streaming, demo data' },
        ],
        paths: {
            '/health': {
                get: {
                    tags: ['System'],
                    summary: 'Server health check',
                    responses: { '200': { description: 'DB status, uptime, and response time' } },
                },
            },
            '/machines': {
                get: {
                    tags: ['Machines'],
                    summary: 'List all machines with status and production line',
                    responses: { '200': { description: '{ machines: Machine[] }' } },
                },
            },
            '/machines/telemetry': {
                get: {
                    tags: ['Machines'],
                    summary: 'Latest telemetry for all machines (deduped by signalName)',
                    responses: { '200': { description: '{ telemetry: TelemetryPoint[] }' } },
                },
            },
            '/machines/{id}/telemetry': {
                get: {
                    tags: ['Machines'],
                    summary: 'Latest telemetry for a specific machine',
                    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
                    responses: { '200': { description: 'Array of signal values' } },
                },
            },
            '/oee': {
                get: {
                    tags: ['OEE'],
                    summary: 'Calculate OEE for machines over a time period',
                    parameters: [
                        { name: 'machineId', in: 'query', schema: { type: 'string' } },
                        { name: 'plantId', in: 'query', schema: { type: 'string' } },
                        { name: 'hours', in: 'query', schema: { type: 'integer', default: 8 } },
                    ],
                    responses: { '200': { description: 'OEE result with availability, performance, quality breakdown' } },
                },
            },
            '/dashboard': {
                get: {
                    tags: ['Dashboard'],
                    summary: 'Aggregated KPI snapshot: OEE, downtime pareto, scrap pareto, production timeline',
                    parameters: [
                        { name: 'period', in: 'query', schema: { type: 'string', enum: ['day', 'shift', 'week'] } },
                    ],
                    responses: { '200': { description: '{ oee, machines, downtime, scrap, production }' } },
                },
            },
            '/orders': {
                get: {
                    tags: ['Orders'],
                    summary: 'List work orders with pagination and search',
                    parameters: [
                        { name: 'status', in: 'query', schema: { type: 'string' } },
                        { name: 'page', in: 'query', schema: { type: 'integer' } },
                        { name: 'search', in: 'query', schema: { type: 'string' } },
                    ],
                    responses: { '200': { description: '{ orders, total, page }' } },
                },
            },
            '/quality': {
                get: {
                    tags: ['Quality'],
                    summary: 'List inspectable work orders or inspection history for an order',
                    parameters: [{ name: 'orderId', in: 'query', schema: { type: 'string' } }],
                    responses: { '200': { description: 'Work order list or inspection history array' } },
                },
                post: {
                    tags: ['Quality'],
                    summary: 'Submit inspection result (PASS/FAIL/REWORK)',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        workOrderId: { type: 'string' },
                                        inspector: { type: 'string' },
                                        result: { type: 'string', enum: ['PASS', 'FAIL', 'REWORK'] },
                                        measurements: { type: 'object' },
                                        visualChecks: { type: 'object' },
                                    },
                                    required: ['workOrderId', 'inspector', 'result'],
                                },
                            },
                        },
                    },
                    responses: { '200': { description: 'Inspection record created, order status updated' } },
                },
            },
            '/downtime': {
                get: {
                    tags: ['Downtime'],
                    summary: 'Downtime events by machine, open events, or history',
                    parameters: [
                        { name: 'machineId', in: 'query', schema: { type: 'string' } },
                        { name: 'open', in: 'query', schema: { type: 'boolean' } },
                        { name: 'action', in: 'query', schema: { type: 'string', enum: ['history'] } },
                        { name: 'limit', in: 'query', schema: { type: 'integer' } },
                    ],
                    responses: { '200': { description: 'Downtime events array or KPI object' } },
                },
                post: {
                    tags: ['Downtime'],
                    summary: 'Start or end a downtime event',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        action: { type: 'string', enum: ['start', 'end'] },
                                        machineId: { type: 'string' },
                                        reasonId: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                    responses: { '200': { description: 'Downtime event created or closed' } },
                },
            },
            '/andon': {
                get: {
                    tags: ['Andon'],
                    summary: 'Get Andon boards and active alerts',
                    parameters: [
                        { name: 'boardId', in: 'query', schema: { type: 'string' } },
                        { name: 'active', in: 'query', schema: { type: 'boolean' } },
                    ],
                    responses: { '200': { description: 'Boards with display zones or active alerts' } },
                },
                post: {
                    tags: ['Andon'],
                    summary: 'Trigger, acknowledge, or resolve an Andon alert',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        action: { type: 'string', enum: ['trigger', 'acknowledge', 'resolve'] },
                                        boardId: { type: 'string' },
                                        color: { type: 'string', enum: ['RED', 'YELLOW', 'BLUE', 'GREEN'] },
                                        message: { type: 'string' },
                                        eventId: { type: 'string' },
                                    },
                                },
                            },
                        },
                    },
                    responses: { '200': { description: 'Alert created, acknowledged, or resolved' } },
                },
            },
            '/maintenance/predict': {
                get: {
                    tags: ['Maintenance'],
                    summary: 'Machine health scores and failure predictions',
                    parameters: [{ name: 'machineId', in: 'query', schema: { type: 'string' } }],
                    responses: { '200': { description: 'Health score, failure probability, maintenance recommendation' } },
                },
            },
            '/bottleneck/scan': {
                get: {
                    tags: ['Dashboard'],
                    summary: 'Scan production for bottlenecks and queue buildup',
                    parameters: [{ name: 'plantId', in: 'query', schema: { type: 'string' } }],
                    responses: { '200': { description: '{ bottlenecks, count, scannedAt }' } },
                },
            },
            '/copilot/analyze': {
                post: {
                    tags: ['Copilot'],
                    summary: 'Ask the MES AI Copilot a question about factory data',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        question: { type: 'string' },
                                        sessionId: { type: 'string' },
                                    },
                                    required: ['question'],
                                },
                            },
                        },
                    },
                    responses: { '200': { description: 'AI response with intent, answer, and follow-up suggestions' } },
                },
                get: {
                    tags: ['Copilot'],
                    summary: 'Retrieve a copilot session with full query history',
                    parameters: [{ name: 'sessionId', in: 'query', required: true, schema: { type: 'string' } }],
                    responses: { '200': { description: 'Session with queries' } },
                },
            },
            '/stream': {
                get: {
                    tags: ['System'],
                    summary: 'Server-Sent Events stream for real-time factory events',
                    responses: {
                        '200': {
                            description: 'SSE stream — events: machine.status.changed, machine.telemetry.received, andon.triggered, etc.',
                            content: { 'text/event-stream': { schema: { type: 'string' } } },
                        },
                    },
                },
            },
            '/demo': {
                get: {
                    tags: ['System'],
                    summary: 'Get demo data status (isSeeded, machine count, etc.)',
                    responses: { '200': { description: 'Demo status object' } },
                },
                post: {
                    tags: ['System'],
                    summary: 'Seed demo data or run a simulation tick',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: { action: { type: 'string', enum: ['seed', 'tick'] } },
                                },
                            },
                        },
                    },
                    responses: { '200': { description: 'Seed or tick result' } },
                },
            },
            '/session': {
                get: {
                    tags: ['System'],
                    summary: 'Get current user role from session cookie',
                    responses: { '200': { description: '{ role: string }' } },
                },
                post: {
                    tags: ['System'],
                    summary: 'Set user role in session cookie',
                    requestBody: {
                        required: true,
                        content: { 'application/json': { schema: { type: 'object', properties: { role: { type: 'string' } } } } },
                    },
                    responses: { '200': { description: 'Role set successfully' } },
                },
            },
        },
        components: {
            schemas: {
                Machine: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        code: { type: 'string', example: 'W21' },
                        name: { type: 'string', example: 'CNC Milling Center' },
                        status: { type: 'string', enum: ['IDLE', 'RUNNING', 'DOWN', 'MAINTENANCE'] },
                        oee: { type: 'number', example: 83.5 },
                    },
                },
                OEEResult: {
                    type: 'object',
                    properties: {
                        machineId: { type: 'string' },
                        oee: { type: 'number' },
                        availability: { type: 'number' },
                        performance: { type: 'number' },
                        quality: { type: 'number' },
                    },
                },
            },
        },
    };

    return NextResponse.json(spec, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
