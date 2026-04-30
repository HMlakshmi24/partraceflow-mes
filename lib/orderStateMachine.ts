/**
 * Order State Machine
 *
 * Enforces valid transitions and provides UI helpers.
 * PLANNED → RELEASED → IN_PROGRESS → QC_PENDING → APPROVED → COMPLETED
 *                                  ↘ REWORK ↗
 * Any non-terminal → ON_HOLD → resumes previous state
 * Any non-terminal → CANCELLED
 */

export const VALID_TRANSITIONS: Record<string, string[]> = {
    PLANNED:     ['RELEASED', 'CANCELLED'],
    RELEASED:    ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
    IN_PROGRESS: ['QC_PENDING', 'ON_HOLD', 'CANCELLED'],
    QC_PENDING:  ['APPROVED', 'REWORK', 'CANCELLED'],
    APPROVED:    ['COMPLETED'],
    REWORK:      ['IN_PROGRESS', 'CANCELLED'],
    ON_HOLD:     ['RELEASED', 'IN_PROGRESS', 'CANCELLED'],
    COMPLETED:   [],
    CANCELLED:   [],
};

export const STATUS_LABELS: Record<string, string> = {
    PLANNED:     'Planned',
    RELEASED:    'Released',
    IN_PROGRESS: 'In Progress',
    QC_PENDING:  'QC Pending',
    APPROVED:    'Approved',
    REWORK:      'Rework',
    ON_HOLD:     'On Hold',
    COMPLETED:   'Completed',
    CANCELLED:   'Cancelled',
};

export const STATUS_COLORS: Record<string, string> = {
    PLANNED:     '#64748b',
    RELEASED:    '#3b82f6',
    IN_PROGRESS: '#f59e0b',
    QC_PENDING:  '#a855f7',
    APPROVED:    '#06b6d4',
    REWORK:      '#f97316',
    ON_HOLD:     '#8b5cf6',
    COMPLETED:   '#10b981',
    CANCELLED:   '#ef4444',
};

// Action button config per valid next status
export const ACTION_BUTTONS: Record<string, { label: string; color: string; icon: string }> = {
    RELEASED:    { label: 'Release to Floor',   color: '#3b82f6', icon: 'send'        },
    IN_PROGRESS: { label: 'Start Production',   color: '#f59e0b', icon: 'play'        },
    QC_PENDING:  { label: 'Send to QC',         color: '#a855f7', icon: 'microscope'  },
    APPROVED:    { label: 'Approve',            color: '#06b6d4', icon: 'check'       },
    REWORK:      { label: 'Send to Rework',     color: '#f97316', icon: 'refresh'     },
    COMPLETED:   { label: 'Mark Completed',     color: '#10b981', icon: 'check-circle'},
    ON_HOLD:     { label: 'Put On Hold',        color: '#8b5cf6', icon: 'pause'       },
    CANCELLED:   { label: 'Cancel Order',       color: '#ef4444', icon: 'x'           },
};

export function canTransition(from: string, to: string): boolean {
    return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

export function getTransitionError(from: string, to: string): string {
    const fromLabel = STATUS_LABELS[from] ?? from;
    const toLabel   = STATUS_LABELS[to]   ?? to;
    const allowed   = VALID_TRANSITIONS[from] ?? [];

    if (allowed.length === 0) {
        return `Order is "${fromLabel}" — no further changes allowed.`;
    }
    const nextSteps = allowed.map(s => STATUS_LABELS[s] ?? s).join(', ');
    return `Cannot move from "${fromLabel}" to "${toLabel}". Valid next steps: ${nextSteps}.`;
}

export function getNextActions(status: string): string[] {
    return VALID_TRANSITIONS[status] ?? [];
}

export function isTerminal(status: string): boolean {
    return status === 'COMPLETED' || status === 'CANCELLED';
}
