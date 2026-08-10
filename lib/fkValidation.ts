/**
 * Foreign-key validation helpers.
 *
 * Each function checks that a referenced record exists and passes any
 * business-rule guards (e.g. active status). Returns null on success or
 * an error string that can be forwarded directly to the API caller.
 *
 * These are used at the API boundary — not inside Prisma hooks — so they
 * run one extra SELECT before the main write. That's intentional; it gives
 * a readable error message rather than a cryptic P2003 constraint failure.
 */

import { prisma } from '@/lib/services/database';

export async function fkProduct(productId: string): Promise<string | null> {
    const rec = await prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, sku: true },
    });
    if (!rec) return `Product not found (id: ${productId})`;
    return null;
}

export async function fkMachine(machineId: string): Promise<string | null> {
    const rec = await prisma.machine.findUnique({
        where: { id: machineId },
        select: { id: true, code: true, status: true },
    });
    if (!rec) return `Machine not found (id: ${machineId})`;
    if (rec.status === 'DOWN') return `Machine ${rec.code} is currently DOWN and cannot be assigned`;
    if (rec.status === 'MAINTENANCE') return `Machine ${rec.code} is under MAINTENANCE and cannot be assigned`;
    return null;
}

export async function fkShift(shiftId: string): Promise<string | null> {
    const rec = await prisma.shift.findUnique({
        where: { id: shiftId },
        select: { id: true, name: true },
    });
    if (!rec) return `Shift not found (id: ${shiftId})`;
    return null;
}

export async function fkOperator(userId: string): Promise<string | null> {
    const rec = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, isActive: true, role: true },
    });
    if (!rec) return `User not found (id: ${userId})`;
    if (!rec.isActive) return `User ${rec.username} is deactivated and cannot be assigned as operator`;
    return null;
}

export async function fkSpoolLine(lineId: string): Promise<string | null> {
    const rec = await prisma.pipeSpoolLine.findUnique({
        where: { id: lineId },
        select: { id: true, lineNumber: true, status: true, isDeleted: true },
    });
    if (!rec || rec.isDeleted) return `Spool line not found (id: ${lineId})`;
    if (rec.status !== 'ACTIVE') return `Spool line ${rec.lineNumber} is not ACTIVE (status: ${rec.status})`;
    return null;
}

export async function fkWorkOrder(workOrderId: string): Promise<string | null> {
    const rec = await prisma.workOrder.findUnique({
        where: { id: workOrderId },
        select: { id: true, orderNumber: true, status: true },
    });
    if (!rec) return `Work order not found (id: ${workOrderId})`;
    if (['COMPLETED', 'CANCELLED'].includes(rec.status))
        return `Work order ${rec.orderNumber} is ${rec.status} — cannot link new spools to it`;
    return null;
}

export async function fkSpool(spoolId: string): Promise<string | null> {
    const rec = await prisma.pipeSpool.findUnique({
        where: { id: spoolId },
        select: { id: true, spoolId: true },
    });
    if (!rec) return `Pipe spool not found (id: ${spoolId})`;
    return null;
}
