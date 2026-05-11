export type Permission =
  | 'work_order:create'
  | 'work_order:release'
  | 'work_order:cancel'
  | 'production:start_step'
  | 'production:complete_step'
  | 'production:pause'
  | 'qc:submit'
  | 'qc:approve'
  | 'qc:reject'
  | 'planning:create_schedule'
  | 'planning:modify_schedule'
  | 'reports:view'
  | 'reports:export'
  | 'admin:manage_users'
  | 'admin:manage_roles'
  | 'admin:system_settings'
  | 'admin:view_all_audit_logs';

export type Role =
  | 'ADMIN'
  | 'SUPERVISOR'
  | 'PLANNER'
  | 'OPERATOR'
  | 'QC'
  | 'QUALITY'
  | 'MAINTENANCE';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: [
    'work_order:create',
    'work_order:release',
    'work_order:cancel',
    'production:start_step',
    'production:complete_step',
    'production:pause',
    'qc:submit',
    'qc:approve',
    'qc:reject',
    'planning:create_schedule',
    'planning:modify_schedule',
    'reports:view',
    'reports:export',
    'admin:manage_users',
    'admin:manage_roles',
    'admin:system_settings',
    'admin:view_all_audit_logs',
  ],
  SUPERVISOR: [
    'work_order:create',
    'work_order:release',
    'work_order:cancel',
    'production:start_step',
    'production:complete_step',
    'production:pause',
    'qc:submit',
    'qc:approve',
    'qc:reject',
    'planning:create_schedule',
    'planning:modify_schedule',
    'reports:view',
    'reports:export',
  ],
  PLANNER: [
    'work_order:create',
    'work_order:release',
    'planning:create_schedule',
    'planning:modify_schedule',
    'reports:view',
    'reports:export',
  ],
  OPERATOR: [
    'work_order:create',
    'production:start_step',
    'production:complete_step',
    'production:pause',
    'qc:submit',
    'reports:view',
  ],
  QC: [
    'qc:submit',
    'qc:approve',
    'qc:reject',
    'reports:view',
  ],
  QUALITY: [
    'qc:submit',
    'qc:approve',
    'qc:reject',
    'reports:view',
  ],
  MAINTENANCE: [
    'reports:view',
  ],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

export function requirePermission(role: Role | string, permission: Permission): boolean {
  return typeof role === 'string' ? hasPermission(role as Role, permission) : false;
}

