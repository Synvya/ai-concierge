/**
 * Reservation Context
 * 
 * Manages reservation threads state and real-time updates from ReservationMessenger.
 * Groups messages by thread ID and tracks conversation status.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useNostrIdentity } from '../hooks/useNostrIdentity';
import {
  startReservationSubscription,
  type ReservationMessage,
  type ReservationSubscription,
} from '../services/reservationMessenger';
import { getThreadContext, type ThreadContext } from '../lib/nostr/nip10';
import type { ReservationRequest, ReservationResponse, ReservationModificationRequest, ReservationModificationResponse } from '../types/reservation';

/**
 * Determine whether we should start the live reservation subscription.
 * Vitest runs consume limited heap, so we avoid opening websocket pools
 * unless explicitly re-enabled via VITE_ENABLE_RESERVATION_SUBSCRIPTION.
 */
const SHOULD_START_RESERVATION_SUBSCRIPTION = (() => {
  try {
    if (typeof import.meta !== 'undefined') {
      const metaAny = import.meta as unknown as {
        vitest?: boolean;
        env?: { MODE?: string; VITE_ENABLE_RESERVATION_SUBSCRIPTION?: string };
      };

      // Allow explicit opt-in via env even when running tests
      if (metaAny.env?.VITE_ENABLE_RESERVATION_SUBSCRIPTION === 'true') {
        return true;
      }

      if (metaAny.vitest || metaAny.env?.MODE === 'test') {
        return false;
      }
    }
  } catch {
    // If env detection fails, fall through to process.env check
  }

  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') {
    return false;
  }

  return true;
})();

/**
 * Represents a complete reservation conversation thread
 */
export interface ReservationThread {
  /** Unique thread identifier (root event ID) */
  threadId: string;
  /** Restaurant database ID */
  restaurantId: string;
  /** Restaurant name */
  restaurantName: string;
  /** Restaurant's Nostr public key */
  restaurantNpub: string;
  /** All messages in chronological order */
  messages: ReservationMessage[];
  /** Original reservation request details */
  request: {
    partySize: number;
    isoTime: string;
    notes?: string;
  };
  /** Current conversation status */
  status: 'sent' | 'confirmed' | 'declined' | 'modification_requested' | 'modification_accepted' | 'expired' | 'cancelled';
  /** Latest modification request from restaurant (if status is 'modification_requested') */
  modificationRequest?: ReservationModificationRequest;
  /** Timestamp of last message (Unix timestamp in seconds) */
  lastUpdated: number;
}

interface ReservationContextValue {
  /** All reservation threads */
  threads: ReservationThread[];
  /** Whether the messenger is actively subscribed */
  isActive: boolean;
  /** Add a message to a thread (for sent messages) */
  addOutgoingMessage: (message: ReservationMessage, restaurantId: string, restaurantName: string, restaurantNpub: string) => void;
}

const ReservationContext = createContext<ReservationContextValue | null>(null);

const STORAGE_KEY = 'reservation_threads';

/**
 * Load reservation threads from localStorage
 */
function loadThreadsFromStorage(): ReservationThread[] {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.error('Failed to load cached reservations:', error);
  }
  return [];
}

/**
 * Save reservation threads to localStorage
 */
function saveThreadsToStorage(threads: ReservationThread[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  } catch (error) {
    console.error('Failed to cache reservations:', error);
  }
}

/**
 * Provider component for reservation state management
 */
export function ReservationProvider({ children }: { children: React.ReactNode }) {
  const [threads, setThreads] = useState<ReservationThread[]>(loadThreadsFromStorage);
  const [subscription, setSubscription] = useState<ReservationSubscription | null>(null);
  const nostrIdentity = useNostrIdentity();

  const handleIncomingMessage = useCallback((message: ReservationMessage) => {
    setThreads((prev) => updateThreadWithMessage(prev, message));
  }, []);

  // Save threads to localStorage whenever they change
  useEffect(() => {
    saveThreadsToStorage(threads);
  }, [threads]);

  // Start subscription when identity is available
  useEffect(() => {
    if (!nostrIdentity || !SHOULD_START_RESERVATION_SUBSCRIPTION) {
      return;
    }

    const relays = [
      'wss://relay.damus.io',
      'wss://nos.lol',
      'wss://relay.nostr.band',
    ];

    const sub = startReservationSubscription({
      privateKey: nostrIdentity.privateKeyHex,
      publicKey: nostrIdentity.publicKeyHex,
      relays,
      onMessage: handleIncomingMessage,
      onError: (error) => {
        console.error('Reservation messenger error:', error);
      },
      onReady: () => {
        if (SHOULD_START_RESERVATION_SUBSCRIPTION) {
          console.log('Reservation messenger ready');
        }
      },
    });

    setSubscription(sub);

    return () => {
      sub.stop();
      setSubscription((current) => (current === sub ? null : current));
    };
  }, [handleIncomingMessage, nostrIdentity]);

  const addOutgoingMessage = useCallback(
    (message: ReservationMessage, restaurantId: string, restaurantName: string, restaurantNpub: string) => {
      setThreads((prev) => {
        // Find thread by extracting thread context
        const threadContext = getThreadContext(message.rumor as any); // Rumor extends UnsignedEvent but getThreadContext expects Event
        // Thread ID logic per NIP-17:
        // - For request messages (root), use rumor.id (the rumor's computed ID, same for both gift wraps)
        // - For response/modification messages, use rootId from e-tags (which references the rumor ID of the original request)
        // - Fallback to rumor.id if neither applies (shouldn't happen for properly formatted messages)
        const threadId = message.type === 'request'
          ? message.rumor.id  // Request messages are root - use rumor ID as thread ID (per NIP-17)
          : (threadContext.rootId || message.rumor.id);  // Responses/modifications reference root rumor ID via e-tags

        const existingThread = prev.find((t) => t.threadId === threadId);

        if (existingThread) {
          // Add message to existing thread
          // Also update restaurant info if it's currently unknown (can happen if self-CC arrived first)
          const needsRestaurantInfoUpdate = 
            existingThread.restaurantName === 'Unknown Restaurant' || 
            existingThread.restaurantId === 'unknown';
          
          // Handle modification response optimistically
          let updatedThread = {
            ...existingThread,
            messages: [...existingThread.messages, message].sort((a, b) => a.rumor.created_at - b.rumor.created_at),
            lastUpdated: message.rumor.created_at,
            // Update restaurant info if it was unknown
            ...(needsRestaurantInfoUpdate && {
              restaurantId,
              restaurantName,
              restaurantNpub,
            }),
          };
          
          // If this is a modification response with status "confirmed", update the time immediately
          // but keep status as modification_requested until restaurant sends final response
          if (message.type === 'modification_response') {
            const modificationResponse = message.payload as ReservationModificationResponse;
            if (modificationResponse.status === 'confirmed' && existingThread.modificationRequest) {
              // Update the request time to the new accepted time immediately for UI feedback
              // Set status to modification_accepted to show user their acceptance was registered
              // The restaurant's response will trigger the final "confirmed" status
              updatedThread = {
                ...updatedThread,
                request: {
                  ...existingThread.request,
                  isoTime: modificationResponse.iso_time || existingThread.modificationRequest.iso_time,
                },
                status: 'modification_accepted' as const,
                // Clear modification request since it's been accepted
                modificationRequest: undefined,
              };
            } else if (modificationResponse.status === 'declined') {
              // If declined, keep status as modification_requested (restaurant may send another suggestion)
              // but clear the modification request
              updatedThread = {
                ...updatedThread,
                modificationRequest: undefined,
              };
            }
          }
          
          return prev.map((t) =>
            t.threadId === threadId ? updatedThread : t
          );
        } else {
          // Create new thread
          const request = message.payload as ReservationRequest;
          const newThread: ReservationThread = {
            threadId,
            restaurantId,
            restaurantName,
            restaurantNpub,
            messages: [message],
            request: {
              partySize: request.party_size,
              isoTime: request.iso_time,
              notes: request.notes,
            },
            status: 'sent' as const,
            lastUpdated: message.rumor.created_at,
          };
          return [newThread, ...prev].sort((a, b) => b.lastUpdated - a.lastUpdated);
        }
      });
    },
    []
  );

  const isActive = SHOULD_START_RESERVATION_SUBSCRIPTION ? subscription?.active ?? false : false;

  const value: ReservationContextValue = {
    threads,
    isActive,
    addOutgoingMessage,
  };

  return (
    <ReservationContext.Provider value={value}>
      {children}
    </ReservationContext.Provider>
  );
}

/**
 * Hook to access reservation context
 */
export function useReservations(): ReservationContextValue {
  const context = useContext(ReservationContext);
  if (!context) {
    throw new Error('useReservations must be used within ReservationProvider');
  }
  return context;
}

/**
 * Updates thread list with a new incoming message
 * @internal Exported for testing purposes
 */
export function updateThreadWithMessage(
  threads: ReservationThread[],
  message: ReservationMessage
): ReservationThread[] {
  // Deduplication: Check if this rumor already exists in any thread
  // We check rumor.id because the same rumor can be wrapped in different gift wraps
  // (e.g., self-CC vs merchant gift wrap). We only need one copy per rumor.
  const rumorAlreadyExists = threads.some((t) =>
    t.messages.some((m) => m.rumor.id === message.rumor.id)
  );

  if (rumorAlreadyExists) {
    // Rumor already exists, skip it
    return threads;
  }

  // Extract thread context using NIP-10
  const threadContext = getThreadContext(message.rumor as any);
  // Thread ID logic per NIP-17:
  // - For request messages (root), use rumor.id (the rumor's computed ID, same for both gift wraps)
  // - For response/modification messages, use rootId from e-tags (which references the rumor ID of the original request)
  // - Fallback to rumor.id if neither applies (shouldn't happen for properly formatted messages)
  const threadId = message.type === 'request' 
    ? message.rumor.id  // Request messages are root - use rumor ID as thread ID (per NIP-17)
    : (threadContext.rootId || message.rumor.id);  // Responses/modifications reference root rumor ID via e-tags

  console.log('[ReservationContext] Processing message:', {
    type: message.type,
    giftWrapId: message.giftWrap.id,
    rumorId: message.rumor.id,
    extractedThreadId: threadId,
    rumorTags: message.rumor.tags,
    eTags: message.rumor.tags.filter(t => t[0] === 'e'),
    rootETags: message.rumor.tags.filter(t => t[0] === 'e' && t[3] === 'root'),
    availableThreads: threads.map(t => ({ id: t.threadId, name: t.restaurantName })),
  });

  // Find existing thread by threadId (rumor.id or rootId from e-tags)
  const existingThread = threads.find((t) => t.threadId === threadId);

  if (existingThread) {
    // Update existing thread
    const updatedThread: ReservationThread = {
      ...existingThread,
      messages: [...existingThread.messages, message].sort(
        (a, b) => a.rumor.created_at - b.rumor.created_at
      ),
      lastUpdated: message.rumor.created_at,
    };

    // Update status based on latest response
    if (message.type === 'response') {
      const response = message.payload as ReservationResponse;
      // Map response status to thread status
      // Only valid statuses are: confirmed, declined, expired, cancelled
      if (response.status === 'confirmed' || response.status === 'declined' || 
          response.status === 'expired' || response.status === 'cancelled') {
        updatedThread.status = response.status;
        // Update the request time if the response includes a confirmed time
        // This is especially important after a modification was accepted
        if (response.status === 'confirmed' && response.iso_time) {
          // Check if we previously accepted a modification
          // Find the original request time from the first message
          const originalRequestMessage = existingThread.messages.find(m => m.type === 'request');
          const originalRequestTime = originalRequestMessage 
            ? (originalRequestMessage.payload as ReservationRequest).iso_time 
            : existingThread.request.isoTime;
          
          // If the response time matches the original request time (before modification),
          // but we've already updated to a modification time, preserve the modification time
          // This handles cases where restaurant confirms with old time instead of new time
          if (response.iso_time === originalRequestTime && 
              existingThread.request.isoTime !== originalRequestTime) {
            // Keep the modification time we already updated
            // Don't overwrite with the old time from response
          } else {
            // Use the time from the response
            updatedThread.request = {
              ...existingThread.request,
              isoTime: response.iso_time,
            };
          }
        }
      }
    } else if (message.type === 'modification_request') {
      // Handle modification request
      const modificationRequest = message.payload as ReservationModificationRequest;
      updatedThread.status = 'modification_requested';
      updatedThread.modificationRequest = modificationRequest;
    } else if (message.type === 'modification_response') {
      // Handle modification response (customer accepts/declines)
      const modificationResponse = message.payload as ReservationModificationResponse;
      if (modificationResponse.status === 'confirmed' && existingThread.modificationRequest) {
        // Customer accepted the modification - update time immediately for UI feedback
        // Set status to modification_accepted to show user their acceptance was registered
        updatedThread.request = {
          ...existingThread.request,
          isoTime: modificationResponse.iso_time || existingThread.modificationRequest.iso_time,
        };
        updatedThread.status = 'modification_accepted';
        // Clear modification request since it's been accepted
        updatedThread.modificationRequest = undefined;
      } else if (modificationResponse.status === 'declined') {
        // Customer declined - keep status as modification_requested (restaurant may send another suggestion)
        // but clear the modification request
        updatedThread.modificationRequest = undefined;
      }
    }

    return threads
      .map((t) => (t.threadId === threadId ? updatedThread : t))
      .sort((a, b) => b.lastUpdated - a.lastUpdated);
  } else {
    // This shouldn't happen for incoming responses/modifications, but handle gracefully
    // Create a new thread (message must be a request)
    if (message.type === 'request') {
      const request = message.payload as ReservationRequest;
      const newThread: ReservationThread = {
        threadId,
        restaurantId: 'unknown', // We don't have this info from incoming message
        restaurantName: 'Unknown Restaurant', // We don't have this info from incoming message
        restaurantNpub: message.senderPubkey,
        messages: [message],
        request: {
          partySize: request.party_size,
          isoTime: request.iso_time,
          notes: request.notes,
        },
        status: 'sent',
        lastUpdated: message.rumor.created_at,
      };

      return [newThread, ...threads].sort((a, b) => b.lastUpdated - a.lastUpdated);
    }

    // Response/modification without a matching thread - log warning and ignore
    console.warn('[ReservationContext] ⚠️ Received message for unknown thread:', message.type);
    console.warn('[ReservationContext] Message threadId:', threadId);
    console.warn('[ReservationContext] Message rumor.id:', message.rumor.id);
    console.warn('[ReservationContext] Available threadIds:', threads.map(t => t.threadId));
    console.warn('[ReservationContext] All e-tags:', JSON.stringify(message.rumor.tags.filter(t => t[0] === 'e'), null, 2));
    console.warn('[ReservationContext] Root e-tags:', JSON.stringify(message.rumor.tags.filter(t => t[0] === 'e' && t[3] === 'root'), null, 2));
    console.warn('[ReservationContext] Thread context:', threadContext);
    console.warn('[ReservationContext] Full message:', message);
    return threads;
  }
}
