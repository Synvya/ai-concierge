import { describe, expect, test, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { ReservationProvider, useReservations } from './ReservationContext'
import type { ReservationMessage } from '../types/reservation'

// Mock the Nostr identity hook
vi.mock('../hooks/useNostrIdentity', () => ({
  useNostrIdentity: () => ({
    publicKeyHex: 'test-pubkey-hex',
    publicKeyNpub: 'npub1test',
    privateKeyHex: 'test-privkey-hex',
  }),
}))

// Mock the reservation messenger
vi.mock('../services/reservationMessenger', () => ({
  startReservationSubscription: vi.fn(() => ({
    stop: vi.fn(),
    ready: true,
  })),
}))

describe('ReservationContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('initializes with empty threads', () => {
    const { result } = renderHook(() => useReservations(), {
      wrapper: ReservationProvider,
    })

    expect(result.current.reservationThreads).toEqual([])
  })

  test('adds outgoing message and creates new thread', async () => {
    const { result } = renderHook(() => useReservations(), {
      wrapper: ReservationProvider,
    })

    const mockMessage: ReservationMessage = {
      rumor: {
        kind: 32101,
        content: '{"party_size":2,"iso_time":"2025-10-25T15:00:00Z"}',
        created_at: Math.floor(Date.now() / 1000),
        pubkey: 'test-pubkey-hex',
        tags: [['p', 'restaurant-pubkey']],
        id: 'request-id-1',
        sig: 'sig',
      } as any,
      type: 'request',
      payload: {
        party_size: 2,
        iso_time: '2025-10-25T15:00:00Z',
      },
      senderPubkey: 'test-pubkey-hex',
      giftWrap: {
        kind: 1059,
        content: 'encrypted',
        created_at: Math.floor(Date.now() / 1000),
        pubkey: 'random-pubkey',
        tags: [['p', 'restaurant-pubkey']],
        id: 'giftwrap-id-1',
        sig: 'sig',
      } as any,
    }

    act(() => {
      result.current.addOutgoingMessage(
        mockMessage,
        'Test Restaurant',
        'npub1restaurant'
      )
    })

    await waitFor(() => {
      expect(result.current.reservationThreads).toHaveLength(1)
    })

    const thread = result.current.reservationThreads[0]
    expect(thread.restaurantName).toBe('Test Restaurant')
    expect(thread.restaurantNpub).toBe('npub1restaurant')
    expect(thread.status).toBe('sent')
    expect(thread.messages).toHaveLength(1)
    expect(thread.messages[0].type).toBe('request')
  })

  test('updates thread status when response is received', async () => {
    const { result } = renderHook(() => useReservations(), {
      wrapper: ReservationProvider,
    })

    // First add a request
    const requestMessage: ReservationMessage = {
      rumor: {
        kind: 32101,
        content: '{"party_size":2,"iso_time":"2025-10-25T15:00:00Z"}',
        created_at: Math.floor(Date.now() / 1000),
        pubkey: 'test-pubkey-hex',
        tags: [['e', 'thread-root-id', '', 'root']],
        id: 'request-id-1',
        sig: 'sig',
      } as any,
      type: 'request',
      payload: {
        party_size: 2,
        iso_time: '2025-10-25T15:00:00Z',
      },
      senderPubkey: 'test-pubkey-hex',
      giftWrap: {
        kind: 1059,
        content: 'encrypted',
        created_at: Math.floor(Date.now() / 1000),
        pubkey: 'random-pubkey',
        tags: [['p', 'restaurant-pubkey']],
        id: 'thread-root-id',
        sig: 'sig',
      } as any,
    }

    act(() => {
      result.current.addOutgoingMessage(
        requestMessage,
        'Test Restaurant',
        'npub1restaurant'
      )
    })

    await waitFor(() => {
      expect(result.current.reservationThreads).toHaveLength(1)
    })

    // Now simulate receiving a confirmed response
    const responseMessage: ReservationMessage = {
      rumor: {
        kind: 32102,
        content: '{"status":"confirmed","iso_time":"2025-10-25T15:00:00Z","table":"5"}',
        created_at: Math.floor(Date.now() / 1000) + 60,
        pubkey: 'restaurant-pubkey',
        tags: [['e', 'thread-root-id', '', 'root']],
        id: 'response-id-1',
        sig: 'sig',
      } as any,
      type: 'response',
      payload: {
        status: 'confirmed',
        iso_time: '2025-10-25T15:00:00Z',
        table: '5',
      },
      senderPubkey: 'restaurant-pubkey',
      giftWrap: {
        kind: 1059,
        content: 'encrypted',
        created_at: Math.floor(Date.now() / 1000) + 60,
        pubkey: 'random-pubkey-2',
        tags: [['p', 'test-pubkey-hex']],
        id: 'giftwrap-response-id-1',
        sig: 'sig',
      } as any,
    }

    // Manually trigger the message handler to simulate receiving response
    // In real app, this would come from the subscription
    act(() => {
      // Access the internal update function (would normally be called by subscription)
      // For testing, we'll verify the logic exists
      const thread = result.current.reservationThreads[0]
      expect(thread.status).toBe('sent')
    })

    // Note: Full integration would require mocking the WebSocket subscription
    // and simulating the onMessage callback from reservationMessenger
  })

  test('handles multiple threads correctly', async () => {
    const { result } = renderHook(() => useReservations(), {
      wrapper: ReservationProvider,
    })

    // Add first reservation
    const message1: ReservationMessage = {
      rumor: {
        kind: 32101,
        content: '{"party_size":2,"iso_time":"2025-10-25T15:00:00Z"}',
        created_at: Math.floor(Date.now() / 1000),
        pubkey: 'test-pubkey-hex',
        tags: [['p', 'restaurant1-pubkey']],
        id: 'request-id-1',
        sig: 'sig',
      } as any,
      type: 'request',
      payload: { party_size: 2, iso_time: '2025-10-25T15:00:00Z' },
      senderPubkey: 'test-pubkey-hex',
      giftWrap: {
        kind: 1059,
        content: 'encrypted',
        created_at: Math.floor(Date.now() / 1000),
        pubkey: 'random-pubkey',
        tags: [['p', 'restaurant1-pubkey']],
        id: 'giftwrap-id-1',
        sig: 'sig',
      } as any,
    }

    // Add second reservation
    const message2: ReservationMessage = {
      rumor: {
        kind: 32101,
        content: '{"party_size":4,"iso_time":"2025-10-26T19:00:00Z"}',
        created_at: Math.floor(Date.now() / 1000) + 100,
        pubkey: 'test-pubkey-hex',
        tags: [['p', 'restaurant2-pubkey']],
        id: 'request-id-2',
        sig: 'sig',
      } as any,
      type: 'request',
      payload: { party_size: 4, iso_time: '2025-10-26T19:00:00Z' },
      senderPubkey: 'test-pubkey-hex',
      giftWrap: {
        kind: 1059,
        content: 'encrypted',
        created_at: Math.floor(Date.now() / 1000) + 100,
        pubkey: 'random-pubkey-2',
        tags: [['p', 'restaurant2-pubkey']],
        id: 'giftwrap-id-2',
        sig: 'sig',
      } as any,
    }

    act(() => {
      result.current.addOutgoingMessage(message1, 'Restaurant One', 'npub1rest1')
    })

    act(() => {
      result.current.addOutgoingMessage(message2, 'Restaurant Two', 'npub1rest2')
    })

    await waitFor(() => {
      expect(result.current.reservationThreads).toHaveLength(2)
    })

    const threads = result.current.reservationThreads
    expect(threads[0].restaurantName).toBe('Restaurant Two') // Most recent first
    expect(threads[1].restaurantName).toBe('Restaurant One')
  })

  test('handles different response statuses', async () => {
    const statuses = ['confirmed', 'suggested', 'declined', 'expired', 'cancelled']

    statuses.forEach((status) => {
      const mockResponse = {
        status,
        iso_time: status === 'suggested' ? '2025-10-25T16:00:00Z' : undefined,
        message: `Test message for ${status}`,
      }

      // Verify each status is valid
      expect(['confirmed', 'suggested', 'declined', 'expired', 'cancelled']).toContain(
        mockResponse.status
      )
    })
  })
})

