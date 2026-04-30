import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/services/database';
import { canTransition, VALID_TRANSITIONS, STATUS_LABELS } from '@/lib/orderStateMachine';

const OPERATORS = ['Ramesh.Kumar', 'Priya.Nair', 'Ravi.Shankar'];
const QC_USERS   = ['Deepa.QC'];
const SUPERVISORS = ['Arjun.Supv'];
const MACHINES   = ['CNC-01', 'CNC-02', 'WLD-01', 'ASSY-01', 'QC-GATE'];

const DELAY_NOTES = [
    '⚠ Operator delay — 15 min lost on shift changeover',
    '⚠ Coolant refill pause — 20 min',
    '⚠ Tool change required — 30 min downtime on CNC-01',
    '⚠ Material queue backup — 10 min wait',
];
const QC_PASS_NOTES = [
    '✅ QC PASSED — All dimensional checks within tolerance. CMM report attached.',
    '✅ QC PASSED — Visual inspection OK. Surface finish within Ra 1.6 spec.',
    '✅ QC PASSED — Weld inspection complete. No porosity detected.',
];
const QC_FAIL_NOTES = [
    '❌ QC FAILED — Weld porosity detected on joint J-3. Root cause: incorrect wire feed rate.',
    '❌ QC FAILED — Dimensional OOS: bore dia 52.3mm (spec 52.0±0.1). Rework required.',
    '❌ QC FAILED — Surface roughness Ra 2.4 (spec Ra ≤ 1.6). Re-machining required.',
    '❌ QC FAILED — Thread gauge fail on M20 port. Root cause: worn tap.',
];

function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Decide what next transition to simulate — biased to keep things interesting
function pickNextStatus(current: string): string | null {
    const nexts = VALID_TRANSITIONS[current] ?? [];
    if (nexts.length === 0) return null;

    // Bias: QC_PENDING → 70% APPROVED, 30% REWORK
    if (current === 'QC_PENDING') return Math.random() < 0.7 ? 'APPROVED' : 'REWORK';
    // REWORK → IN_PROGRESS (always)
    if (current === 'REWORK') return 'IN_PROGRESS';
    // IN_PROGRESS → 80% QC_PENDING, 20% ON_HOLD (simulate problem)
    if (current === 'IN_PROGRESS') return Math.random() < 0.8 ? 'QC_PENDING' : 'ON_HOLD';
    // ON_HOLD → back to IN_PROGRESS
    if (current === 'ON_HOLD') return 'IN_PROGRESS';
    // RELEASED → IN_PROGRESS
    if (current === 'RELEASED') return 'IN_PROGRESS';
    // APPROVED → COMPLETED
    if (current === 'APPROVED') return 'COMPLETED';
    // PLANNED → RELEASED
    if (current === 'PLANNED') return 'RELEASED';
    return nexts[0];
}

function buildNotes(from: string, to: string, performer: string): string {
    if (to === 'IN_PROGRESS')  return `${performer} started production — ${pick(MACHINES)}, ${['Morning','Afternoon','Night'][Math.floor(Math.random()*3)]} Shift`;
    if (to === 'QC_PENDING')   return `Fabrication complete. Sent to QC Gate by ${performer}.`;
    if (to === 'APPROVED')     return pick(QC_PASS_NOTES);
    if (to === 'REWORK')       return pick(QC_FAIL_NOTES);
    if (to === 'COMPLETED')    return `Order closed and confirmed by ${performer}. Units shipped to warehouse.`;
    if (to === 'ON_HOLD')      return `⚠ HOLD — ${pick(['Material shortage', 'Machine breakdown', 'Design change pending', 'Customer revision request'])}.`;
    if (to === 'RELEASED')     return `Released to shop floor by ${performer}.`;
    return `${from} → ${to} by ${performer}`;
}

function getPerformer(toStatus: string): { by: string; role: string } {
    if (['APPROVED', 'REWORK', 'COMPLETED', 'ON_HOLD'].includes(toStatus))
        return { by: pick(SUPERVISORS), role: 'SUPERVISOR' };
    if (toStatus === 'QC_PENDING' || toStatus === 'IN_PROGRESS')
        return { by: pick(OPERATORS), role: 'OPERATOR' };
    if (toStatus === 'RELEASED')
        return { by: 'Meena.Planner', role: 'PLANNER' };
    return { by: 'system', role: 'SYSTEM' };
}

export async function POST(_req: NextRequest) {
    try {
        // Pick up to 2 non-terminal active orders to advance
        const candidates = await prisma.workOrder.findMany({
            where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
            orderBy: { priority: 'desc' },
            take: 3,
        });

        if (candidates.length === 0) {
            return NextResponse.json({ message: 'No active orders to simulate', updates: [] });
        }

        const updates: Array<{ orderNumber: string; from: string; to: string; notes: string }> = [];

        // Randomly advance 1–2 orders
        const toAdvance = candidates.slice(0, Math.random() < 0.5 ? 1 : 2);

        for (const order of toAdvance) {
            // 30% chance: add a delay note without state change
            if (Math.random() < 0.3 && order.status === 'IN_PROGRESS') {
                const note = pick(DELAY_NOTES);
                await prisma.orderActivity.create({
                    data: {
                        orderId:     order.id,
                        action:      'NOTE',
                        fromStatus:  null,
                        toStatus:    null,
                        performedBy: pick(OPERATORS),
                        role:        'OPERATOR',
                        notes:       note,
                        timestamp:   new Date(),
                    },
                });
                await prisma.systemEvent.create({
                    data: { eventType: 'ORDER_DELAY_ALERT', details: `[DEMO] ${order.orderNumber}: ${note}` }
                });
                updates.push({ orderNumber: order.orderNumber, from: order.status, to: order.status, notes: note });
                continue;
            }

            const nextStatus = pickNextStatus(order.status);
            if (!nextStatus || !canTransition(order.status, nextStatus)) continue;

            const { by, role } = getPerformer(nextStatus);
            const notes = buildNotes(order.status, nextStatus, by);
            const machine = ['IN_PROGRESS', 'QC_PENDING'].includes(nextStatus) ? pick(MACHINES) : null;

            await prisma.$transaction([
                prisma.workOrder.update({ where: { id: order.id }, data: { status: nextStatus } }),
                prisma.orderActivity.create({
                    data: {
                        orderId:     order.id,
                        action:      nextStatus === 'REWORK' || nextStatus === 'APPROVED' ? 'QC_RESULT' : 'STATUS_CHANGE',
                        fromStatus:  order.status,
                        toStatus:    nextStatus,
                        performedBy: by,
                        role,
                        machine,
                        notes,
                        timestamp:   new Date(),
                    }
                }),
                prisma.systemEvent.create({
                    data: { eventType: 'DEMO_SIMULATE', details: `[DEMO] ${order.orderNumber}: ${order.status} → ${nextStatus} (${by})` }
                }),
            ]);

            updates.push({ orderNumber: order.orderNumber, from: order.status, to: nextStatus, notes });
        }

        return NextResponse.json({ message: `Simulated ${updates.length} update(s)`, updates });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// GET — return current simulation status
export async function GET() {
    const orders = await prisma.workOrder.findMany({
        include: { product: true, _count: { select: { activities: true } } },
        orderBy: { priority: 'desc' },
    });
    return NextResponse.json(orders);
}
