'use server';

import { prisma } from '@/lib/services/database';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const createOrderSchema = z.object({
    orderNumber: z.string().min(3, "Order # must be at least 3 chars"),
    productId: z.string().min(1, "Product required"),
    quantity: z.coerce.number().min(1, "Quantity must be > 0"),
});

export async function getProducts() {
    return await prisma.product.findMany();
}

export async function createManufacturingOrder(formData: FormData): Promise<void> {
    const raw = {
        orderNumber: formData.get('orderNumber'),
        productId: formData.get('productId'),
        quantity: formData.get('quantity'),
    };

    const validation = createOrderSchema.safeParse(raw);

    if (!validation.success) {
        console.error('Validation error:', validation.error.message);
        return;
    }

    const { orderNumber, productId, quantity } = validation.data;

    try {
        // Fetch Product to get Workflow info. 
        // In this simplified schema, Product doesn't directly link to WorkflowStepDef easily 
        // unless we added a workflowId on Product or similar. 
        // The mock DB had `workflowId` on Product. 
        // The Schema I saw earlier: `Product` has NO workflowId. 
        // `WorkflowStepDef` is independent.
        // We need to assume a standard workflow or fetch it.
        // Let's check Schema again. `Product` has `sku`, `name`, `description`.
        // `WorkflowStepDef` exists.

        // FOR NOW: We will fetch ALL WorkflowStepDefs (assuming single workflow "Standard")
        // In a real app we'd resolve `product.workflowId`.
        const steps = await prisma.workflowStepDef.findMany({ orderBy: { sequence: 'asc' } });

        // Transaction to create Order + Tasks
        await prisma.$transaction(async (tx) => {
            // 1. Create Work Order
            const wo = await tx.workOrder.create({
                data: {
                    orderNumber,
                    quantity,
                    productId,
                    status: 'RELEASED',
                    dueDate: new Date(Date.now() + 86400000 * 7)
                }
            });

            // 2. Create Tasks for Steps
            if (steps.length > 0) {
                const instance = await tx.workflowInstance.create({
                    data: {
                        workOrderId: wo.id,
                        status: 'ACTIVE'
                    }
                });

                for (const step of steps) {
                    await tx.workflowTask.create({
                        data: {
                            instanceId: instance.id,
                            stepDefId: step.id,
                            status: 'PENDING',
                        }
                    });
                }
            }

            // Log
            await tx.systemEvent.create({
                data: {
                    eventType: 'ORDER_RELEASE',
                    details: `Released ${orderNumber}`
                }
            });
        });

        revalidatePath('/planner');
        revalidatePath('/operator');
    } catch (e: any) {
        console.error('Order creation failed:', e.message);
    }
}

export async function getManufacturingOrders() {
    return await prisma.workOrder.findMany({
        orderBy: { createdAt: 'desc' },
        include: { product: true }
    });
}
