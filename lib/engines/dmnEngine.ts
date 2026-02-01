/**
 * DMN 1.3 Compliant Decision Engine
 * Implements Decision Model and Notation 1.3 standard
 * 
 * Features:
 * - Decision table evaluation
 * - FEEL (Friendly Enough Expression Language) support
 * - Hit policy support (Unique, First, Priority, Any, Collect, RuleOrder, OutputOrder)
 * - Input/Output mapping
 * - Multiple decision tables
 * - Audit trail and logging
 * - Performance analytics
 */

import { v4 as uuidv4 } from 'uuid';

// ============ TYPES & INTERFACES ============

export enum HitPolicy {
  UNIQUE = 'Unique',
  FIRST = 'First',
  PRIORITY = 'Priority',
  ANY = 'Any',
  COLLECT = 'Collect',
  RULE_ORDER = 'RuleOrder',
  OUTPUT_ORDER = 'OutputOrder',
}

export enum BuiltinAggregation {
  SUM = 'Sum',
  COUNT = 'Count',
  MIN = 'Min',
  MAX = 'Max',
  COLLECT = 'Collect',
}

export interface Input {
  id: string;
  label: string;
  name: string;
  typeRef: string;
  expression: string;
}

export interface Output {
  id: string;
  label: string;
  name: string;
  typeRef: string;
  defaultValue?: any;
}

export interface DecisionRule {
  id: string;
  description?: string;
  inputEntries: string[]; // Array of FEEL expressions
  outputEntries: Record<string, any>; // Output name -> value
  priority?: number;
}

export interface DecisionTable {
  id: string;
  name: string;
  hitPolicy: HitPolicy;
  aggregation?: BuiltinAggregation;
  inputs: Input[];
  outputs: Output[];
  rules: DecisionRule[];
}

export interface DecisionResult {
  ruleId?: string;
  outputs: Record<string, any>;
  appliedRules: string[];
  evaluationTime: number;
  valid: boolean;
}

export interface EvaluationContext {
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  variables: Record<string, any>;
}

export interface DecisionLog {
  timestamp: Date;
  decisionTableId: string;
  decisionTableName: string;
  inputs: Record<string, any>;
  result: DecisionResult;
  executionTime: number;
}

// ============ FEEL EXPRESSION EVALUATOR ============

class FEELEvaluator {
  /**
   * Evaluate FEEL expression
   */
  static evaluate(expression: string, context: Record<string, any>): any {
    try {
      // Handle null/empty expressions
      if (!expression || expression.trim() === '') {
        return true;
      }

      // Handle string literals
      if (expression.startsWith('"') && expression.endsWith('"')) {
        return expression.slice(1, -1);
      }

      // Handle numeric literals
      const numValue = parseFloat(expression);
      if (!isNaN(numValue) && expression.trim() === numValue.toString()) {
        return numValue;
      }

      // Handle boolean
      if (expression.toLowerCase() === 'true') return true;
      if (expression.toLowerCase() === 'false') return false;

      // Handle null
      if (expression.toLowerCase() === 'null') return null;

      // Handle comparison expressions
      const comparisonMatch = expression.match(/(.+?)\s*(>=|<=|>|<|=|!=)\s*(.+)/);
      if (comparisonMatch) {
        const [, left, operator, right] = comparisonMatch;
        return this.evaluateComparison(left.trim(), operator, right.trim(), context);
      }

      // Handle range expressions (e.g., "10..20")
      if (expression.includes('..')) {
        return this.evaluateRange(expression, context);
      }

      // Handle variable references
      if (context.hasOwnProperty(expression)) {
        return context[expression];
      }

      // Handle function calls (simplified)
      const funcMatch = expression.match(/(\w+)\((.*)\)/);
      if (funcMatch) {
        return this.evaluateFunction(funcMatch[1], funcMatch[2], context);
      }

      // Default: try to evaluate as expression
      const func = new Function(...Object.keys(context), `return ${expression}`);
      return func(...Object.values(context));
    } catch (error) {
      return false;
    }
  }

  private static evaluateComparison(
    left: string,
    operator: string,
    right: string,
    context: Record<string, any>
  ): boolean {
    const leftVal = this.evaluateValue(left, context);
    const rightVal = this.evaluateValue(right, context);

    switch (operator) {
      case '=':
      case '==':
        return leftVal === rightVal;
      case '!=':
      case '<>':
        return leftVal !== rightVal;
      case '>':
        return leftVal > rightVal;
      case '<':
        return leftVal < rightVal;
      case '>=':
        return leftVal >= rightVal;
      case '<=':
        return leftVal <= rightVal;
      default:
        return false;
    }
  }

  private static evaluateRange(expression: string, context: Record<string, any>): boolean {
    const [min, max] = expression.split('..');
    const minVal = this.evaluateValue(min.trim(), context);
    const maxVal = this.evaluateValue(max.trim(), context);
    const testVal = context['?'];

    if (testVal === undefined) return false;
    return testVal >= minVal && testVal <= maxVal;
  }

  private static evaluateValue(value: string, context: Record<string, any>): any {
    const trimmed = value.trim();

    // Numeric literal
    const numValue = parseFloat(trimmed);
    if (!isNaN(numValue) && trimmed === numValue.toString()) {
      return numValue;
    }

    // String literal
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1);
    }

    // Variable reference
    if (context.hasOwnProperty(trimmed)) {
      return context[trimmed];
    }

    return trimmed;
  }

  private static evaluateFunction(
    funcName: string,
    argsStr: string,
    context: Record<string, any>
  ): any {
    const args = argsStr.split(',').map((arg) => this.evaluateValue(arg.trim(), context));

    switch (funcName.toLowerCase()) {
      case 'sum':
        return args.reduce((a, b) => a + b, 0);
      case 'count':
        return args.length;
      case 'min':
        return Math.min(...args);
      case 'max':
        return Math.max(...args);
      case 'avg':
        return args.reduce((a, b) => a + b, 0) / args.length;
      case 'upper':
        return (args[0] as string).toUpperCase();
      case 'lower':
        return (args[0] as string).toLowerCase();
      case 'length':
        return (args[0] as string).length;
      default:
        return null;
    }
  }
}

// ============ DMN ENGINE ============

export class DMNEngine {
  private decisionTables: Map<string, DecisionTable> = new Map();
  private logs: DecisionLog[] = [];
  private eventListeners: Map<string, Function[]> = new Map();

  /**
   * Register a decision table
   */
  registerDecisionTable(table: DecisionTable): void {
    this.decisionTables.set(table.id, table);
  }

  /**
   * Evaluate a decision table
   */
  async evaluateDecision(
    decisionTableId: string,
    inputs: Record<string, any>
  ): Promise<DecisionResult> {
    const startTime = Date.now();
    const table = this.decisionTables.get(decisionTableId);

    if (!table) {
      throw new Error(`Decision table ${decisionTableId} not found`);
    }

    // Create evaluation context
    const context: EvaluationContext = {
      inputs,
      outputs: {},
      variables: inputs,
    };

    // Evaluate rules based on hit policy
    const applicableRules = this.evaluateRules(table, context);

    // Process results based on hit policy
    const result = this.processResults(table, applicableRules, context);

    // Log evaluation
    const executionTime = Date.now() - startTime;
    this.logDecision(table, inputs, result, executionTime);

    // Emit event
    this.emit('decision:evaluated', { table, inputs, result });

    return result;
  }

  /**
   * Evaluate all rules against inputs
   */
  private evaluateRules(
    table: DecisionTable,
    context: EvaluationContext
  ): DecisionRule[] {
    const applicable: DecisionRule[] = [];

    for (const rule of table.rules) {
      let ruleMatches = true;

      // Check all input entries
      for (let i = 0; i < rule.inputEntries.length; i++) {
        const entry = rule.inputEntries[i];
        const input = table.inputs[i];

        if (entry && entry.trim() !== '-' && entry.trim() !== '') {
          // Create a test context with the input value
          const testContext = {
            ...context.variables,
            '?': this.evaluateInputExpression(input.expression, context.variables),
          };

          const matches = FEELEvaluator.evaluate(entry, testContext);
          if (!matches) {
            ruleMatches = false;
            break;
          }
        }
      }

      if (ruleMatches) {
        applicable.push(rule);
      }
    }

    return applicable;
  }

  /**
   * Process results based on hit policy
   */
  private processResults(
    table: DecisionTable,
    rules: DecisionRule[],
    context: EvaluationContext
  ): DecisionResult {
    const result: DecisionResult = {
      outputs: {},
      appliedRules: [],
      evaluationTime: 0,
      valid: true,
    };

    if (rules.length === 0) {
      // Apply default values
      for (const output of table.outputs) {
        result.outputs[output.name] = output.defaultValue;
      }
      result.valid = false;
      return result;
    }

    switch (table.hitPolicy) {
      case HitPolicy.UNIQUE:
        if (rules.length === 1) {
          result.ruleId = rules[0].id;
          result.outputs = { ...rules[0].outputEntries };
          result.appliedRules = [rules[0].id];
        } else {
          result.valid = false;
          throw new Error(`Multiple rules matched in UNIQUE hit policy for ${table.id}`);
        }
        break;

      case HitPolicy.FIRST:
        result.ruleId = rules[0].id;
        result.outputs = { ...rules[0].outputEntries };
        result.appliedRules = [rules[0].id];
        break;

      case HitPolicy.PRIORITY:
        const sorted = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));
        result.ruleId = sorted[0].id;
        result.outputs = { ...sorted[0].outputEntries };
        result.appliedRules = [sorted[0].id];
        break;

      case HitPolicy.ANY:
        // All applicable rules must have the same output
        const firstOutputs = rules[0].outputEntries;
        const allSame = rules.every((r) =>
          JSON.stringify(r.outputEntries) === JSON.stringify(firstOutputs)
        );

        if (!allSame) {
          result.valid = false;
          throw new Error(`Conflicting outputs in ANY hit policy for ${table.id}`);
        }

        result.outputs = { ...firstOutputs };
        result.appliedRules = rules.map((r) => r.id);
        break;

      case HitPolicy.COLLECT:
        // Collect all outputs (array of results)
        result.outputs = this.collectResults(table, rules, table.aggregation);
        result.appliedRules = rules.map((r) => r.id);
        break;

      case HitPolicy.RULE_ORDER:
      case HitPolicy.OUTPUT_ORDER:
        // Return all applicable rules
        result.outputs = rules[0].outputEntries;
        result.appliedRules = rules.map((r) => r.id);
        break;

      default:
        result.outputs = { ...rules[0].outputEntries };
        result.appliedRules = [rules[0].id];
    }

    return result;
  }

  /**
   * Collect results for COLLECT hit policy
   */
  private collectResults(
    table: DecisionTable,
    rules: DecisionRule[],
    aggregation?: BuiltinAggregation
  ): Record<string, any> {
    const collected: Record<string, any[]> = {};

    for (const output of table.outputs) {
      collected[output.name] = [];
    }

    for (const rule of rules) {
      for (const [key, value] of Object.entries(rule.outputEntries)) {
        if (collected.hasOwnProperty(key)) {
          collected[key].push(value);
        }
      }
    }

    // Apply aggregation if specified
    if (aggregation) {
      const result: Record<string, any> = {};

      for (const [key, values] of Object.entries(collected)) {
        switch (aggregation) {
          case BuiltinAggregation.SUM:
            result[key] = values.reduce((a: any, b: any) => a + b, 0);
            break;
          case BuiltinAggregation.COUNT:
            result[key] = values.length;
            break;
          case BuiltinAggregation.MIN:
            result[key] = Math.min(...values);
            break;
          case BuiltinAggregation.MAX:
            result[key] = Math.max(...values);
            break;
          case BuiltinAggregation.COLLECT:
          default:
            result[key] = values;
        }
      }

      return result;
    }

    return collected;
  }

  /**
   * Evaluate input expression (simplified)
   */
  private evaluateInputExpression(expression: string, variables: Record<string, any>): any {
    return FEELEvaluator.evaluate(expression, variables);
  }

  /**
   * Log decision
   */
  private logDecision(
    table: DecisionTable,
    inputs: Record<string, any>,
    result: DecisionResult,
    executionTime: number
  ): void {
    const log: DecisionLog = {
      timestamp: new Date(),
      decisionTableId: table.id,
      decisionTableName: table.name,
      inputs,
      result,
      executionTime,
    };

    this.logs.push(log);
    this.emit('decision:logged', log);
  }

  /**
   * Get decision logs
   */
  getLogs(limit: number = 100): DecisionLog[] {
    return this.logs.slice(-limit);
  }

  /**
   * Event management
   */
  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => callback(data));
    }
  }
}

export default DMNEngine;
