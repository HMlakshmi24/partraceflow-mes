/**
 * Zod validation schemas for all API routes.
 * Import the relevant schema in each route handler and call .safeParse(body).
 */

import { z } from 'zod';

export const noHtml = z.string().regex(/^[^<>]*$/, 'HTML tags are not allowed for security reasons (XSS protection).');



// ─── Auth ─────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
    username: z.string().min(1).max(64).regex(/^[\w\-\.@]+$/, 'Invalid characters in username'),
    password: z.string().min(1).max(128),
});

// MEDIUM fix: previously only self-service change-password enforced this —
// admin-driven user creation and password reset (and initial /api/setup
// bootstrap) accepted any 8-character string, so a weaker policy applied
// depending on which path set a password. Reused everywhere a password is
// set, not just changed.
export const StrongPasswordSchema = z.string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[\W_]/, 'Password must contain at least one symbol');

// ─── Work Orders ─────────────────────────────────────────────────────────

export const CreateWorkOrderSchema = z.object({
    orderNumber: z.string().min(1).max(64),
    quantity: z.number().int().positive(),
    priority: z.number().int().min(1).max(5),
    status: z.enum(['PLANNED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).default('PLANNED'),
    dueDate: z.string().datetime(),
    productId: z.string().min(1),
    machineId:  z.string().min(1).optional(),
    shiftId:    z.string().min(1).optional(),
    operatorId: z.string().min(1).optional(),
    scheduledStart: z.string().datetime().optional(),
    scheduledEnd:   z.string().datetime().optional(),
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
    notes: noHtml.max(1024).optional(),
});

// ─── Recipes ──────────────────────────────────────────────────────────────

export const CreateRecipeSchema = z.object({
    action: z.literal('create'),
    code: z.string().min(1).max(64),
    name: z.string().min(1).max(128),
    productId: z.string().uuid(),
    description: noHtml.max(1024).optional(),
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

// ─── Shift Templates ──────────────────────────────────────────────────────

// HH:MM format, 00:00–23:59
const timeString = z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:MM format (e.g. 06:00)');

export const CreateShiftTemplateSchema = z.object({
    name: z.string().min(1, 'Name is required').max(80),
    startTime: timeString,
    endTime: timeString,
    targetQuantity: z.number().int().positive('Target quantity must be greater than 0').optional(),
}).refine(
    (d) => d.startTime !== d.endTime,
    { message: 'End time must differ from start time', path: ['endTime'] },
);

export const UpdateShiftTemplateSchema = z.object({
    name: z.string().min(1).max(80).optional(),
    startTime: timeString.optional(),
    endTime: timeString.optional(),
    targetQuantity: z.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional(),
}).refine(
    (d) => {
        if (d.startTime && d.endTime) return d.startTime !== d.endTime;
        return true;
    },
    { message: 'End time must differ from start time', path: ['endTime'] },
);

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
    role: z.enum(['ADMIN', 'OPERATOR', 'SUPERVISOR', 'PLANNER', 'QC', 'QUALITY', 'MAINTENANCE']),
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
  workOrderId:  z.string().min(1).optional().nullable(),
  status:       SpoolStatusEnum.default('FABRICATING'),
  rfidTag1:     z.string().max(64).optional().nullable(),
  rfidTag2:     z.string().max(64).optional().nullable(),
  barcode:      z.string().max(128).optional().nullable(),
  material:     z.string().max(128).optional().nullable(),
  size:         z.string().max(64).optional().nullable(),
  schedule:     z.string().max(64).optional().nullable(),
  heatNumber:   z.string().max(64).optional().nullable(),
  certNumber:   z.string().max(64).optional().nullable(),
  fabricatedBy: z.string().max(128).optional().nullable(),
  notes:        z.string().max(1024).optional().nullable(),
});

export const UpdateSpoolStatusSchema = z.object({
  action: z.literal('update_status'),
  id:     z.string().min(1),
  status: SpoolStatusEnum,
  notes:  noHtml.max(1024).optional(),
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
  technique: z.string().max(128).optional().nullable(),
  result:    z.enum(['ACCEPTABLE','REJECTABLE','PENDING']).default('PENDING'),
  holdFlag:  z.boolean().default(false),
  notes:     noHtml.max(2048).optional().nullable(),
});

export const CreateNCRSchema = z.object({
  spoolId:          z.string().optional().nullable(),
  jointId:          z.string().optional().nullable(),
  // ncrNumber is server-generated (see the NCR-YYYY-NNNN sequence in the
  // route handler) — never supplied by the client, so it must not be
  // required here.
  relatedType:      z.string().max(64).optional().nullable(),
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

export const CreateJointSchema = z.object({
  jointId:       z.string().min(1).max(64),
  spoolId:       z.string().min(1),
  jointType:     z.enum(['FIELD_WELD','SHOP_WELD','FLANGE','SCREWED','SOCKET_WELD']).default('FIELD_WELD'),
  rfidTag1:      z.string().max(64).optional().nullable(),
  rfidTag2:      z.string().max(64).optional().nullable(),
  barcode:       z.string().max(128).optional().nullable(),
  size:          z.string().max(64).optional().nullable(),
  material:      z.string().max(128).optional().nullable(),
  weldProcedure: z.string().max(64).optional().nullable(),
  welderId:      z.string().max(128).optional().nullable(),
  pipeFitter:    z.string().max(128).optional().nullable(),
  ndeRequired:   z.boolean().default(true),
  ndeType:       z.string().max(32).optional().nullable(),
  ndePercent:    z.number().int().min(0).max(100).optional().nullable(),
  status:        JointStatusEnum.default('PENDING'),
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
  remarks: noHtml.max(2048).optional(),
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
