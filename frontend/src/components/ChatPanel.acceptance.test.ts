import { describe, expect, it } from 'vitest'

import { buildActiveContextForSuggestionAcceptance } from './ChatPanel'
import type { ReservationThread } from '../contexts/ReservationContext'
import type { ReservationMessage } from '../services/reservationMessenger'

const baseThread: ReservationThread = {
  threadId: 'thread-123',
  restaurantId: 'restaurant-abc',
  restaurantName: 'Smoothies & Muffins',
  restaurantNpub: 'npub1',
  messages: [] as ReservationMessage[],
  request: {
    partySize: 3,
    isoTime: '2025-11-03T11:15:00-08:00',
  },
  status: 'suggested',
  suggestedTime: '2025-11-03T11:30:00-08:00',
  lastUpdated: 0,
}

function threadFactory(overrides: Partial<ReservationThread> = {}): ReservationThread {
  return {
    ...baseThread,
    ...overrides,
  }
}

describe('buildActiveContextForSuggestionAcceptance', () => {
  it('returns context when user accepts suggested time even if they repeat the time', () => {
    const context = buildActiveContextForSuggestionAcceptance(
      'Ok, lets go with 11.30am then',
      threadFactory(),
    )

    expect(context).toBeDefined()
    expect(context?.restaurant_id).toBe('restaurant-abc')
    expect(context?.suggested_time).toBe('2025-11-03T11:30:00-08:00')
  })

  it('ignores acceptance when message introduces a different time', () => {
    const context = buildActiveContextForSuggestionAcceptance(
      'Sure, 12pm works better for us',
      threadFactory(),
    )

    expect(context).toBeUndefined()
  })

  it('treats reservation keywords and party size as a new request', () => {
    const context = buildActiveContextForSuggestionAcceptance(
      'Ok please book a table for 2 at noon',
      threadFactory(),
    )

    expect(context).toBeUndefined()
  })

  it('allows acceptance phrasing that includes "for" without a number', () => {
    const context = buildActiveContextForSuggestionAcceptance(
      'That works for me, thanks!',
      threadFactory(),
    )

    expect(context).toBeDefined()
  })
})
