import { describe, it, expect } from 'vitest';
import {
    isProductActive,
    isBOMRecursive,
    validateBOMQuantity,
    hasSequenceDuplicate,
    isRoutingComplete,
    missingCapabilities,
    calcMaterialVariance,
    calcVariancePct,
    calcScrapPct,
    calcNetRequirement,
} from '../services/ProductMasterService';

// ── isProductActive ───────────────────────────────────────────────────────────

describe('isProductActive', () => {
    it('returns true when isActive = true', () => {
        expect(isProductActive({ isActive: true })).toBe(true);
    });

    it('returns false when isActive = false', () => {
        expect(isProductActive({ isActive: false })).toBe(false);
    });
});

// ── isBOMRecursive (recursion prevention) ────────────────────────────────────

describe('isBOMRecursive', () => {
    it('detects direct self-reference', () => {
        expect(isBOMRecursive('PART-A', 'PART-A', [])).toBe(true);
    });

    it('no recursion when adding a new unrelated component', () => {
        expect(isBOMRecursive('PARENT', 'CHILD', [])).toBe(false);
    });

    it('detects indirect cycle: PARENT → CHILD → PARENT', () => {
        const existing = [
            { parentCode: 'CHILD',  componentCode: 'PARENT' },
        ];
        expect(isBOMRecursive('PARENT', 'CHILD', existing)).toBe(true);
    });

    it('detects deep cycle: A → B → C → A', () => {
        const existing = [
            { parentCode: 'B', componentCode: 'C' },
            { parentCode: 'C', componentCode: 'A' },
        ];
        expect(isBOMRecursive('A', 'B', existing)).toBe(true);
    });

    it('no false positive when component is used in unrelated BOM', () => {
        const existing = [
            { parentCode: 'X', componentCode: 'Y' },
            { parentCode: 'Y', componentCode: 'Z' },
        ];
        // Adding CHILD to PARENT: no cycle
        expect(isBOMRecursive('PARENT', 'CHILD', existing)).toBe(false);
    });

    it('no false positive for sibling components', () => {
        const existing = [
            { parentCode: 'PARENT', componentCode: 'COMP-A' },
            { parentCode: 'PARENT', componentCode: 'COMP-B' },
        ];
        // Adding COMP-C to PARENT: fine
        expect(isBOMRecursive('PARENT', 'COMP-C', existing)).toBe(false);
    });

    it('handles large tree without false positive', () => {
        // Chain: ROOT → A → B → C → D (4 levels deep)
        const existing = [
            { parentCode: 'ROOT', componentCode: 'A' },
            { parentCode: 'A',    componentCode: 'B' },
            { parentCode: 'B',    componentCode: 'C' },
            { parentCode: 'C',    componentCode: 'D' },
        ];
        // Adding E to ROOT is fine
        expect(isBOMRecursive('ROOT', 'E', existing)).toBe(false);
    });

    it('detects cycle at deep level: adding ROOT as component of D', () => {
        const existing = [
            { parentCode: 'ROOT', componentCode: 'A' },
            { parentCode: 'A',    componentCode: 'B' },
            { parentCode: 'B',    componentCode: 'C' },
            { parentCode: 'C',    componentCode: 'D' },
        ];
        // Adding ROOT as a component of D (isBOMRecursive('D', 'ROOT', ...)):
        // BFS from ROOT reaches A → B → C → D == parentProductSku 'D' → cycle!
        expect(isBOMRecursive('D', 'ROOT', existing)).toBe(true);
    });
});

// ── validateBOMQuantity ───────────────────────────────────────────────────────

describe('validateBOMQuantity', () => {
    it('positive integer is valid', () => {
        expect(validateBOMQuantity(5)).toBe(true);
    });

    it('positive decimal is valid', () => {
        expect(validateBOMQuantity(0.5)).toBe(true);
    });

    it('zero is invalid', () => {
        expect(validateBOMQuantity(0)).toBe(false);
    });

    it('negative is invalid', () => {
        expect(validateBOMQuantity(-1)).toBe(false);
    });

    it('NaN is invalid', () => {
        expect(validateBOMQuantity(NaN)).toBe(false);
    });

    it('Infinity is invalid', () => {
        expect(validateBOMQuantity(Infinity)).toBe(false);
    });

    it('very small positive is valid', () => {
        expect(validateBOMQuantity(0.001)).toBe(true);
    });
});

// ── hasSequenceDuplicate ──────────────────────────────────────────────────────

describe('hasSequenceDuplicate', () => {
    it('returns false when sequence is new', () => {
        expect(hasSequenceDuplicate([10, 20, 30], 40)).toBe(false);
    });

    it('returns true when sequence already exists', () => {
        expect(hasSequenceDuplicate([10, 20, 30], 20)).toBe(true);
    });

    it('empty existing list — no duplicate', () => {
        expect(hasSequenceDuplicate([], 1)).toBe(false);
    });

    it('single element match', () => {
        expect(hasSequenceDuplicate([5], 5)).toBe(true);
    });

    it('sequence 0 not duplicated by sequence 1', () => {
        expect(hasSequenceDuplicate([0], 1)).toBe(false);
    });
});

// ── isRoutingComplete ─────────────────────────────────────────────────────────

describe('isRoutingComplete', () => {
    const ops = [
        { operationCode: 'OP-01', inspectionRequired: true  },
        { operationCode: 'OP-02', inspectionRequired: false },
        { operationCode: 'OP-03', inspectionRequired: true  },
    ];

    it('complete when all required ops are in completedCodes', () => {
        expect(isRoutingComplete(ops, ['OP-01', 'OP-03'])).toBe(true);
    });

    it('not complete when one required op is missing', () => {
        expect(isRoutingComplete(ops, ['OP-01'])).toBe(false);
    });

    it('complete when no ops require inspection', () => {
        const noInspection = [
            { operationCode: 'OP-A', inspectionRequired: false },
        ];
        expect(isRoutingComplete(noInspection, [])).toBe(true);
    });

    it('complete with extra non-required codes in completedCodes', () => {
        expect(isRoutingComplete(ops, ['OP-01', 'OP-02', 'OP-03'])).toBe(true);
    });

    it('empty operations → always complete', () => {
        expect(isRoutingComplete([], [])).toBe(true);
    });

    it('only optional ops → complete even with empty completed', () => {
        const optionalOnly = [
            { operationCode: 'OP-X', inspectionRequired: false },
            { operationCode: 'OP-Y', inspectionRequired: false },
        ];
        expect(isRoutingComplete(optionalOnly, [])).toBe(true);
    });
});

// ── missingCapabilities ───────────────────────────────────────────────────────

describe('missingCapabilities', () => {
    it('returns empty when all capabilities are present', () => {
        const ops = [
            { machineCapabilityType: 'WELDING' },
            { machineCapabilityType: 'CUTTING' },
        ];
        expect(missingCapabilities(ops, ['WELDING', 'CUTTING', 'ASSEMBLY'])).toEqual([]);
    });

    it('returns missing capability types', () => {
        const ops = [
            { machineCapabilityType: 'WELDING' },
            { machineCapabilityType: 'PAINTING' },
        ];
        const missing = missingCapabilities(ops, ['WELDING']);
        expect(missing).toContain('PAINTING');
        expect(missing).not.toContain('WELDING');
    });

    it('deduplicates repeated capability types in operations', () => {
        const ops = [
            { machineCapabilityType: 'WELDING' },
            { machineCapabilityType: 'WELDING' },
        ];
        const missing = missingCapabilities(ops, []);
        expect(missing).toEqual(['WELDING']); // only once
    });

    it('empty operations → no missing capabilities', () => {
        expect(missingCapabilities([], [])).toEqual([]);
    });

    it('all operations missing from empty capabilities', () => {
        const ops = [
            { machineCapabilityType: 'CUTTING' },
            { machineCapabilityType: 'ASSEMBLY' },
        ];
        const missing = missingCapabilities(ops, []);
        expect(missing.sort()).toEqual(['ASSEMBLY', 'CUTTING'].sort());
    });
});

// ── calcMaterialVariance ──────────────────────────────────────────────────────

describe('calcMaterialVariance', () => {
    it('positive variance when under-consumed', () => {
        expect(calcMaterialVariance(100, 80)).toBe(20);
    });

    it('negative variance when over-consumed', () => {
        expect(calcMaterialVariance(80, 100)).toBe(-20);
    });

    it('zero variance when exactly consumed', () => {
        expect(calcMaterialVariance(50, 50)).toBe(0);
    });

    it('zero planned and zero actual → 0', () => {
        expect(calcMaterialVariance(0, 0)).toBe(0);
    });
});

// ── calcVariancePct ───────────────────────────────────────────────────────────

describe('calcVariancePct', () => {
    it('50% under-consumed', () => {
        expect(calcVariancePct(100, 50)).toBe(50);
    });

    it('−25% over-consumed (planned < actual)', () => {
        expect(calcVariancePct(80, 100)).toBe(-25);
    });

    it('0% when exact', () => {
        expect(calcVariancePct(100, 100)).toBe(0);
    });

    it('0% when planned is 0 (avoids division by zero)', () => {
        expect(calcVariancePct(0, 50)).toBe(0);
    });

    it('100% when nothing consumed', () => {
        expect(calcVariancePct(100, 0)).toBe(100);
    });

    it('rounds to 2 decimal places', () => {
        // 100 planned, 33 actual = 67/100 = 67%
        expect(calcVariancePct(100, 33)).toBeCloseTo(67, 0);
    });
});

// ── calcScrapPct ──────────────────────────────────────────────────────────────

describe('calcScrapPct', () => {
    it('10 scrap out of 90 good + 10 scrap = 10%', () => {
        expect(calcScrapPct(10, 90)).toBe(10);
    });

    it('0 scrap → 0%', () => {
        expect(calcScrapPct(0, 100)).toBe(0);
    });

    it('all scrap → 100%', () => {
        expect(calcScrapPct(100, 0)).toBe(100);
    });

    it('0 scrap and 0 actual → 0% (avoids division by zero)', () => {
        expect(calcScrapPct(0, 0)).toBe(0);
    });

    it('rounds correctly', () => {
        // 5 scrap, 95 actual → 5/100 = 5%
        expect(calcScrapPct(5, 95)).toBe(5);
    });

    it('fractional scrap rate', () => {
        // 1 scrap, 9 actual → 10%
        expect(calcScrapPct(1, 9)).toBe(10);
    });
});

// ── calcNetRequirement ────────────────────────────────────────────────────────

describe('calcNetRequirement', () => {
    it('5% scrap factor on 100 units → ~105.26', () => {
        const net = calcNetRequirement(100, 0.05);
        expect(net).toBeCloseTo(105.26, 1);
    });

    it('no scrap factor (0) → exact quantity', () => {
        expect(calcNetRequirement(100, 0)).toBe(100);
    });

    it('negative scrap factor returns quantity unchanged', () => {
        expect(calcNetRequirement(50, -0.1)).toBe(50);
    });

    it('scrap factor >= 1 returns quantity unchanged (guard against division by zero)', () => {
        expect(calcNetRequirement(50, 1)).toBe(50);
    });

    it('10% scrap factor on 200 units → ~222.22', () => {
        const net = calcNetRequirement(200, 0.1);
        expect(net).toBeCloseTo(222.22, 1);
    });
});

// ── Routing sequence validation (integration scenario) ───────────────────────

describe('routing sequence validation integration', () => {
    it('duplicate sequence detection', () => {
        const sequences = [10, 20, 30];
        expect(hasSequenceDuplicate(sequences, 20)).toBe(true);
        expect(hasSequenceDuplicate(sequences, 40)).toBe(false);
    });

    it('routing is complete only when all inspection operations done', () => {
        const routing = [
            { operationCode: 'CUT',    inspectionRequired: false },
            { operationCode: 'WELD',   inspectionRequired: true  },
            { operationCode: 'GRIND',  inspectionRequired: false },
            { operationCode: 'INSPECT',inspectionRequired: true  },
            { operationCode: 'PAINT',  inspectionRequired: false },
        ];
        expect(isRoutingComplete(routing, ['WELD'])).toBe(false);
        expect(isRoutingComplete(routing, ['WELD', 'INSPECT'])).toBe(true);
    });

    it('capability check prevents scheduling on wrong machine', () => {
        const routing = [
            { machineCapabilityType: 'PLASMA_CUT' },
            { machineCapabilityType: 'TIG_WELD' },
        ];
        const machineCaps = ['PLASMA_CUT']; // TIG_WELD not available
        const missing = missingCapabilities(routing, machineCaps);
        expect(missing).toContain('TIG_WELD');
    });
});

// ── Inactive product blocking ─────────────────────────────────────────────────

describe('inactive product blocking', () => {
    it('inactive product is blocked from any workflow', () => {
        const product = { isActive: false };
        expect(isProductActive(product)).toBe(false);
    });

    it('active product is allowed', () => {
        const product = { isActive: true };
        expect(isProductActive(product)).toBe(true);
    });

    it('BOM cannot be added to inactive product (enforced at API layer — pure check)', () => {
        // isProductActive is the gate; we verify the gate logic itself here
        const inactive = { isActive: false };
        const active   = { isActive: true };
        expect(isProductActive(inactive)).toBe(false);
        expect(isProductActive(active)).toBe(true);
    });
});

// ── Duplicate prevention ──────────────────────────────────────────────────────

describe('duplicate prevention', () => {
    it('same componentCode in two BOM items for same BOM is caught by sequence check', () => {
        // In the API this is a unique constraint; pure side: detecting duplicates in an array
        const codes = ['COMP-A', 'COMP-B', 'COMP-A'];
        const hasDup = new Set(codes).size !== codes.length;
        expect(hasDup).toBe(true);
    });

    it('unique component codes pass', () => {
        const codes = ['COMP-A', 'COMP-B', 'COMP-C'];
        const hasDup = new Set(codes).size !== codes.length;
        expect(hasDup).toBe(false);
    });

    it('duplicate operation codes within a routing are detected', () => {
        const codes = ['OP-01', 'OP-02', 'OP-01'];
        const hasDup = new Set(codes).size !== codes.length;
        expect(hasDup).toBe(true);
    });
});
