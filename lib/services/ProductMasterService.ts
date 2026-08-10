import { prisma } from '@/lib/services/database';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BOMItemInput {
    componentCode: string;
    quantity:      number;
    unitOfMeasure?: string;
    scrapFactor?:  number;
    description?:  string;
}

export interface RoutingOperationInput {
    operationCode:         string;
    operationName:         string;
    sequence:              number;
    machineCapabilityType: string;
    estimatedCycleTime:    number;
    setupTime?:            number;
    inspectionRequired?:   boolean;
    requiredSkill?:        string;
}

// ── Pure formula functions (exported for unit tests) ──────────────────────────

/** True when the product is available for scheduling and new work orders. */
export function isProductActive(product: { isActive: boolean }): boolean {
    return product.isActive;
}

/**
 * Check whether adding `componentCode` to a BOM would create a cycle.
 * A cycle exists when componentCode equals parentProductSku, or when
 * any existing BOM item for componentCode (as a parent) includes parentProductSku
 * anywhere in its tree.
 *
 * `existingItems` is a flat list of all BOM items in the system:
 *   { parentCode: string; componentCode: string }[]
 */
export function isBOMRecursive(
    parentProductSku: string,
    componentCode:    string,
    existingItems:    Array<{ parentCode: string; componentCode: string }>,
): boolean {
    // Direct self-reference
    if (parentProductSku === componentCode) return true;

    // Build adjacency map: parent → [children]
    const children = new Map<string, string[]>();
    for (const item of existingItems) {
        if (!children.has(item.parentCode)) children.set(item.parentCode, []);
        children.get(item.parentCode)!.push(item.componentCode);
    }

    // BFS from componentCode — if we reach parentProductSku, there's a cycle
    const visited = new Set<string>();
    const queue   = [componentCode];
    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current === parentProductSku) return true;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const child of children.get(current) ?? []) {
            queue.push(child);
        }
    }
    return false;
}

/** True when `quantity` is a valid BOM item quantity (> 0, finite). */
export function validateBOMQuantity(quantity: number): boolean {
    return Number.isFinite(quantity) && quantity > 0;
}

/** True when `sequence` already exists in the provided list of sequences. */
export function hasSequenceDuplicate(existingSequences: number[], newSequence: number): boolean {
    return existingSequences.includes(newSequence);
}

/**
 * True when all routing operations whose `inspectionRequired` is true
 * are present in `completedCodes`.
 */
export function isRoutingComplete(
    operations:     Array<{ operationCode: string; inspectionRequired: boolean }>,
    completedCodes: string[],
): boolean {
    const required = operations.filter(op => op.inspectionRequired).map(op => op.operationCode);
    return required.every(code => completedCodes.includes(code));
}

/**
 * Returns the set of machineCapabilityTypes required by the routing that
 * are NOT present in the provided capability list.
 */
export function missingCapabilities(
    operations:    Array<{ machineCapabilityType: string }>,
    capabilities:  string[],
): string[] {
    const capSet = new Set(capabilities);
    const missing: string[] = [];
    for (const op of operations) {
        if (!capSet.has(op.machineCapabilityType) && !missing.includes(op.machineCapabilityType)) {
            missing.push(op.machineCapabilityType);
        }
    }
    return missing;
}

/** Material variance: positive = over-planned (more issued than consumed). */
export function calcMaterialVariance(plannedQty: number, actualQty: number): number {
    return plannedQty - actualQty;
}

/** Variance as % of planned. Positive = under-consumed. Returns 0 when planned = 0. */
export function calcVariancePct(plannedQty: number, actualQty: number): number {
    if (plannedQty <= 0) return 0;
    return Math.round(((plannedQty - actualQty) / plannedQty) * 10_000) / 100;
}

/** Scrap rate as % of total material handled (actual + scrap). */
export function calcScrapPct(scrapQty: number, actualQty: number): number {
    const total = actualQty + scrapQty;
    if (total <= 0) return 0;
    return Math.round((scrapQty / total) * 10_000) / 100;
}

/** Net required quantity accounting for BOM scrap factor. */
export function calcNetRequirement(quantity: number, scrapFactor: number): number {
    if (scrapFactor < 0 || scrapFactor >= 1) return quantity;
    return quantity / (1 - scrapFactor);
}

// ── DB-backed service ─────────────────────────────────────────────────────────

export class ProductMasterService {

    // ── Products ─────────────────────────────────────────────────────────────

    static async assertProductActive(productId: string): Promise<void> {
        const product = await prisma.product.findUnique({ where: { id: productId }, select: { isActive: true, sku: true } });
        if (!product) throw new Error(`Product ${productId} not found`);
        if (!product.isActive) throw new Error(`Product ${product.sku} is inactive and cannot be scheduled`);
    }

    // ── BOM ──────────────────────────────────────────────────────────────────

    /**
     * Create a BOM header + items in one transaction.
     * Validates: quantity > 0, no recursive references, no duplicate component codes.
     */
    static async createBOM(
        productId:   string,
        revision:    string,
        description: string | undefined,
        items:       BOMItemInput[],
    ): Promise<{ bomId: string }> {
        // Load all existing BOM items to enable recursive check
        const allExistingItems = await prisma.bOMItem.findMany({
            include: { bom: { select: { product: { select: { sku: true } } } } },
        });
        const flatItems = allExistingItems.map(i => ({
            parentCode:    i.bom.product.sku,
            componentCode: i.componentCode,
        }));

        const product = await prisma.product.findUnique({ where: { id: productId }, select: { sku: true } });
        if (!product) throw new Error(`Product ${productId} not found`);

        for (const item of items) {
            if (!validateBOMQuantity(item.quantity)) {
                throw new Error(`BOM item ${item.componentCode}: quantity must be > 0`);
            }
            if (isBOMRecursive(product.sku, item.componentCode, flatItems)) {
                throw new Error(`BOM item ${item.componentCode} would create a recursive BOM`);
            }
        }

        const bom = await prisma.bOMItem.findFirst({ where: { bom: { productId, revision } } });
        if (bom) throw new Error(`BOM revision ${revision} already exists for this product`);

        const created = await prisma.billOfMaterial.create({
            data: {
                productId,
                revision,
                description,
                items: {
                    create: items.map(i => ({
                        componentCode: i.componentCode,
                        quantity:      i.quantity,
                        unitOfMeasure: i.unitOfMeasure ?? 'EA',
                        scrapFactor:   i.scrapFactor ?? null,
                        description:   i.description ?? null,
                    })),
                },
            },
        });
        return { bomId: created.id };
    }

    // ── Routing ───────────────────────────────────────────────────────────────

    /**
     * Create a routing + operations. Validates:
     * - sequence > 0 and unique within routing
     * - estimatedCycleTime > 0
     * - no duplicate operationCode within routing
     */
    static async createRouting(
        productId:   string,
        routingCode: string,
        revision:    string,
        description: string | undefined,
        operations:  RoutingOperationInput[],
    ): Promise<{ routingId: string }> {
        const sequences = operations.map(op => op.sequence);
        const uniqueSeqs = new Set(sequences);
        if (uniqueSeqs.size !== sequences.length) {
            throw new Error('Routing operations must have unique sequence numbers');
        }
        for (const op of operations) {
            if (op.sequence <= 0) throw new Error(`Operation ${op.operationCode}: sequence must be > 0`);
            if (op.estimatedCycleTime <= 0) throw new Error(`Operation ${op.operationCode}: estimatedCycleTime must be > 0`);
        }
        const codes = operations.map(op => op.operationCode);
        if (new Set(codes).size !== codes.length) {
            throw new Error('Routing operations must have unique operation codes');
        }

        const routing = await prisma.routing.create({
            data: {
                productId,
                routingCode,
                revision,
                description,
                operations: {
                    create: operations.map(op => ({
                        operationCode:         op.operationCode,
                        operationName:         op.operationName,
                        sequence:              op.sequence,
                        machineCapabilityType: op.machineCapabilityType,
                        estimatedCycleTime:    op.estimatedCycleTime,
                        setupTime:             op.setupTime ?? 0,
                        inspectionRequired:    op.inspectionRequired ?? false,
                        requiredSkill:         op.requiredSkill ?? null,
                    })),
                },
            },
        });
        return { routingId: routing.id };
    }
}
