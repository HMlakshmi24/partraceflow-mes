'use server';

import { prisma } from '@/lib/services/database';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { ValidationError, BusinessLogicError } from '@/lib/utils/validation';
import { ErrorHandler, withRetry } from '@/lib/utils/errorHandler';
import { getNextActions } from '@/lib/orderStateMachine';
import { fkMachine } from '@/lib/fkValidation';

const createOrderSchema = z.object({
    orderNumber: z.string().min(3, "Order # must be at least 3 chars"),
    productId: z.string().min(1, "Product required"),
    quantity: z.coerce.number().min(1, "Quantity must be > 0"),
    machineId: z.string().optional(),
    priority: z.coerce.number().int().min(1).max(4).optional(),
    dueDate: z.string().optional(),
});

export async function getProducts() {
    try {
        return await withRetry(async () => {
            return await prisma.product.findMany({
                orderBy: { sku: 'asc' }
            });
        });
    } catch (error) {
        ErrorHandler.logError(error, { operation: 'getProducts' });
        throw new Error('Failed to fetch products');
    }
}

export async function createManufacturingOrder(formData: FormData): Promise<void> {
    try {
        // Extract and validate input data
        const raw = {
            orderNumber: formData.get('orderNumber'),
            productId: formData.get('productId'),
            quantity: formData.get('quantity'),
            machineId: formData.get('machineId') || undefined,
            priority: formData.get('priority') || undefined,
            dueDate: formData.get('dueDate') || undefined,
        };

        const validation = createOrderSchema.safeParse(raw);
        if (!validation.success) {
            throw new ValidationError('Invalid order data', validation.error.issues[0].path.join('.'));
        }

        const { orderNumber, productId, quantity, machineId, priority, dueDate } = validation.data;

        // Additional business validation
        const productExists = await prisma.product.findUnique({ where: { id: productId } });
        if (!productExists) {
            throw new ValidationError('Product not found', 'productId');
        }

        const orderExists = await prisma.workOrder.findUnique({ where: { orderNumber } });
        if (orderExists) {
            throw new BusinessLogicError('Order number already exists', 'DUPLICATE_ORDER');
        }

        if (machineId) {
            const machineErr = await fkMachine(machineId);
            if (machineErr) throw new ValidationError(machineErr, 'machineId');
        }

        const resolvedDueDate = dueDate ? new Date(dueDate) : new Date(Date.now() + 86400000 * 7);

        // Create work order — starts at PLANNED; supervisor releases via status transition
        await prisma.$transaction(async (tx) => {
            const wo = await tx.workOrder.create({
                data: {
                    orderNumber,
                    quantity,
                    productId,
                    status: 'PLANNED',
                    priority: priority ?? 2,
                    dueDate: resolvedDueDate,
                    ...(machineId ? { machineId } : {}),
                }
            });

            await tx.systemEvent.create({
                data: {
                    eventType: 'ORDER_CREATED',
                    details: `Created ${orderNumber} for ${quantity} units of ${productExists.name}`
                }
            });

            await tx.orderActivity.create({
                data: {
                    orderId: wo.id,
                    action: 'CREATED',
                    performedBy: 'system',
                    role: 'SYSTEM',
                    notes: `Order ${orderNumber} created (PLANNED) for ${quantity} units of ${productExists.name}`,
                }
            });
        });

        // Revalidate relevant paths
        revalidatePath('/planner');
        revalidatePath('/operator');
        revalidatePath('/dashboard');

    } catch (error) {
        ErrorHandler.logError(error, { 
            operation: 'createManufacturingOrder',
            formData: Object.fromEntries(formData)
        });
        
        if (error instanceof ValidationError || error instanceof BusinessLogicError) {
            throw error;
        }
        
        throw new Error('Failed to create manufacturing order');
    }
}

export async function getManufacturingOrders() {
    try {
        return await withRetry(async () => {
            return await prisma.workOrder.findMany({
                include: { 
                    product: true,
                    _count: {
                        select: {
                            workflowInstances: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }).then(orders => orders.map(order => ({
                ...order,
                nextActions: getNextActions(order.status),
                isDelayed: ['RELEASED', 'IN_PROGRESS', 'QC_PENDING'].includes(order.status) && new Date(order.dueDate) < new Date(),
            })));
        });
    } catch (error) {
        ErrorHandler.logError(error, { operation: 'getManufacturingOrders' });
        throw new Error('Failed to fetch manufacturing orders');
    }
}

