'use server';

import { prisma } from '@/lib/services/database';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { validateWorkOrder, ValidationError, BusinessLogicError } from '@/lib/utils/validation';
import { ErrorHandler, withRetry } from '@/lib/utils/errorHandler';

const createOrderSchema = z.object({
    orderNumber: z.string().min(3, "Order # must be at least 3 chars"),
    productId: z.string().min(1, "Product required"),
    quantity: z.coerce.number().min(1, "Quantity must be > 0"),
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
        };

        const validation = createOrderSchema.safeParse(raw);
        if (!validation.success) {
            throw new ValidationError('Invalid order data', validation.error.issues[0].path.join('.'));
        }

        const { orderNumber, productId, quantity } = validation.data;

        // Additional business validation
        const productExists = await prisma.product.findUnique({ where: { id: productId } });
        if (!productExists) {
            throw new ValidationError('Product not found', 'productId');
        }

        const orderExists = await prisma.workOrder.findUnique({ where: { orderNumber } });
        if (orderExists) {
            throw new BusinessLogicError('Order number already exists', 'DUPLICATE_ORDER');
        }

        // Create work order with transaction
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

            // 2. Create workflow instance and tasks
            const steps = await tx.workflowStepDef.findMany({ orderBy: { sequence: 'asc' } });
            
            if (steps.length > 0) {
                const instance = await tx.workflowInstance.create({
                    data: {
                        workOrderId: wo.id,
                        status: 'ACTIVE'
                    }
                });

                // Create tasks for each step
                const tasks = steps.map(step => ({
                    instanceId: instance.id,
                    stepDefId: step.id,
                    status: 'PENDING' as const
                }));

                await tx.workflowTask.createMany({ data: tasks });
            }

            // 3. Log the event
            await tx.systemEvent.create({
                data: {
                    eventType: 'ORDER_RELEASE',
                    details: `Released ${orderNumber} for ${quantity} units of ${productExists.name}`
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
            });
        });
    } catch (error) {
        ErrorHandler.logError(error, { operation: 'getManufacturingOrders' });
        throw new Error('Failed to fetch manufacturing orders');
    }
}

export async function updateWorkOrderStatus(orderId: string, status: string) {
    try {
        const validStatuses = ['RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
        if (!validStatuses.includes(status)) {
            throw new ValidationError('Invalid work order status', 'status');
        }

        const updatedOrder = await prisma.workOrder.update({
            where: { id: orderId },
            data: { status }
        });

        await prisma.systemEvent.create({
            data: {
                eventType: 'ORDER_STATUS_CHANGE',
                details: `Order ${updatedOrder.orderNumber} status changed to ${status}`
            }
        });

        revalidatePath('/planner');
        revalidatePath('/dashboard');
        
        return updatedOrder;
    } catch (error) {
        ErrorHandler.logError(error, { 
            operation: 'updateWorkOrderStatus',
            orderId,
            status
        });
        
        if (error instanceof ValidationError) {
            throw error;
        }
        
        throw new Error('Failed to update work order status');
    }
}

export async function deleteWorkOrder(orderId: string) {
    try {
        // Check if order has active tasks
        const order = await prisma.workOrder.findUnique({
            where: { id: orderId },
            include: {
                workflowInstances: {
                    include: {
                        tasks: {
                            where: { status: 'IN_PROGRESS' }
                        }
                    }
                }
            }
        });

        if (!order) {
            throw new ValidationError('Work order not found', 'orderId');
        }

        const hasActiveTasks = order.workflowInstances.some((instance: any) => 
            instance.tasks.length > 0
        );

        if (hasActiveTasks) {
            throw new BusinessLogicError('Cannot delete order with active tasks', 'ACTIVE_TASKS_EXIST');
        }

        await prisma.workOrder.delete({
            where: { id: orderId }
        });

        await prisma.systemEvent.create({
            data: {
                eventType: 'ORDER_DELETED',
                details: `Order ${order.orderNumber} was deleted`
            }
        });

        revalidatePath('/planner');
        revalidatePath('/dashboard');
        
    } catch (error) {
        ErrorHandler.logError(error, { 
            operation: 'deleteWorkOrder',
            orderId
        });
        
        if (error instanceof ValidationError || error instanceof BusinessLogicError) {
            throw error;
        }
        
        throw new Error('Failed to delete work order');
    }
}
