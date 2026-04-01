/**
 * Industry-Ready Validation Utilities for MES
 * Provides comprehensive validation for all MES operations
 */

import { z } from 'zod';

// Work Order Validation
export const workOrderSchema = z.object({
    orderNumber: z.string()
        .min(3, "Order number must be at least 3 characters")
        .max(50, "Order number too long")
        .regex(/^[A-Z0-9-]+$/, "Order number must contain only uppercase letters, numbers, and hyphens"),
    quantity: z.number()
        .int("Quantity must be an integer")
        .min(1, "Quantity must be at least 1")
        .max(10000, "Quantity too large"),
    productId: z.string()
        .uuid("Invalid product ID"),
    priority: z.number()
        .int("Priority must be an integer")
        .min(1, "Priority must be between 1 and 10")
        .max(10, "Priority must be between 1 and 10")
        .optional(),
    dueDate: z.string()
        .datetime("Invalid due date format")
});

// Quality Check Validation
export const qualityCheckSchema = z.object({
    parameter: z.string()
        .min(1, "Parameter name required")
        .max(100, "Parameter name too long"),
    expected: z.string()
        .min(1, "Expected value required")
        .max(200, "Expected value too long"),
    actual: z.string()
        .min(1, "Actual value required")
        .max(200, "Actual value too long"),
    result: z.enum(['PASS', 'FAIL', 'REWORK'], {
        message: "Result must be PASS, FAIL, or REWORK"
    }),
    taskId: z.string()
        .uuid("Invalid task ID")
});

// Machine Validation
export const machineSchema = z.object({
    code: z.string()
        .min(2, "Machine code must be at least 2 characters")
        .max(20, "Machine code too long")
        .regex(/^[A-Z0-9-]+$/, "Machine code must contain only uppercase letters, numbers, and hyphens"),
    name: z.string()
        .min(3, "Machine name must be at least 3 characters")
        .max(100, "Machine name too long"),
    status: z.enum(['IDLE', 'RUNNING', 'DOWN', 'MAINTENANCE'], {
        message: "Invalid machine status"
    }),
    oee: z.number()
        .min(0, "OEE cannot be negative")
        .max(100, "OEE cannot exceed 100")
});

// User Validation
export const userSchema = z.object({
    username: z.string()
        .min(3, "Username must be at least 3 characters")
        .max(50, "Username too long")
        .regex(/^[a-z0-9_]+$/, "Username must contain only lowercase letters, numbers, and underscores"),
    role: z.enum(['OPERATOR', 'SUPERVISOR', 'ADMIN'], {
        message: "Invalid user role"
    })
});

// Workflow Definition Validation
export const workflowDefinitionSchema = z.object({
    name: z.string()
        .min(3, "Workflow name must be at least 3 characters")
        .max(100, "Workflow name too long"),
    payload: z.string()
        .min(10, "Workflow payload too short")
        .refine((val) => {
            try {
                JSON.parse(val);
                return true;
            } catch {
                return false;
            }
        }, "Payload must be valid JSON")
});

// Task Operation Validation
export const taskOperationSchema = z.object({
    taskId: z.string().uuid("Invalid task ID"),
    operatorId: z.string().uuid("Invalid operator ID").optional(),
    notes: z.string().max(500, "Notes too long").optional()
});

// API Response Validation
export const apiResponseSchema = z.object({
    success: z.boolean(),
    data: z.any().optional(),
    error: z.string().optional(),
    timestamp: z.string().datetime().optional()
});

// Validation Helper Functions
export function validateWorkOrder(data: unknown) {
    return workOrderSchema.safeParse(data);
}

export function validateQualityCheck(data: unknown) {
    return qualityCheckSchema.safeParse(data);
}

export function validateMachine(data: unknown) {
    return machineSchema.safeParse(data);
}

export function validateUser(data: unknown) {
    return userSchema.safeParse(data);
}

export function validateWorkflowDefinition(data: unknown) {
    return workflowDefinitionSchema.safeParse(data);
}

export function validateTaskOperation(data: unknown) {
    return taskOperationSchema.safeParse(data);
}

// Business Logic Validation
export function validateTaskTransition(currentStatus: string, newStatus: string): boolean {
    const validTransitions: Record<string, string[]> = {
        'PENDING': ['IN_PROGRESS', 'CANCELLED'],
        'IN_PROGRESS': ['COMPLETED', 'CANCELLED', 'PAUSED'],
        'PAUSED': ['IN_PROGRESS', 'CANCELLED'],
        'COMPLETED': [],
        'CANCELLED': []
    };
    
    return validTransitions[currentStatus]?.includes(newStatus) || false;
}

export function validateQualityGate(qualityChecks: any[]): { canProceed: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check for failed quality checks
    const failedChecks = qualityChecks.filter(check => check.result === 'FAIL');
    if (failedChecks.length > 0) {
        issues.push(`${failedChecks.length} quality check(s) failed`);
    }
    
    // Check for rework required
    const reworkChecks = qualityChecks.filter(check => check.result === 'REWORK');
    if (reworkChecks.length > 0) {
        issues.push(`${reworkChecks.length} quality check(s) require rework`);
    }
    
    // Check if all critical parameters have been checked
    const criticalParameters = ['Dimension', 'Visual Inspection', 'Torque'];
    const checkedParameters = qualityChecks.map(check => check.parameter);
    const missingCritical = criticalParameters.filter(param => !checkedParameters.includes(param));
    
    if (missingCritical.length > 0) {
        issues.push(`Missing critical checks: ${missingCritical.join(', ')}`);
    }
    
    return {
        canProceed: issues.length === 0,
        issues
    };
}

export function validateMachineAvailability(machineId: string, startTime: Date, endTime: Date): Promise<boolean> {
    // This would typically check against scheduled maintenance, other tasks, etc.
    // For now, return true (machine is available)
    return Promise.resolve(true);
}

export function validateWorkOrderCapacity(productId: string, quantity: number, dueDate: Date): Promise<{ canProduce: boolean; issues: string[] }> {
    // This would typically check against production capacity, material availability, etc.
    // For now, return a simple validation
    const issues: string[] = [];
    
    if (quantity > 1000) {
        issues.push('Quantity exceeds maximum production capacity');
    }
    
    const daysUntilDue = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilDue < 1) {
        issues.push('Due date is too soon for production');
    }
    
    return Promise.resolve({
        canProduce: issues.length === 0,
        issues
    });
}

// Error Types
export class ValidationError extends Error {
    constructor(message: string, public field?: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export class BusinessLogicError extends Error {
    constructor(message: string, public code?: string) {
        super(message);
        this.name = 'BusinessLogicError';
    }
}

export class SystemError extends Error {
    constructor(message: string, public originalError?: Error) {
        super(message);
        this.name = 'SystemError';
    }
}
