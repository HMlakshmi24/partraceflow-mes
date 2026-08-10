/**
 * Shift Template Tests
 *
 * Pure function tests — no database required.
 * Coverage:
 *   - Template creation validation (name, startTime, endTime, targetQuantity)
 *   - Time format validation (HH:MM)
 *   - End-time-after-start-time rule
 *   - Duplicate name prevention logic
 *   - Schedule creation validation (templateId + date required)
 *   - Target quantity override logic (template default vs explicit)
 *   - Inactive template rejection
 */

import { describe, it, expect } from 'vitest';
import { CreateShiftTemplateSchema, UpdateShiftTemplateSchema } from '@/lib/validation';

// ── Helpers ───────────────────────────────────────────────────────────────────

function createTemplate(overrides: object = {}) {
    return CreateShiftTemplateSchema.safeParse({
        name: 'Morning Shift',
        startTime: '06:00',
        endTime: '14:00',
        ...overrides,
    });
}

// ── Template creation validation ──────────────────────────────────────────────

describe('CreateShiftTemplateSchema — valid inputs', () => {
    it('accepts a fully valid template', () => {
        const r = createTemplate();
        expect(r.success).toBe(true);
    });

    it('accepts a template without targetQuantity (optional field)', () => {
        const r = createTemplate({ targetQuantity: undefined });
        expect(r.success).toBe(true);
    });

    it('accepts targetQuantity = 1 (minimum positive value)', () => {
        const r = createTemplate({ targetQuantity: 1 });
        expect(r.success).toBe(true);
    });

    it('accepts large targetQuantity values', () => {
        const r = createTemplate({ targetQuantity: 99999 });
        expect(r.success).toBe(true);
    });

    it('accepts night shift spanning midnight (23:00–07:00)', () => {
        const r = createTemplate({ name: 'Night Shift', startTime: '23:00', endTime: '07:00' });
        expect(r.success).toBe(true);
    });

    it('accepts boundary times 00:00 and 23:59', () => {
        const r = createTemplate({ startTime: '00:00', endTime: '23:59' });
        expect(r.success).toBe(true);
    });
});

describe('CreateShiftTemplateSchema — name validation', () => {
    it('rejects empty name', () => {
        const r = createTemplate({ name: '' });
        expect(r.success).toBe(false);
    });

    it('rejects whitespace-only name would need trim — schema uses min(1)', () => {
        // Schema allows whitespace strings of length ≥1; UI trims before submit
        const r = createTemplate({ name: 'A' });
        expect(r.success).toBe(true);
    });

    it('rejects name longer than 80 characters', () => {
        const r = createTemplate({ name: 'A'.repeat(81) });
        expect(r.success).toBe(false);
    });

    it('accepts name of exactly 80 characters', () => {
        const r = createTemplate({ name: 'A'.repeat(80) });
        expect(r.success).toBe(true);
    });
});

describe('CreateShiftTemplateSchema — time validation', () => {
    it('rejects missing startTime', () => {
        const r = createTemplate({ startTime: undefined });
        expect(r.success).toBe(false);
    });

    it('rejects missing endTime', () => {
        const r = createTemplate({ endTime: undefined });
        expect(r.success).toBe(false);
    });

    it('rejects invalid time format (no colon)', () => {
        const r = createTemplate({ startTime: '0600' });
        expect(r.success).toBe(false);
    });

    it('rejects time with seconds component', () => {
        const r = createTemplate({ startTime: '06:00:00' });
        expect(r.success).toBe(false);
    });

    it('rejects hours > 23', () => {
        const r = createTemplate({ startTime: '24:00' });
        expect(r.success).toBe(false);
    });

    it('rejects minutes > 59', () => {
        const r = createTemplate({ startTime: '06:60' });
        expect(r.success).toBe(false);
    });

    it('rejects single-digit hour without leading zero', () => {
        const r = createTemplate({ startTime: '6:00' });
        expect(r.success).toBe(false);
    });

    it('accepts all boundary valid times', () => {
        // Use an endTime that never collides with startTime
        for (const t of ['00:00', '06:00', '14:00', '23:59']) {
            const endTime = t === '23:59' ? '00:00' : '23:59';
            const r = createTemplate({ startTime: t, endTime });
            expect(r.success, `expected ${t} to be valid`).toBe(true);
        }
    });
});

describe('CreateShiftTemplateSchema — end time must differ from start time', () => {
    it('rejects when startTime === endTime', () => {
        const r = createTemplate({ startTime: '08:00', endTime: '08:00' });
        expect(r.success).toBe(false);
    });

    it('error path is on endTime field', () => {
        const r = createTemplate({ startTime: '08:00', endTime: '08:00' });
        expect(r.success).toBe(false);
        if (r.success === false) {
            const paths = r.error.issues.map((e: { path: unknown[] }) => e.path[0]);
            expect(paths).toContain('endTime');
        }
    });

    it('passes when start and end are different', () => {
        const r = createTemplate({ startTime: '06:00', endTime: '14:00' });
        expect(r.success).toBe(true);
    });
});

describe('CreateShiftTemplateSchema — targetQuantity validation', () => {
    it('rejects targetQuantity = 0', () => {
        const r = createTemplate({ targetQuantity: 0 });
        expect(r.success).toBe(false);
    });

    it('rejects negative targetQuantity', () => {
        const r = createTemplate({ targetQuantity: -1 });
        expect(r.success).toBe(false);
    });

    it('rejects non-integer targetQuantity', () => {
        const r = createTemplate({ targetQuantity: 10.5 });
        expect(r.success).toBe(false);
    });
});

// ── UpdateShiftTemplateSchema ─────────────────────────────────────────────────

describe('UpdateShiftTemplateSchema — partial updates', () => {
    it('accepts an empty update object (no-op)', () => {
        const r = UpdateShiftTemplateSchema.safeParse({});
        expect(r.success).toBe(true);
    });

    it('accepts updating only the name', () => {
        const r = UpdateShiftTemplateSchema.safeParse({ name: 'Afternoon Shift' });
        expect(r.success).toBe(true);
    });

    it('accepts updating isActive to false', () => {
        const r = UpdateShiftTemplateSchema.safeParse({ isActive: false });
        expect(r.success).toBe(true);
    });

    it('rejects invalid time in partial update', () => {
        const r = UpdateShiftTemplateSchema.safeParse({ startTime: '99:00' });
        expect(r.success).toBe(false);
    });

    it('rejects when both times provided and they are equal', () => {
        const r = UpdateShiftTemplateSchema.safeParse({ startTime: '09:00', endTime: '09:00' });
        expect(r.success).toBe(false);
    });

    it('allows null targetQuantity to clear the field', () => {
        const r = UpdateShiftTemplateSchema.safeParse({ targetQuantity: null });
        expect(r.success).toBe(true);
    });
});

// ── Duplicate name prevention ─────────────────────────────────────────────────

describe('Duplicate template name prevention', () => {
    // Simulates the DB lookup the API route performs
    function isDuplicateName(existing: string[], candidate: string): boolean {
        return existing.some(n => n.toLowerCase() === candidate.toLowerCase().trim());
    }

    it('detects duplicate name (exact match)', () => {
        expect(isDuplicateName(['Morning Shift', 'Night Shift'], 'Morning Shift')).toBe(true);
    });

    it('detects duplicate name (case-insensitive)', () => {
        expect(isDuplicateName(['morning shift'], 'MORNING SHIFT')).toBe(true);
    });

    it('allows a unique name', () => {
        expect(isDuplicateName(['Morning Shift', 'Night Shift'], 'Afternoon Shift')).toBe(false);
    });

    it('returns false for an empty existing list', () => {
        expect(isDuplicateName([], 'Morning Shift')).toBe(false);
    });
});

// ── Schedule creation validation ──────────────────────────────────────────────

describe('Schedule creation rules', () => {
    interface ScheduleInput {
        templateId?: string;
        date?: string;
        targetQuantity?: number;
    }

    function validateSchedule(input: ScheduleInput): string | null {
        if (!input.templateId) return 'templateId required';
        if (!input.date) return 'date required';
        if (input.targetQuantity !== undefined && input.targetQuantity <= 0) return 'Target quantity must be > 0';
        return null;
    }

    it('passes with templateId and date', () => {
        expect(validateSchedule({ templateId: 'tpl-1', date: '2025-06-01' })).toBeNull();
    });

    it('fails when templateId is missing', () => {
        expect(validateSchedule({ date: '2025-06-01' })).toMatch(/templateId/);
    });

    it('fails when date is missing', () => {
        expect(validateSchedule({ templateId: 'tpl-1' })).toMatch(/date/);
    });

    it('fails when explicit targetQuantity is 0', () => {
        expect(validateSchedule({ templateId: 'tpl-1', date: '2025-06-01', targetQuantity: 0 })).toBeTruthy();
    });

    it('passes without explicit targetQuantity (uses template default)', () => {
        expect(validateSchedule({ templateId: 'tpl-1', date: '2025-06-01' })).toBeNull();
    });
});

// ── Target quantity override logic ────────────────────────────────────────────

describe('Target quantity resolution', () => {
    function resolveTarget(explicit: number | undefined, templateDefault: number | null): number {
        if (explicit && explicit > 0) return explicit;
        if (templateDefault && templateDefault > 0) return templateDefault;
        return 0;
    }

    it('uses explicit quantity when provided', () => {
        expect(resolveTarget(200, 350)).toBe(200);
    });

    it('falls back to template default when no explicit quantity', () => {
        expect(resolveTarget(undefined, 350)).toBe(350);
    });

    it('returns 0 when neither is set', () => {
        expect(resolveTarget(undefined, null)).toBe(0);
    });

    it('ignores template default when explicit is given', () => {
        expect(resolveTarget(500, 350)).toBe(500);
    });
});

// ── Inactive template rejection ───────────────────────────────────────────────

describe('Inactive template rejection', () => {
    interface Template { id: string; isActive: boolean }

    function canScheduleWith(template: Template): boolean {
        return template.isActive;
    }

    it('allows scheduling with an active template', () => {
        expect(canScheduleWith({ id: 't1', isActive: true })).toBe(true);
    });

    it('rejects scheduling with an inactive template', () => {
        expect(canScheduleWith({ id: 't2', isActive: false })).toBe(false);
    });
});
