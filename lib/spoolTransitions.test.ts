import { describe, it, expect } from 'vitest'

import {
  canTransition,
  SPOOL_TRANSITIONS,
  JOINT_TRANSITIONS,
  spoolTransitionError
} from './spoolTransitions'


describe('SPOOL_TRANSITIONS', () => {

  it('FABRICATING to RECEIVED allowed', () => {
    expect(
      canTransition(
        SPOOL_TRANSITIONS,
        'FABRICATING',
        'RECEIVED'
      )
    ).toBe(true)
  })


  it('FABRICATING to COMPLETE not allowed', () => {
    expect(
      canTransition(
        SPOOL_TRANSITIONS,
        'FABRICATING',
        'COMPLETE'
      )
    ).toBe(false)
  })


  it('RECEIVED to IN_STORAGE allowed', () => {
    expect(
      canTransition(
        SPOOL_TRANSITIONS,
        'RECEIVED',
        'IN_STORAGE'
      )
    ).toBe(true)
  })


  it('WELDED to NDE_PENDING allowed', () => {
    expect(
      canTransition(
        SPOOL_TRANSITIONS,
        'WELDED',
        'NDE_PENDING'
      )
    ).toBe(true)
  })


  it('NDE_PENDING to REPAIR allowed', () => {
    expect(
      canTransition(
        SPOOL_TRANSITIONS,
        'NDE_PENDING',
        'REPAIR'
      )
    ).toBe(true)
  })


  it('PRESSURE_TESTED to COMPLETE allowed', () => {
    expect(
      canTransition(
        SPOOL_TRANSITIONS,
        'PRESSURE_TESTED',
        'COMPLETE'
      )
    ).toBe(true)
  })


  it('COMPLETE to FABRICATING not allowed', () => {
    expect(
      canTransition(
        SPOOL_TRANSITIONS,
        'COMPLETE',
        'FABRICATING'
      )
    ).toBe(false)
  })


  it('HOLD to FIT_UP allowed', () => {
    expect(
      canTransition(
        SPOOL_TRANSITIONS,
        'HOLD',
        'FIT_UP'
      )
    ).toBe(true)
  })


  it('COMPLETE should have no outgoing transitions', () => {
    expect(
      SPOOL_TRANSITIONS.COMPLETE.length
    ).toBe(0)
  })


  it('Error should show allowed next states', () => {

    const msg =
      spoolTransitionError(
        'WELDED',
        'COMPLETE'
      )

    expect(msg).toContain(
      'NDE_PENDING'
    )

  })

})



describe('JOINT_TRANSITIONS', () => {

  it('PENDING to FIT_UP allowed', () => {
    expect(
      canTransition(
        JOINT_TRANSITIONS,
        'PENDING',
        'FIT_UP'
      )
    ).toBe(true)
  })


  it('FIT_UP to WELDED allowed', () => {
    expect(
      canTransition(
        JOINT_TRANSITIONS,
        'FIT_UP',
        'WELDED'
      )
    ).toBe(true)
  })


  it('NDE_PENDING to REPAIR allowed', () => {
    expect(
      canTransition(
        JOINT_TRANSITIONS,
        'NDE_PENDING',
        'REPAIR'
      )
    ).toBe(true)
  })


  it('COMPLETE to PENDING not allowed', () => {
    expect(
      canTransition(
        JOINT_TRANSITIONS,
        'COMPLETE',
        'PENDING'
      )
    ).toBe(false)
  })


  it('HOLD to FIT_UP allowed', () => {
    expect(
      canTransition(
        JOINT_TRANSITIONS,
        'HOLD',
        'FIT_UP'
      )
    ).toBe(true)
  })

})