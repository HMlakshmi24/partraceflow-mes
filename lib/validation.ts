/**
 * Zod validation schemas for all API routes.
 * Import the relevant schema in each route handler and call .safeParse(body).
 */

import { z } from 'zod';

// ─── Auth ─────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
    username: z.string().min(1).max(64).regex(/^[\w\-\.@]+$/, 'Invalid characters in username'),
    password: z.string().min(1).max(128),
});

// ─── Work Orders ─────────────────────────────────────────────────────────

export const CreateWorkOrderSchema = z.object({
    orderNumber: z.string().min(1).max(64),
    quantity: z.number().int().positive(),
    priority: z.number().int().min(1).max(5),
    status: z.enum(['PLANNED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).default('PLANNED'),
    dueDate: z.string().datetime(),
    productId: z.string().uuid(),
});

export const UpdateWorkOrderSchema = z.object({
    id: z.string().uuid(),
    status: z.enum(['PLANNED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
    quantity: z.number().int().positive().optional(),
    priority: z.number().int().min(1).max(5).optional(),
    dueDate: z.string().datetime().optional(),
});

// ─── Quality ──────────────────────────────────────────────────────────────

export const QualityCheckSchema = z.object({
    taskId: z.string().uuid(),
    parameter: z.string().min(1).max(128),
    expected: z.string().max(256),
    actual: z.string().max(256),
    result: z.enum(['PASS', 'FAIL', 'PENDING']),
    notes: z.string().max(1024).optional(),
});

// ─── Recipes ──────────────────────────────────────────────────────────────

export const CreateRecipeSchema = z.object({
    action: z.literal('create'),
    code: z.string().min(1).max(64),
    name: z.string().min(1).max(128),
    productId: z.string().uuid(),
    description: z.string().max(1024).optional(),
    userId: z.string().optional(),
    parameters: z.array(z.object({
        parameterName: z.string().min(1).max(128),
        unit: z.string().max(32).optional(),
        nominalValue: z.number().optional(),
        minValue: z.number().optional(),
        maxValue: z.number().optional(),
        sequence: z.number().int().optional(),
    })).optional(),
});

export const ApproveRecipeSchema = z.object({
    action: z.literal('approve'),
    recipeId: z.string().uuid(),
    userId: z.string().optional(),
});

export const AssignMachineSchema = z.object({
    action: z.literal('assign_machine'),
    machineId: z.string().uuid(),
    recipeId: z.string().uuid(),
    userId: z.string().optional(),
    workOrderId: z.string().uuid().optional(),
});

// ─── Workflows ────────────────────────────────────────────────────────────

export const WorkflowStartSchema = z.object({
    action: z.literal('start'),
    processId: z.string().min(1),
    workOrderId: z.string().optional(),
});

export const CompleteTaskSchema = z.object({
    action: z.literal('complete_task'),
    taskId: z.string().uuid(),
    userId: z.string().optional(),
});

// ─── Shifts ───────────────────────────────────────────────────────────────

export const CreateShiftScheduleSchema = z.object({
    action: z.literal('create_schedule'),
    shiftCode: z.string().min(1),
    date: z.string().datetime(),
    targetQuantity: z.number().int().positive(),
    productionLineId: z.string().optional(),
});

export const ClockInSchema = z.object({
    action: z.literal('clock_in'),
    scheduleId: z.string().uuid(),
    userId: z.string().uuid(),
    role: z.enum(['PRIMARY_OPERATOR', 'BACKUP', 'SUPERVISOR']).default('PRIMARY_OPERATOR'),
});

// ─── SPC ─────────────────────────────────────────────────────────────────

export const SPCRecordSchema = z.object({
    parameterId: z.string().uuid(),
    value: z.number(),
    machineId: z.string().uuid().optional(),
    measuredAt: z.string().datetime().optional(),
    notes: z.string().max(512).optional(),
});

// ─── Settings ─────────────────────────────────────────────────────────────

export const SessionRoleSchema = z.object({
    role: z.enum(['ADMIN', 'OPERATOR', 'SUPERVISOR', 'PLANNER', 'QUALITY', 'MAINTENANCE']),
});

// ─── Pipe Spool ───────────────────────────────────────────────────────────

export const SpoolStatusEnum = z.enum([
  'FABRICATING','RECEIVED','IN_STORAGE','ISSUED','FIT_UP',
  'WELDED','NDE_PENDING','NDE_CLEAR','REPAIR','PRESSURE_TESTED','HOLD','COMPLETE',
]);

export const JointStatusEnum = z.enum([
  'PENDING','FIT_UP','WELDED','NDE_PENDING','NDE_CLEAR','REPAIR','HOLD','COMPLETE',
]);

export const CreateSpoolSchema = z.object({
  spoolId:      z.string().min(1).max(64),
  lineId:       z.string().min(1),
  status:       SpoolStatusEnum.default('FABRICATING'),
  rfidTag1:     z.string().max(64).optional().nullable(),
  rfidTag2:     z.string().max(64).optional().nullable(),
  barcode:      z.string().max(128).optional().nullable(),
  material:     z.string().max(128).optional().nullable(),
  size:         z.string().max(64).optional().nullable(),
  heatNumber:   z.string().max(64).optional().nullable(),
  certNumber:   z.string().max(64).optional().nullable(),
  fabricatedBy: z.string().max(128).optional().nullable(),
});

export const UpdateSpoolStatusSchema = z.object({
  action: z.literal('update_status'),
  id:     z.string().min(1),
  status: SpoolStatusEnum,
  notes:  z.string().max(1024).optional(),
});

export const CreateWeldSchema = z.object({
  jointId:     z.string().min(1),
  welderId:    z.string().max(64).optional().nullable(),
  wps:         z.string().max(64).optional().nullable(),
  weldProcess: z.string().max(64).optional().nullable(),
  weldDate:    z.string().datetime().optional().nullable(),
  status:      z.string().optional(),
});

export const CreateNDESchema = z.object({
  jointId:   z.string().min(1),
  ndeType:   z.string().min(1).max(32),
  ndeNumber: z.string().max(64).optional().nullable(),
  inspector: z.string().max(128).optional().nullable(),
  result:    z.enum(['ACCEPTABLE','REJECTABLE','PENDING']).default('PENDING'),
  holdFlag:  z.boolean().default(false),
  notes:     z.string().max(2048).optional().nullable(),
});

export const CreateNCRSchema = z.object({
  spoolId:          z.string().optional().nullable(),
  jointId:          z.string().optional().nullable(),
  ncrNumber:        z.string().min(1).max(64),
  issueDescription: z.string().min(1).max(2048),
  severity:         z.enum(['MINOR','MAJOR','CRITICAL']),
  detectedBy:       z.string().max(128).optional().nullable(),
});

export const CreatePressureTestSchema = z.object({
  spoolId:      z.string().min(1),
  testType:     z.string().min(1).max(64),
  testPressure: z.number().positive().optional().nullable(),
  holdTime:     z.number().int().positive().optional().nullable(),
  testMedium:   z.string().max(64).optional().nullable(),
  witnessedBy:  z.string().max(128).optional().nullable(),
  result:       z.enum(['PASS','FAIL','PENDING']).optional().nullable(),
  testDate:     z.string().datetime().optional().nullable(),
});

export const RFIDIngestSchema = z.object({
  tagId:      z.string().min(1).max(128),
  readerId:   z.string().min(1).max(64),
  timestamp:  z.string().datetime().optional(),
  readerName: z.string().max(128).optional(),
  location:   z.string().max(128).optional(),
  rssi:       z.number().optional(),
});

export const ApproveSpoolSchema = z.object({
  spoolId: z.string().min(1),
  action: z.enum(['APPROVE', 'REJECT']),
  remarks: z.string().max(2048).optional(),
});

// ─── Helper ───────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';

export function validationError(errors: z.ZodError) {
    return NextResponse.json(
        {
            success: false,
            error: 'Validation failed',
            code: 'VALIDATION_ERROR',
            issues: errors.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
        },
        { status: 422 }
    );
}
