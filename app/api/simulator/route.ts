import { FactorySimulator } from '@/lib/engines';
import { MOCK_EQUIPMENT, MOCK_OPERATORS } from '@/lib/engines';
import { NextRequest } from 'next/server';

let simulator: FactorySimulator | null = null;

function getSimulator() {
    if (!simulator) {
        simulator = new FactorySimulator();
        setupSimulator(simulator);
    }
    return simulator;
}

function setupSimulator(sim: FactorySimulator) {
    for (const equipment of MOCK_EQUIPMENT) {
        sim.addMachine({
            id: equipment.id,
            name: equipment.name,
            type: equipment.type,
            cycleTime: equipment.cycleTime * 1000,
            efficiency: 0.88,
            reliability: 0.95,
            quality: 0.97,
        });
    }

    for (const operator of MOCK_OPERATORS) {
        sim.addOperator({
            id: operator.id,
            name: operator.name,
            shift: operator.shift,
            skills: operator.skills,
        });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, scenario } = body;

        const factorySimulator = getSimulator();

        if (action === 'runScenario') {
            if (!scenario) {
                return Response.json(
                    { error: 'scenario is required' },
                    { status: 400 }
                );
            }

            return new Promise((resolve) => {
                factorySimulator.onEvent((event) => {
                    if (event.type === 'scenario.completed') {
                        const stats = factorySimulator.getStatistics();
                        resolve(
                            Response.json({
                                success: true,
                                statistics: stats,
                            })
                        );
                    }
                });

                factorySimulator.runScenario(scenario);
            });
        }

        if (action === 'getStatistics') {
            const stats = factorySimulator.getStatistics();

            return Response.json({
                success: true,
                statistics: stats,
            });
        }

        return Response.json(
            { error: 'Unknown action' },
            { status: 400 }
        );
    } catch (error) {
        console.error('Simulator API error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
