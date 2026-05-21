// Simple logical connectivity graph used for demo cascade behavior.
// NOTE: This is intentionally deterministic so the UI behaves consistently.

export type MachineCode =
  | 'QC-GATE'
  | 'CNC-01'
  | 'CNC-02'
  | 'WLD-01'
  | 'ASSY-01';

// Undirected connectivity so either side can cascade.
export const MACHINE_GRAPH: Record<MachineCode, MachineCode[]> = {
  'QC-GATE': ['WLD-01', 'CNC-02', 'ASSY-01'],
  'CNC-01': ['CNC-02'],
  'CNC-02': ['CNC-01', 'WLD-01', 'QC-GATE'],
  'WLD-01': ['CNC-02', 'ASSY-01', 'QC-GATE'],
  'ASSY-01': ['WLD-01', 'QC-GATE'],
};

export function getConnectedChain(machineCode: MachineCode): MachineCode[] {
  // BFS to collect all nodes reachable from the provided one.
  const visited = new Set<MachineCode>();
  const q: MachineCode[] = [machineCode];

  while (q.length) {
    const cur = q.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const next = MACHINE_GRAPH[cur] ?? [];
    for (const n of next) {
      if (!visited.has(n)) q.push(n);
    }
  }

  return Array.from(visited);
}

