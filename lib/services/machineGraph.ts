import { prisma } from '@/lib/services/database';

export async function buildMachineGraph(): Promise<Record<string, string[]>> {
  const machines = await prisma.machine.findMany({
    select: { id: true, code: true, productionLineId: true },
  });

  const graph: Record<string, string[]> = {};

  const lineGroups = new Map<string, string[]>();
  for (const m of machines) {
    graph[m.code] = [];
    if (m.productionLineId) {
      const group = lineGroups.get(m.productionLineId) ?? [];
      group.push(m.code);
      lineGroups.set(m.productionLineId, group);
    }
  }

  for (const [, codes] of lineGroups) {
    for (let i = 0; i < codes.length; i++) {
      for (let j = i + 1; j < codes.length; j++) {
        graph[codes[i]] = graph[codes[i]] ?? [];
        graph[codes[j]] = graph[codes[j]] ?? [];
        if (!graph[codes[i]].includes(codes[j])) graph[codes[i]].push(codes[j]);
        if (!graph[codes[j]].includes(codes[i])) graph[codes[j]].push(codes[i]);
      }
    }
  }

  return graph;
}

export async function getConnectedChain(machineCode: string): Promise<string[]> {
  const graph = await buildMachineGraph();

  const visited = new Set<string>();
  const q: string[] = [machineCode];

  while (q.length) {
    const cur = q.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const next = graph[cur] ?? [];
    for (const n of next) {
      if (!visited.has(n)) q.push(n);
    }
  }

  return Array.from(visited);
}
