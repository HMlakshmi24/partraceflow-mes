/**
 * TraceabilityService — lot/batch/serial genealogy tracking. Previously the
 * highest-risk untested file in the codebase (flagged repeatedly in
 * CLAUDE.md's coverage-gap list) despite having one already-fixed real bug
 * (forwardTrace's bogus top-level `product` field — see the fix comment in
 * the service itself). This suite covers every method's DB-touching path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLot, mockBatch, mockSerialNumber, mockMaterialUsage, mockTraceabilityRecord } = vi.hoisted(() => ({
    mockLot: { create: vi.fn(), findUnique: vi.fn() },
    mockBatch: { create: vi.fn() },
    mockSerialNumber: { create: vi.fn(), findUnique: vi.fn() },
    mockMaterialUsage: { create: vi.fn() },
    mockTraceabilityRecord: { create: vi.fn() },
}));

vi.mock('@/lib/services/database', () => ({
    prisma: {
        lot: mockLot,
        batch: mockBatch,
        serialNumber: mockSerialNumber,
        materialUsage: mockMaterialUsage,
        traceabilityRecord: mockTraceabilityRecord,
    },
}));

import { TraceabilityService } from '@/lib/services/TraceabilityService';

beforeEach(() => {
    vi.clearAllMocks();
    mockBatch.create.mockResolvedValue({ id: 'batch1' });
    mockSerialNumber.create.mockResolvedValue({ id: 'sn1' });
    mockTraceabilityRecord.create.mockResolvedValue({ id: 'tr1' });
});

describe('createLot', () => {
    it('defaults unit to EA when not provided', async () => {
        await TraceabilityService.createLot({ lotNumber: 'L1', productId: 'p1', quantity: 100 });
        expect(mockLot.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ lotNumber: 'L1', productId: 'p1', quantity: 100, unit: 'EA' }),
        });
    });

    it('respects an explicit unit', async () => {
        await TraceabilityService.createLot({ lotNumber: 'L1', productId: 'p1', quantity: 100, unit: 'KG' });
        expect(mockLot.create).toHaveBeenCalledWith({ data: expect.objectContaining({ unit: 'KG' }) });
    });
});

describe('createBatch', () => {
    it('creates the batch and records a PRODUCTION_START event', async () => {
        const batch = await TraceabilityService.createBatch({ batchNumber: 'B1', workOrderId: 'wo1', quantity: 50 });

        expect(batch).toEqual({ id: 'batch1' });
        expect(mockTraceabilityRecord.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                batchId: 'batch1',
                eventType: 'PRODUCTION_START',
                data: JSON.stringify({ workOrderId: 'wo1', quantity: 50 }),
            }),
        });
    });
});

describe('assignSerial', () => {
    it('creates the serial number and records a SERIAL_ASSIGNED event', async () => {
        const sn = await TraceabilityService.assignSerial({ serial: 'SN-1', batchId: 'batch1', productId: 'p1' });

        expect(sn).toEqual({ id: 'sn1' });
        expect(mockTraceabilityRecord.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                batchId: 'batch1',
                serialNumberId: 'sn1',
                eventType: 'SERIAL_ASSIGNED',
                data: JSON.stringify({ serial: 'SN-1' }),
            }),
        });
    });
});

describe('recordEvent', () => {
    it('JSON-serializes the data payload and stamps a timestamp', async () => {
        await TraceabilityService.recordEvent({ batchId: 'b1', eventType: 'CUSTOM', data: { foo: 'bar' } });
        expect(mockTraceabilityRecord.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                batchId: 'b1',
                eventType: 'CUSTOM',
                data: '{"foo":"bar"}',
                timestamp: expect.any(Date),
            }),
        });
    });
});

describe('getGenealogy', () => {
    it('returns null when the serial number does not exist', async () => {
        mockSerialNumber.findUnique.mockResolvedValue(null);
        const result = await TraceabilityService.getGenealogy('SN-MISSING');
        expect(result).toBeNull();
    });

    it('builds the full genealogy tree, merging and sorting batch + serial events by timestamp', async () => {
        mockSerialNumber.findUnique.mockResolvedValue({
            serial: 'SN-1',
            batch: {
                batchNumber: 'B1',
                quantity: 10,
                workOrder: { orderNumber: 'WO-1', product: { name: 'Widget', sku: 'SKU-1' } },
                lot: { lotNumber: 'L1' },
                materialUsages: [
                    { lot: { lotNumber: 'RAW-1' }, quantity: 5, unit: 'KG', usedAt: new Date('2026-01-01T00:00:00Z') },
                ],
                traceabilityRecords: [
                    { eventType: 'PRODUCTION_START', timestamp: new Date('2026-01-01T08:00:00Z'), machineId: null, operatorId: 'op1', data: '{"a":1}' },
                ],
            },
            traceabilityRecords: [
                { eventType: 'SERIAL_ASSIGNED', timestamp: new Date('2026-01-01T09:00:00Z'), machineId: 'm1', operatorId: null, data: '{"b":2}' },
            ],
        });

        const result = await TraceabilityService.getGenealogy('SN-1');
        if (!result) throw new Error('expected genealogy, got null');

        expect(result.serialNumber).toBe('SN-1');
        expect(result.product).toEqual({ name: 'Widget', sku: 'SKU-1' });
        expect(result.batch).toEqual({ batchNumber: 'B1', workOrder: 'WO-1', quantity: 10 });
        expect(result.rawMaterials).toEqual([{ lotNumber: 'RAW-1', quantity: 5, unit: 'KG', usedAt: new Date('2026-01-01T00:00:00Z') }]);
        // Batch's PRODUCTION_START (08:00) sorts before the serial's SERIAL_ASSIGNED (09:00)
        expect(result.operations.map((o: any) => o.eventType)).toEqual(['PRODUCTION_START', 'SERIAL_ASSIGNED']);
        expect(result.operations[0].data).toEqual({ a: 1 });
        expect(result.operations[1].data).toEqual({ b: 2 });
    });

    it('sorts operations correctly even when the serial-level event happened first', async () => {
        mockSerialNumber.findUnique.mockResolvedValue({
            serial: 'SN-2',
            batch: {
                batchNumber: 'B2', quantity: 1,
                workOrder: { orderNumber: 'WO-2', product: { name: 'Part' } },
                lot: null,
                materialUsages: [],
                traceabilityRecords: [
                    { eventType: 'LATE_EVENT', timestamp: new Date('2026-01-02T00:00:00Z'), machineId: null, operatorId: null, data: '{}' },
                ],
            },
            traceabilityRecords: [
                { eventType: 'EARLY_EVENT', timestamp: new Date('2026-01-01T00:00:00Z'), machineId: null, operatorId: null, data: '{}' },
            ],
        });

        const result = await TraceabilityService.getGenealogy('SN-2');
        if (!result) throw new Error('expected genealogy, got null');
        expect(result.operations.map((o: any) => o.eventType)).toEqual(['EARLY_EVENT', 'LATE_EVENT']);
    });
});

describe('forwardTrace', () => {
    it('returns null when the lot does not exist', async () => {
        mockLot.findUnique.mockResolvedValue(null);
        const result = await TraceabilityService.forwardTrace('L-MISSING');
        expect(result).toBeNull();
    });

    it('does NOT return a bogus top-level `product` field (regression for the fixed bug)', async () => {
        mockLot.findUnique.mockResolvedValue({
            lotNumber: 'L1',
            materialUsages: [
                { batch: { batchNumber: 'B1', workOrder: { orderNumber: 'WO-1', product: { name: 'Widget' } }, serialNumbers: [{ serial: 'SN-1' }] } },
            ],
        });

        const result = await TraceabilityService.forwardTrace('L1');
        if (!result) throw new Error('expected trace, got null');

        expect(result).not.toHaveProperty('product');
        expect(result.lot).toBe('L1');
    });

    it('a lot consumed by batches for two different products reports each batch\'s own product, not one lot-level product', async () => {
        mockLot.findUnique.mockResolvedValue({
            lotNumber: 'L1',
            materialUsages: [
                { batch: { batchNumber: 'B1', workOrder: { orderNumber: 'WO-1', product: { name: 'Widget' } }, serialNumbers: [] } },
                { batch: { batchNumber: 'B2', workOrder: { orderNumber: 'WO-2', product: { name: 'Gadget' } }, serialNumbers: [] } },
            ],
        });

        const result = await TraceabilityService.forwardTrace('L1');
        if (!result) throw new Error('expected trace, got null');

        expect(result.usedInBatches).toEqual([
            { batchNumber: 'B1', workOrder: 'WO-1', product: 'Widget', serialNumbers: [] },
            { batchNumber: 'B2', workOrder: 'WO-2', product: 'Gadget', serialNumbers: [] },
        ]);
    });

    it('collects all serial numbers for a batch', async () => {
        mockLot.findUnique.mockResolvedValue({
            lotNumber: 'L1',
            materialUsages: [
                { batch: { batchNumber: 'B1', workOrder: { orderNumber: 'WO-1', product: { name: 'Widget' } }, serialNumbers: [{ serial: 'SN-1' }, { serial: 'SN-2' }] } },
            ],
        });

        const result = await TraceabilityService.forwardTrace('L1');
        if (!result) throw new Error('expected trace, got null');
        expect(result.usedInBatches[0].serialNumbers).toEqual(['SN-1', 'SN-2']);
    });
});
