import { TraceabilityEngine } from '@/lib/engines';
import { NextRequest } from 'next/server';

let engine: TraceabilityEngine | null = null;

function getEngine() {
    if (!engine) {
        engine = new TraceabilityEngine();
    }
    return engine;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, batchNumber, productCode, quantity, operatorId, operatorName, batchId, ...data } = body;

        const traceEngine = getEngine();

        if (action === 'createBatch') {
            if (!batchNumber || !productCode || !quantity || !operatorId || !operatorName) {
                return Response.json(
                    { error: 'Missing required fields' },
                    { status: 400 }
                );
            }

            const batch = traceEngine.createBatch(
                batchNumber,
                productCode,
                quantity,
                operatorId,
                operatorName
            );

            return Response.json({
                success: true,
                batch: {
                    id: batch.id,
                    batchNumber: batch.batchNumber,
                    productCode: batch.productCode,
                    quantity: batch.quantity,
                    status: batch.status,
                    createdAt: batch.createdAt,
                },
            });
        }

        if (action === 'addMaterial') {
            if (!batchId) {
                return Response.json(
                    { error: 'batchId is required' },
                    { status: 400 }
                );
            }

            traceEngine.addMaterial(
                batchId,
                data.material,
                operatorId,
                operatorName
            );

            return Response.json({ success: true });
        }

        if (action === 'recordQualityTest') {
            if (!batchId) {
                return Response.json(
                    { error: 'batchId is required' },
                    { status: 400 }
                );
            }

            traceEngine.recordQualityTest(
                batchId,
                data.test,
                operatorId,
                operatorName
            );

            return Response.json({ success: true });
        }

        if (action === 'approveBatch') {
            if (!batchId) {
                return Response.json(
                    { error: 'batchId is required' },
                    { status: 400 }
                );
            }

            traceEngine.approveBatch(batchId, operatorName, operatorId);

            return Response.json({ success: true });
        }

        if (action === 'getReport') {
            if (!batchId) {
                return Response.json(
                    { error: 'batchId is required' },
                    { status: 400 }
                );
            }

            const report = traceEngine.generateBatchReport(batchId);

            return Response.json({
                success: true,
                report: {
                    batchNumber: report.content.batchNumber,
                    productCode: report.content.productCode,
                    status: report.content.status,
                    materials: report.content.materials,
                    qualityTests: report.content.qualityTests,
                    approvals: report.content.approvals,
                },
            });
        }

        return Response.json(
            { error: 'Unknown action' },
            { status: 400 }
        );
    } catch (error) {
        console.error('Batch API error:', error);
        return Response.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
