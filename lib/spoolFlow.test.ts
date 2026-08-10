import { describe, it, expect, vi, beforeEach } from 'vitest'
import { onFitUpInspectionPass } from './spoolFlow'

vi.mock('@/lib/services/database', () => ({
  prisma: {
    spoolJoint: {
      findUnique: vi.fn(),
      updateMany: vi.fn()
    },

    pipeSpool: {
      findUnique: vi.fn(),
      updateMany: vi.fn()
    },

    spoolAlert: {
      create: vi.fn()
    }
  }
}))

import { prisma } from '@/lib/services/database'

describe('spoolFlow', () => {

  beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.spoolJoint.updateMany as any).mockResolvedValue({ count: 1 })
    ;(prisma.pipeSpool.updateMany as any).mockResolvedValue({ count: 1 })
  })


  it('should move PENDING joint to FIT_UP', async () => {

    ;(prisma.spoolJoint.findUnique as any).mockResolvedValue({
      id: 'J1',
      status: 'PENDING',
      spoolId: 'S1'
    })

    ;(prisma.pipeSpool.findUnique as any).mockResolvedValue({
      id: 'S1',
      status: 'FABRICATING',
      joints: []
    })

    await onFitUpInspectionPass('J1')

    expect(
      prisma.spoolJoint.updateMany
    ).toHaveBeenCalledWith({

      where: { id: 'J1', status: 'PENDING' },

      data: {
        status: 'FIT_UP'
      }

    })

  })


  it('should not update if joint already WELDED', async () => {

    ;(prisma.spoolJoint.findUnique as any).mockResolvedValue({
      id: 'J1',
      status: 'WELDED',
      spoolId: 'S1'
    })

    await onFitUpInspectionPass('J1')

    expect(
      prisma.spoolJoint.updateMany
    ).not.toHaveBeenCalled()

  })


  it('should skip the transition if the joint status changed concurrently', async () => {

    ;(prisma.spoolJoint.findUnique as any).mockResolvedValue({
      id: 'J1',
      status: 'PENDING',
      spoolId: 'S1'
    })
    ;(prisma.spoolJoint.updateMany as any).mockResolvedValue({ count: 0 })

    await onFitUpInspectionPass('J1')

    // updateMany was attempted, but since count came back 0 (lost the race),
    // recalcSpoolStatus (which reads pipeSpool) must not have been reached.
    expect(prisma.spoolJoint.updateMany).toHaveBeenCalled()
    expect(prisma.pipeSpool.findUnique).not.toHaveBeenCalled()

  })

})
