/**
 * SPCService — Statistical Process Control: Nelson Rule 1 (3-sigma)
 * violation detection, Western Electric control-limit recalculation, and
 * Cp/Cpk process-capability math. Pure numeric formulas, zero prior
 * coverage — a sign or formula error here would silently produce wrong
 * process-capability compliance records.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockParam, mockRecord, mockLimit, mockPublish } = vi.hoisted(() => ({
    mockParam: { findUnique: vi.fn(), update: vi.fn() },
    mockRecord: { create: vi.fn(), findMany: vi.fn() },
    mockLimit: { create: vi.fn() },
    mockPublish: vi.fn(),
}));

vi.mock('@/lib/services/database', () => ({
    prisma: {
        processParameter: mockParam,
        sPCRecord: mockRecord,
        controlLimit: mockLimit,
    },
}));

vi.mock('@/lib/events/EventBus', () => ({
    eventBus: { publish: mockPublish },
}));

import { SPCService } from '@/lib/services/SPCService';

beforeEach(() => {
    vi.clearAllMocks();
});

// ── addMeasurement: violation detection ──────────────────────────────────────

describe('SPCService.addMeasurement', () => {
    function param(overrides: Partial<{ ucl: number; lcl: number; usl: number | null; lsl: number | null; hasLimits: boolean }> = {}) {
        return {
            id: 'p1',
            parameterName: 'Wall Thickness',
            upperSpecLimit: overrides.usl ?? null,
            lowerSpecLimit: overrides.lsl ?? null,
            controlLimits: overrides.hasLimits === false ? [] : [{ ucl: overrides.ucl ?? 10, lcl: overrides.lcl ?? 0 }],
        };
    }

    it('flags a value above UCL as a Nelson Rule 1 (3-sigma) violation', async () => {
        mockParam.findUnique.mockResolvedValue(param({ ucl: 10, lcl: 0 }));
        mockRecord.create.mockImplementation(({ data }: any) => Promise.resolve(data));

        const rec = await SPCService.addMeasurement({ parameterId: 'p1', value: 11, machineId: 'm1' });

        expect(rec.inControl).toBe(false);
        expect(rec.violationType).toBe('NELSON_RULE_1_3SIGMA');
        expect(mockPublish).toHaveBeenCalledWith(expect.objectContaining({ type: 'spc.violation' }));
    });

    it('flags a value below LCL as a Nelson Rule 1 violation', async () => {
        mockParam.findUnique.mockResolvedValue(param({ ucl: 10, lcl: 2 }));
        mockRecord.create.mockImplementation(({ data }: any) => Promise.resolve(data));

        const rec = await SPCService.addMeasurement({ parameterId: 'p1', value: 1, machineId: 'm1' });

        expect(rec.inControl).toBe(false);
        expect(rec.violationType).toBe('NELSON_RULE_1_3SIGMA');
    });

    it('a value exactly on the control limit boundary is in control (not a violation)', async () => {
        mockParam.findUnique.mockResolvedValue(param({ ucl: 10, lcl: 0 }));
        mockRecord.create.mockImplementation(({ data }: any) => Promise.resolve(data));

        const rec = await SPCService.addMeasurement({ parameterId: 'p1', value: 10, machineId: 'm1' });

        expect(rec.inControl).toBe(true);
        expect(mockPublish).not.toHaveBeenCalled();
    });

    it('a value within limits is in control and does not publish a violation event', async () => {
        mockParam.findUnique.mockResolvedValue(param({ ucl: 10, lcl: 0 }));
        mockRecord.create.mockImplementation(({ data }: any) => Promise.resolve(data));

        const rec = await SPCService.addMeasurement({ parameterId: 'p1', value: 5, machineId: 'm1' });

        expect(rec.inControl).toBe(true);
        expect(rec.violationType).toBeUndefined();
        expect(mockPublish).not.toHaveBeenCalled();
    });

    it('with no control limits calculated yet, still checks spec limits (USL)', async () => {
        mockParam.findUnique.mockResolvedValue(param({ hasLimits: false, usl: 20 }));
        mockRecord.create.mockImplementation(({ data }: any) => Promise.resolve(data));

        const rec = await SPCService.addMeasurement({ parameterId: 'p1', value: 25, machineId: 'm1' });

        expect(rec.inControl).toBe(false);
        expect(rec.violationType).toBe('ABOVE_UPPER_SPEC');
    });

    it('flags a value below the lower spec limit (LSL)', async () => {
        mockParam.findUnique.mockResolvedValue(param({ ucl: 100, lcl: -100, lsl: 5 }));
        mockRecord.create.mockImplementation(({ data }: any) => Promise.resolve(data));

        const rec = await SPCService.addMeasurement({ parameterId: 'p1', value: 2, machineId: 'm1' });

        expect(rec.inControl).toBe(false);
        expect(rec.violationType).toBe('BELOW_LOWER_SPEC');
    });

    it('a 3-sigma violation takes precedence in violationType over a simultaneous spec-limit violation', async () => {
        // value is both outside control limits AND outside spec limits —
        // the control-limit check runs first and sets violationType, and
        // the spec-limit checks use `??` so they must not clobber it.
        mockParam.findUnique.mockResolvedValue(param({ ucl: 10, lcl: 0, usl: 8 }));
        mockRecord.create.mockImplementation(({ data }: any) => Promise.resolve(data));

        const rec = await SPCService.addMeasurement({ parameterId: 'p1', value: 15, machineId: 'm1' });

        expect(rec.inControl).toBe(false);
        expect(rec.violationType).toBe('NELSON_RULE_1_3SIGMA');
    });

    it('throws when the parameter does not exist', async () => {
        mockParam.findUnique.mockResolvedValue(null);
        await expect(
            SPCService.addMeasurement({ parameterId: 'missing', value: 1, machineId: 'm1' }),
        ).rejects.toThrow('Parameter not found');
    });
});

// ── recalculateControlLimits: mean/sigma/UCL/LCL/Cp/Cpk math ────────────────

describe('SPCService.recalculateControlLimits', () => {
    it('returns null with fewer than 10 samples (insufficient data)', async () => {
        mockRecord.findMany.mockResolvedValue(Array.from({ length: 9 }, (_, i) => ({ value: i })));
        const result = await SPCService.recalculateControlLimits('p1');
        expect(result).toBeNull();
        expect(mockLimit.create).not.toHaveBeenCalled();
    });

    it('computes mean, sample stdev, and 3-sigma UCL/LCL correctly for a known dataset', async () => {
        // Values: 10 data points, mean = 5, hand-computed sample stdev.
        const values = [1, 2, 3, 4, 5, 5, 6, 7, 8, 9];
        mockRecord.findMany.mockResolvedValue(values.map(v => ({ value: v })));
        mockParam.findUnique.mockResolvedValue({ upperSpecLimit: null, lowerSpecLimit: null });
        mockLimit.create.mockImplementation(({ data }: any) => Promise.resolve(data));
        mockParam.update.mockResolvedValue({});

        const result = await SPCService.recalculateControlLimits('p1', 50);

        const n = values.length;
        const mean = values.reduce((a, b) => a + b, 0) / n;
        const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
        const sigma = Math.sqrt(variance);

        expect(result).not.toBeNull();
        expect(result!.centerLine).toBeCloseTo(mean, 10);
        expect(result!.sigma).toBeCloseTo(sigma, 10);
        expect(result!.ucl).toBeCloseTo(mean + 3 * sigma, 10);
        expect(result!.lcl).toBeCloseTo(mean - 3 * sigma, 10);
        expect(result!.sampleCount).toBe(n);

        // Also persisted onto the parameter for quick lookup elsewhere.
        expect(mockParam.update).toHaveBeenCalledWith({
            where: { id: 'p1' },
            data: { upperControlLimit: result!.ucl, lowerControlLimit: result!.lcl },
        });
    });

    it('computes Cp/Cpk when both spec limits are present', async () => {
        // Centered process: mean=10, USL=16, LSL=4 -> Cp should reflect
        // (USL-LSL)/(6*sigma); Cpk should be the min of the two one-sided
        // capability indices.
        const values = [8, 9, 10, 10, 10, 10, 10, 10, 11, 12];
        mockRecord.findMany.mockResolvedValue(values.map(v => ({ value: v })));
        mockParam.findUnique.mockResolvedValue({ upperSpecLimit: 16, lowerSpecLimit: 4 });
        mockLimit.create.mockImplementation(({ data }: any) => Promise.resolve(data));
        mockParam.update.mockResolvedValue({});

        const result = await SPCService.recalculateControlLimits('p1', 50);

        const n = values.length;
        const mean = values.reduce((a, b) => a + b, 0) / n;
        const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
        const sigma = Math.sqrt(variance);
        const expectedCp = (16 - 4) / (6 * sigma);
        const expectedCpkUpper = (16 - mean) / (3 * sigma);
        const expectedCpkLower = (mean - 4) / (3 * sigma);
        const expectedCpk = Math.min(expectedCpkUpper, expectedCpkLower);

        expect(result!.cp).toBeCloseTo(expectedCp, 10);
        expect(result!.cpk).toBeCloseTo(expectedCpk, 10);
    });

    it('leaves Cp/Cpk undefined when spec limits are not configured', async () => {
        const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        mockRecord.findMany.mockResolvedValue(values.map(v => ({ value: v })));
        mockParam.findUnique.mockResolvedValue({ upperSpecLimit: null, lowerSpecLimit: null });
        mockLimit.create.mockImplementation(({ data }: any) => Promise.resolve(data));
        mockParam.update.mockResolvedValue({});

        const result = await SPCService.recalculateControlLimits('p1', 50);

        expect(result!.cp).toBeUndefined();
        expect(result!.cpk).toBeUndefined();
    });

    it('a process shifted off-center yields an asymmetric Cpk lower than Cp (real capability risk)', async () => {
        // Same spread as the centered case, but shifted toward USL — Cpk
        // (worst-case one-sided) must come out below Cp (which only sees
        // total spread vs total tolerance band, blind to centering).
        const values = [12, 13, 13, 13, 13, 13, 13, 13, 14, 15];
        mockRecord.findMany.mockResolvedValue(values.map(v => ({ value: v })));
        mockParam.findUnique.mockResolvedValue({ upperSpecLimit: 16, lowerSpecLimit: 4 });
        mockLimit.create.mockImplementation(({ data }: any) => Promise.resolve(data));
        mockParam.update.mockResolvedValue({});

        const result = await SPCService.recalculateControlLimits('p1', 50);

        expect(result!.cpk!).toBeLessThan(result!.cp!);
    });
});
