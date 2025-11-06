import { describe, expect, it } from 'vitest'

import { buildActiveContextForModificationAcceptance, resolveRestaurantForReservationAction } from './ChatPanel'
import type { ReservationThread } from '../contexts/ReservationContext'
import type { ReservationMessage } from '../services/reservationMessenger'
import type { ReservationAction, SellerResult } from '../lib/api'

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
  status: 'modification_requested',
  modificationRequest: {
    party_size: 3,
    iso_time: '2025-11-03T11:30:00-08:00',
    notes: 'We can accommodate you at 11:30am instead',
  },
  lastUpdated: 0,
}

function threadFactory(overrides: Partial<ReservationThread> = {}): ReservationThread {
  return {
    ...baseThread,
    ...overrides,
  }
}

describe('buildActiveContextForModificationAcceptance', () => {
  it('returns context when user accepts suggested time even if they repeat the time', () => {
    const context = buildActiveContextForModificationAcceptance(
      'Ok, lets go with 11.30am then',
      threadFactory(),
    )

    expect(context).toBeDefined()
    expect(context?.restaurant_id).toBe('restaurant-abc')
    expect(context?.suggested_time).toBe('2025-11-03T11:30:00-08:00')
  })

  it('ignores acceptance when message introduces a different time', () => {
    const context = buildActiveContextForModificationAcceptance(
      'Sure, 12pm works better for us',
      threadFactory(),
    )

    expect(context).toBeUndefined()
  })

  it('treats reservation keywords and party size as a new request', () => {
    const context = buildActiveContextForModificationAcceptance(
      'Ok please book a table for 2 at noon',
      threadFactory(),
    )

    expect(context).toBeUndefined()
  })

  it('allows acceptance phrasing that includes "for" without a number', () => {
    const context = buildActiveContextForModificationAcceptance(
      'That works for me, thanks!',
      threadFactory(),
    )

    expect(context).toBeDefined()
  })
})

describe('resolveRestaurantForReservationAction', () => {
  const action: ReservationAction = {
    action: 'send_reservation_request',
    restaurant_id: 'restaurant-abc',
    restaurant_name: 'Smoothies & Muffins',
    npub: 'npub1',
    party_size: 3,
    iso_time: '2025-11-03T11:30:00-08:00',
    thread_id: 'thread-123',
  }

  it('prefers matching search result when available', () => {
    const results: SellerResult[] = [
      {
        id: 'restaurant-abc',
        name: 'Smoothies & Muffins',
        npub: 'npub1',
        supports_reservations: true,
        score: 0.5,
      },
    ]

    const resolved = resolveRestaurantForReservationAction(action, results, [threadFactory()])
    expect(resolved).toBe(results[0])
  })

  it('falls back to reservation thread when search results are missing', () => {
    const resolved = resolveRestaurantForReservationAction(action, [], [threadFactory()])
    expect(resolved).toMatchObject({
      id: 'restaurant-abc',
      name: 'Smoothies & Muffins',
      npub: 'npub1',
      supports_reservations: true,
    })
  })

  it('returns undefined when neither results nor threads match', () => {
    const resolved = resolveRestaurantForReservationAction(action, [], [])
    expect(resolved).toBeUndefined()
  })
})
