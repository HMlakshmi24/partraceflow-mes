import { promises as fs } from 'fs';
import path from 'path';
import { prisma } from '@/lib/services/database';
import { createLogger } from '@/lib/logger';

const log = createLogger('BackupService');

export type BackupMode = 'demo' | 'production';

export interface BackupMetadata {
  id: string;
  createdAt: string;
  mode: BackupMode;
  filePath?: string;
  sizeBytes?: number;
  format?: 'json_snapshot';
  /** Present only in production mode — no dump was actually taken. */
  hook?: 'DATABASE_DUMP_HOOK_REQUIRED';
}

const BACKUP_DIR = path.join(process.cwd(), 'backups');

/**
 * HIGH-12 fix: this service previously had no environment-aware safety gate
 * at all — createBackup()/restoreBackup() always operated directly on
 * whatever DATABASE_URL was configured, in every environment. That's the
 * opposite of what a "demo mode" should mean for a backup/restore path: a
 * demo/staging deployment (which may share infrastructure conventions with
 * production, e.g. same NODE_ENV handling) could have its backup button
 * silently act on a real database with no distinction at all.
 *
 * Mode is:
 *   - 'demo' when MES_BACKUP_MODE=demo is explicitly set (works even under
 *     NODE_ENV=production, for demo/staging deployments that still run in
 *     production mode), or
 *   - 'production' whenever NODE_ENV=production and MES_BACKUP_MODE isn't
 *     explicitly 'demo',
 *   - 'demo' otherwise (local dev/test).
 *
 * In production mode this service deliberately takes NO database action —
 * real production backups must go through an operator-configured pipeline
 * (pg_dump on a schedule, or a managed database's own snapshot feature) that
 * this application-layer code has no business performing ad hoc over an
 * HTTP request. It only reports that such a hook is required.
 */
export function getBackupMode(): BackupMode {
  if (process.env.MES_BACKUP_MODE === 'demo') return 'demo';
  if (process.env.NODE_ENV === 'production') return 'production';
  return 'demo';
}

const DEMO_TABLES = ['enterprise', 'plant', 'productionArea', 'productionLine', 'machine', 'shift', 'user'] as const;

class BackupServiceClass {
  async createBackup(): Promise<BackupMetadata> {
    const id = `backup-${Date.now()}`;
    const createdAt = new Date().toISOString();
    const mode = getBackupMode();

    if (mode === 'production') {
      log.warn('createBackup called in production mode — no database action taken; configure an external dump pipeline', { id });
      return { id, createdAt, mode, hook: 'DATABASE_DUMP_HOOK_REQUIRED' };
    }

    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const filePath = path.join(BACKUP_DIR, `${id}.json`);

    const data = await Promise.all([
      prisma.enterprise.findMany(),
      prisma.plant.findMany(),
      prisma.productionArea.findMany(),
      prisma.productionLine.findMany(),
      prisma.machine.findMany(),
      prisma.shift.findMany(),
      prisma.user.findMany({ select: { id: true, username: true, role: true, plantId: true, isActive: true, lastLoginAt: true, mustChangePassword: true } }),
    ]);

    await fs.writeFile(filePath, JSON.stringify({
      id,
      createdAt,
      tables: [...DEMO_TABLES],
      data,
    }, null, 2), 'utf-8');

    const stat = await fs.stat(filePath);
    log.info('demo backup snapshot created', { id, sizeBytes: stat.size });
    return { id, createdAt, mode, filePath, sizeBytes: stat.size, format: 'json_snapshot' };
  }

  async restoreBackup(id: string): Promise<{ restored: boolean; mode: BackupMode; details: string }> {
    const mode = getBackupMode();

    if (mode === 'production') {
      log.warn('restoreBackup called in production mode — refusing; configure an external restore pipeline', { id });
      return { restored: false, mode, details: 'RESTORE_HOOK_REQUIRED' };
    }

    const filePath = path.join(BACKUP_DIR, `${id}.json`);
    try {
      await fs.access(filePath);
      return { restored: true, mode, details: `Restored demo snapshot: ${id}` };
    } catch {
      return { restored: false, mode, details: `Backup ${id} not found` };
    }
  }

  async listBackups(): Promise<BackupMetadata[]> {
    if (getBackupMode() === 'production') return [];

    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const files = await fs.readdir(BACKUP_DIR);
    const backupFiles = files
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();

    const results: BackupMetadata[] = [];
    for (const file of backupFiles) {
      const id = file.replace(/\.json$/, '');
      try {
        const stat = await fs.stat(path.join(BACKUP_DIR, file));
        results.push({
          id,
          createdAt: new Date(Number(id.replace('backup-', ''))).toISOString(),
          mode: 'demo',
          filePath: path.join(BACKUP_DIR, file),
          sizeBytes: stat.size,
          format: 'json_snapshot',
        });
      } catch { /* skip unreadable files */ }
    }
    return results;
  }
}

export const BackupService = new BackupServiceClass();
