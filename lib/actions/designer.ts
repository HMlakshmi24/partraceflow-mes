'use server';

import { prisma } from '@/lib/services/database';

/**
 * Designer Actions
 *
 * These server actions are small helpers called by the `WorkflowDesigner` UI.
 * They are intentionally light-weight here as placeholders/stubs so the UI
 * remains functional during development. Other developers can extend these
 * to persist full BPMN/JSON workflow payloads and to integrate with the
 * runtime engine.
 */

export async function saveWorkflow(workflowId: string) {
    // Persist a minimal workflow record. In future, accept a full payload from
    // the client (BPMN or JSON) and validate it before persisting.
    try {
        const existing = await prisma.workflowDefinition.findFirst({ where: { name: workflowId } });

        if (existing) {
            await prisma.workflowDefinition.update({ where: { id: existing.id }, data: { payload: '{}' } });
        } else {
            await prisma.workflowDefinition.create({ data: { name: workflowId, payload: '{}' } });
        }

        return { success: true };
    } catch (e) {
        console.error('saveWorkflow failed:', e);
        return { success: false, error: (e as Error).message };
    }
}

export async function deployWorkflow(workflowId: string) {
    // Deploying a workflow should push the serialized workflow to the
    // orchestration runtime and mark it as active. For now we record an
    // audit event so there's a persistent trace in the DB.

    await prisma.systemEvent.create({
        data: {
            eventType: 'DEPLOY_WORKFLOW',
            details: `Deployed workflow ${workflowId} to Production`,
        },
    });

    return { success: true };
}
