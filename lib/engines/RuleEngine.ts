import { prisma } from '@/lib/services/database';

interface RuleLogic {
    field: string;
    operator: '>' | '<' | '==' | '!=' | '>=' | '<=';
    value: string | number | boolean;
}

export class RuleEngine {

    /**
     * Evaluate a Quality Rule against a set of data.
     */
    static async evaluateRule(ruleId: string, data: Record<string, any>): Promise<{ passed: boolean, message?: string }> {
        const rule = await prisma.qualityRule.findUnique({ where: { id: ruleId } });
        if (!rule) throw new Error('Rule not found');

        let logic: RuleLogic;
        try {
            logic = JSON.parse(rule.logic);
        } catch {
            return { passed: false, message: 'Invalid Rule Logic Definition' };
        }

        const actualValue = data[logic.field];
        if (actualValue === undefined) {
            return { passed: false, message: `Field '${logic.field}' missing in data` };
        }

        const passed = this.compare(actualValue, logic.operator, logic.value);
        return {
            passed,
            message: passed ? 'Rule Passed' : `Rule Failed: ${logic.field} (${actualValue}) ${logic.operator} ${logic.value}`
        };
    }

    private static compare(actual: any, operator: string, target: any): boolean {
        switch (operator) {
            case '==': return actual == target;
            case '!=': return actual != target;
            case '>': return Number(actual) > Number(target);
            case '<': return Number(actual) < Number(target);
            case '>=': return Number(actual) >= Number(target);
            case '<=': return Number(actual) <= Number(target);
            default: return false;
        }
    }
}
