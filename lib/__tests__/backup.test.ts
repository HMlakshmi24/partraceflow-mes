import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

const enterpriseFindManyMock = vi.fn();
const plantFindManyMock = vi.fn();
const areaFindManyMock = vi.fn();
const lineFindManyMock = vi.fn();
const machineFindManyMock = vi.fn();
const shiftFindManyMock = vi.fn();
const userFindManyMock = vi.fn();

vi.mock('@/lib/services/database', () => ({
  prisma: {
    enterprise: { findMany: enterpriseFindManyMock },
    plant: { findMany: plantFindManyMock },
    productionArea: { findMany: areaFindManyMock },
    productionLine: { findMany: lineFindManyMock },
    machine: { findMany: machineFindManyMock },
    shift: { findMany: shiftFindManyMock },
    user: { findMany: userFindManyMock },
  },
}));

describe('BackupService', () => {
  const backupDir = path.join(process.cwd(), 'backups');

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('MES_BACKUP_MODE', 'demo');
    enterpriseFindManyMock.mockResolvedValue([{ id: 'e1' }]);
    plantFindManyMock.mockResolvedValue([{ id: 'p1' }]);
    areaFindManyMock.mockResolvedValue([{ id: 'a1' }]);
    lineFindManyMock.mockResolvedValue([{ id: 'l1' }]);
    machineFindManyMock.mockResolvedValue([{ id: 'm1' }]);
    shiftFindManyMock.mockResolvedValue([{ id: 's1' }]);
    userFindManyMock.mockResolvedValue([{ id: 'u1', username: 'admin', role: 'ADMIN' }]);
    await fs.mkdir(backupDir, { recursive: true });
    const files = await fs.readdir(backupDir);
    await Promise.all(files.map(f => fs.unlink(path.join(backupDir, f))));
  });

  afterEach(async () => {
    const files = await fs.readdir(backupDir).catch(() => []);
    await Promise.all(files.map(f => fs.unlink(path.join(backupDir, f))));
    vi.unstubAllEnvs();
  });

  it('creates a demo backup snapshot', async () => {
    const { BackupService } = await import('@/lib/services/BackupService');
    const backup = await BackupService.createBackup();
    expect(backup.mode).toBe('demo');
    expect(backup.filePath).toBeDefined();
    const exists = await fs.access(backup.filePath as string).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('lists available backups', async () => {
    const { BackupService } = await import('@/lib/services/BackupService');
    await BackupService.createBackup();
    const backups = await BackupService.listBackups();
    expect(backups.length).toBeGreaterThan(0);
  });

  it('restores from a demo backup snapshot', async () => {
    const { BackupService } = await import('@/lib/services/BackupService');
    const backup = await BackupService.createBackup();
    const restored = await BackupService.restoreBackup(backup.id);
    expect(restored.restored).toBe(true);
    expect(restored.mode).toBe('demo');
  });

  it('returns production hook metadata when not in demo mode', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MES_BACKUP_MODE', '');
    const { BackupService } = await import('@/lib/services/BackupService');
    const backup = await BackupService.createBackup();
    expect(backup.mode).toBe('production');
    expect(backup.hook).toBe('DATABASE_DUMP_HOOK_REQUIRED');
  });

  it('returns no backups in production mode', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MES_BACKUP_MODE', '');
    const { BackupService } = await import('@/lib/services/BackupService');
    const backups = await BackupService.listBackups();
    expect(backups).toEqual([]);
  });

  it('returns production restore hook in production mode', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MES_BACKUP_MODE', '');
    const { BackupService } = await import('@/lib/services/BackupService');
    const result = await BackupService.restoreBackup('backup-1');
    expect(result).toEqual({
      restored: false,
      mode: 'production',
      details: 'RESTORE_HOOK_REQUIRED',
    });
  });

  it('creates backup file content with expected tables metadata', async () => {
    const { BackupService } = await import('@/lib/services/BackupService');
    const backup = await BackupService.createBackup();
    const content = await fs.readFile(backup.filePath as string, 'utf-8');
    const parsed = JSON.parse(content) as { tables: string[] };
    expect(parsed.tables).toEqual([
      'enterprise',
      'plant',
      'productionArea',
      'productionLine',
      'machine',
      'shift',
      'user',
    ]);
  });

  it('creates unique backup ids across calls', async () => {
    const { BackupService } = await import('@/lib/services/BackupService');
    const b1 = await BackupService.createBackup();
    const b2 = await BackupService.createBackup();
    expect(b1.id).not.toBe(b2.id);
  });

  it('listBackups returns entries sorted with newest first by filename', async () => {
    const { BackupService } = await import('@/lib/services/BackupService');
    await BackupService.createBackup();
    await new Promise(r => setTimeout(r, 2));
    await BackupService.createBackup();
    const backups = await BackupService.listBackups();
    expect(backups.length).toBeGreaterThanOrEqual(2);
    expect(backups[0].id >= backups[1].id).toBe(true);
  });

  it('restoreBackup reads back exact backup id from snapshot', async () => {
    const { BackupService } = await import('@/lib/services/BackupService');
    const backup = await BackupService.createBackup();
    const restored = await BackupService.restoreBackup(backup.id);
    expect(restored.details).toContain(backup.id);
  });
});
