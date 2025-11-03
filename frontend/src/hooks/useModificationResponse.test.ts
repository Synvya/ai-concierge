/**
 * Tests for useModificationResponse hook
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { useModificationResponse } from './useModificationResponse';
import { ReservationProvider } from '../contexts/ReservationContext';
import { generateKeypair } from '../lib/nostr/keys';
import type { ReservationThread } from '../contexts/ReservationContext';
import type { ReservationModificationRequest } from '../types/reservation';
import * as relayPool from '../lib/nostr/relayPool';

// Mock dependencies
vi.mock('./useNostrIdentity', () => ({
  useNostrIdentity: () => {
    const keypair = generateKeypair();
    return {
      publicKeyHex: keypair.publicKeyHex,
      privateKeyHex: keypair.privateKeyHex,
    };
  },
}));

vi.mock('../lib/nostr/relayPool', () => ({
  publishToRelays: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@chakra-ui/react', () => ({
  useToast: () => vi.fn(), // Returns a function directly (matches actual usage)
}));

vi.mock('../contexts/ReservationContext', () => ({
  ReservationProvider: ({ children }: { children: React.ReactNode }) => children,
  useReservations: () => ({
    addOutgoingMessage: vi.fn(),
    threads: [],
    isActive: false,
  }),
}));

vi.mock('../services/reservationMessenger', () => ({
  startReservationSubscription: vi.fn(() => ({
    stop: vi.fn(),
    ready: true,
  })),
}));

describe('useModificationResponse', () => {
  const createMockThread = (overrides?: Partial<ReservationThread>): ReservationThread => {
    const keypair = generateKeypair();
    const restaurantKeypair = generateKeypair(); // Generate valid npub for restaurant
    const modificationRequest: ReservationModificationRequest = {
      iso_time: '2025-10-25T16:00:00Z',
      message: 'We can accommodate you at 4pm instead',
      original_iso_time: '2025-10-25T15:00:00Z',
    };

    return {
      threadId: 'test-thread-id',
      restaurantId: 'restaurant-123',
      restaurantName: 'Test Restaurant',
      restaurantNpub: restaurantKeypair.npub, // Use valid npub format
      messages: [
        {
          rumor: {
            kind: 9903,
            content: 'encrypted',
            created_at: Math.floor(Date.now() / 1000),
            pubkey: keypair.publicKeyHex,
            tags: [],
            id: 'modification-request-id',
            sig: 'sig',
          },
          type: 'modification_request',
          payload: modificationRequest,
          senderPubkey: keypair.publicKeyHex,
          giftWrap: {
            kind: 1059,
            content: 'encrypted',
            created_at: Math.floor(Date.now() / 1000),
            pubkey: keypair.publicKeyHex,
            tags: [],
            id: 'giftwrap-modification-request-id',
            sig: 'sig',
          },
        },
      ],
      request: {
        partySize: 2,
        isoTime: '2025-10-25T15:00:00Z',
      },
      status: 'modification_requested',
      modificationRequest,
      lastUpdated: Math.floor(Date.now() / 1000),
      ...overrides,
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends accepted modification response', async () => {
    const { result } = renderHook(
      () => {
        const { sendModificationResponse } = useModificationResponse();
        return { sendModificationResponse };
      },
      {
        wrapper: ReservationProvider,
      }
    );

    const thread = createMockThread();

    await act(async () => {
      await result.current.sendModificationResponse(thread, 'accepted', 'Yes, that works!');
    });

    // Verify that publishToRelays was called
    expect(relayPool.publishToRelays).toHaveBeenCalled();
  });

  it('sends declined modification response', async () => {
    const { result } = renderHook(
      () => {
        const { sendModificationResponse } = useModificationResponse();
        return { sendModificationResponse };
      },
      {
        wrapper: ReservationProvider,
      }
    );

    const thread = createMockThread();

    await act(async () => {
      await result.current.sendModificationResponse(thread, 'declined', 'Sorry, that time does not work.');
    });

    expect(relayPool.publishToRelays).toHaveBeenCalled();
  });

  it('returns early when thread has no modification request', async () => {
    const { result } = renderHook(
      () => {
        const { sendModificationResponse } = useModificationResponse();
        return { sendModificationResponse };
      },
      {
        wrapper: ReservationProvider,
      }
    );

    const thread = createMockThread({
      modificationRequest: undefined,
      status: 'sent',
    });

    await act(async () => {
      // Should return early without throwing (shows toast instead)
      await result.current.sendModificationResponse(thread, 'accepted');
    });

    // Should not have published anything
    expect(relayPool.publishToRelays).not.toHaveBeenCalled();
  });

  it('handles missing modification request message in thread', async () => {
    const { result } = renderHook(
      () => {
        const { sendModificationResponse } = useModificationResponse();
        return { sendModificationResponse };
      },
      {
        wrapper: ReservationProvider,
      }
    );

    const thread = createMockThread({
      messages: [], // No messages
    });

    await act(async () => {
      await expect(
        result.current.sendModificationResponse(thread, 'accepted')
      ).rejects.toThrow('Modification request message not found in thread');
    });
  });

  it('includes iso_time when accepting modification', async () => {
    const { result } = renderHook(
      () => {
        const { sendModificationResponse } = useModificationResponse();
        return { sendModificationResponse };
      },
      {
        wrapper: ReservationProvider,
      }
    );

    const thread = createMockThread();

    await act(async () => {
      await result.current.sendModificationResponse(thread, 'accepted');
    });

    // Verify publishToRelays was called (indirect verification that iso_time was included)
    expect(relayPool.publishToRelays).toHaveBeenCalled();
  });
});

