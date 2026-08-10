import { describe, it, expect, vi, beforeEach } from 'vitest';

const createManyMock = vi.fn();
const findManyMock = vi.fn();

vi.mock('@/lib/services/database', () => ({
  prisma: {
    historianRecord: {
      createMany: createManyMock,
      findMany: findManyMock,
      create: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('Historian scale behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('batches 100k records through createMany path', async () => {
    createManyMock.mockResolvedValue({ count: 100000 });
    const { HistorianService } = await import('@/lib/services/HistorianService');
    const records = Array.from({ length: 100000 }, (_, i) => ({
      machineId: 'm1',
      signalType: 'TEMP',
      tagName: `T-${i}`,
      value: i,
      source: 'SYSTEM' as const,
      timestamp: new Date(1_700_000_000_000 + i),
    }));
    await HistorianService.recordBatch(records);
    expect(createManyMock).toHaveBeenCalledTimes(1);
    expect(createManyMock.mock.calls[0][0].data).toHaveLength(100000);
  });

  it('aggregates 100k+ points in bounded windows', async () => {
    const now = Date.now();
    findManyMock.mockResolvedValue(
      Array.from({ length: 100000 }, (_, i) => ({
        timestamp: new Date(now + i * 1000),
        value: String((i % 100) + 1),
      })),
    );
    const { HistorianService } = await import('@/lib/services/HistorianService');
    const agg = await HistorianService.aggregate(
      { machineId: 'm1', from: new Date(now), to: new Date(now + 100000 * 1000) },
      60_000,
    );
    expect(agg.length).toBeGreaterThan(1000);
    expect(agg[0].count).toBeGreaterThan(0);
  });
});

