import { describe, expect, it } from 'vitest'

import { buildActiveReservationContext, resolveRestaurantForReservationAction } from './ChatPanel'
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

describe('buildActiveReservationContext', () => {
  it('returns context when there is an active modification request', () => {
    const context = buildActiveReservationContext(threadFactory())

    expect(context).toBeDefined()
    expect(context?.restaurant_id).toBe('restaurant-abc')
    expect(context?.restaurant_name).toBe('Smoothies & Muffins')
    expect(context?.npub).toBe('npub1')
    expect(context?.party_size).toBe(3)
    expect(context?.original_time).toBe('2025-11-03T11:15:00-08:00')
    expect(context?.suggested_time).toBe('2025-11-03T11:30:00-08:00')
    expect(context?.thread_id).toBe('thread-123')
  })

  it('returns undefined when thread status is not modification_requested', () => {
    const context = buildActiveReservationContext(threadFactory({ status: 'confirmed' }))

    expect(context).toBeUndefined()
  })

  it('returns undefined when thread has no modificationRequest', () => {
    const context = buildActiveReservationContext(
      threadFactory({ modificationRequest: undefined })
    )

    expect(context).toBeUndefined()
  })

  it('returns undefined when restaurantId is unknown', () => {
    const context = buildActiveReservationContext(threadFactory({ restaurantId: 'unknown' }))

    expect(context).toBeUndefined()
  })

  it('returns undefined when thread is undefined', () => {
    const context = buildActiveReservationContext(undefined)

    expect(context).toBeUndefined()
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
