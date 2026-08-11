/**
 * Shared threshold-comparison logic for quality-gate rules.
 *
 * Previously duplicated near-verbatim in QualityGateService and
 * AdvancedWorkflowEngine (both evaluating the same operator/value/
 * thresholdMin/thresholdMax shape from a QualityRule's parsed `logic`
 * JSON) — extracted to a single implementation both now call.
 */
export function evaluateThresholdRule(
    actual: number,
    operator: string,
    value: number,
    thresholdMin?: number,
    thresholdMax?: number,
): boolean {
    switch (operator) {
        case '>':
            return actual > value;
        case '<':
            return actual < value;
        case '>=':
            return actual >= value;
        case '<=':
            return actual <= value;
        case '==':
            return actual === value;
        case 'between':
            if (thresholdMin !== undefined && thresholdMax !== undefined) {
                return actual >= thresholdMin && actual <= thresholdMax;
            }
            return false;
        default:
            return true;
    }
}
