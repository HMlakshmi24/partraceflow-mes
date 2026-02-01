import { DMNEngine } from '@/lib/engines';
import { NextRequest } from 'next/server';

let engine: DMNEngine | null = null;

function getEngine() {
    if (!engine) {
        engine = new DMNEngine();
        setupDecisions(engine);
    }
    return engine;
}

function setupDecisions(engine: DMNEngine) {
    // Register your decision tables here
    // See COMPLETE_EXAMPLES.ts for examples
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, decisionId, inputs } = body;

        const dmnEngine = getEngine();

        if (action === 'evaluate') {
            if (!decisionId || !inputs) {
                return Response.json(
                    { error: 'decisionId and inputs are required' },
                    { status: 400 }
                );
            }

            const result = await dmnEngine.evaluateDecision(decisionId, inputs);

            return Response.json({
                success: true,
                result: {
                    decisionId: decisionId, // Use the input decisionId since it's not in result
                    outputs: result.outputs,
                    ruleId: result.ruleId,
                    evaluatedAt: new Date(),
                },
            });
        }

        return Response.json(
            { error: 'Unknown action' },
            { status: 400 }
        );
    } catch (error) {
        console.error('Decision API error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
