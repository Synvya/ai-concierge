/**
 * Reservation Context
 * 
 * Manages reservation threads state and real-time updates from ReservationMessenger.
 * Groups messages by thread ID and tracks conversation status.
 * 
 * ## State Machine
 * For a visual representation of the reservation state machine and detailed state 
 * transition rules, see: ./RESERVATION_STATE_MACHINE.md
 * 
 * ## Key Concepts
 * - Threads are grouped by threadId (rumor.id of the original request)
 * - Status is determined by the last message in the thread
 * - Messages are sorted by created_at timestamp (ascending) with id tie-breaking
 * - All threads are persisted to localStorage for cross-session availability
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
  status: 'sent' | 'confirmed' | 'declined' | 'modification_requested' | 'modification_confirmed' | 'expired' | 'cancelled';
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
 * Local Storage Rules for Reservation Threads
 * 
 * ## What Gets Stored
 * - All reservation threads with their complete message history
 * - Each thread includes: threadId, restaurantId, restaurantName, restaurantNpub, 
 *   messages[], request details, status, and lastUpdated timestamp
 * 
 * ## When Storage Occurs
 * - Automatically saved whenever threads state changes (via useEffect)
 * - On initial load from localStorage
 * - After adding outgoing messages (user sends reservation request/response)
 * - After receiving incoming messages from restaurants
 * - After thread status updates
 * 
 * ## Storage Key
 * - Key: 'reservation_threads'
 * - Contains: JSON-serialized array of ReservationThread objects
 * 
 * ## Data Persistence
 * - Threads persist across browser sessions and page refreshes
 * - No automatic expiration - threads remain until explicitly cleared
 * - Storage survives user logout (tied to browser, not session)
 * 
 * ## Error Handling
 * - Parse errors during load return empty array (graceful degradation)
 * - Storage errors are logged but don't crash the app
 * - Quota exceeded errors fall back to in-memory storage only
 * 
 * ## Privacy & Security
 * - All message content is stored in localStorage (unencrypted)
 * - Gift wrap encryption is preserved in stored messages
 * - User should be aware data persists locally
 * - Clear localStorage to remove all reservation data
 */

/**
 * Load reservation threads from localStorage
 * @returns Array of reservation threads, or empty array if none cached or on error
 */
function loadThreadsFromStorage(): ReservationThread[] {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const threads = JSON.parse(cached) as ReservationThread[];
      
      // Migration: Fix old status names from before standardization
      // Replace 'modification_accepted' with 'modification_confirmed'
      return threads.map(thread => {
        if (thread.status === 'modification_accepted' as any) {
          console.log('[ReservationContext] Migrating old status name: modification_accepted → modification_confirmed');
          return {
            ...thread,
            status: 'modification_confirmed' as const,
          };
        }
        return thread;
      });
    }
  } catch (error) {
    console.error('Failed to load cached reservations:', error);
  }
  return [];
}

/**
 * Save reservation threads to localStorage
 * Automatically called whenever threads state changes
 * @param threads - Array of reservation threads to persist
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
          
          /**
           * TIME RESOLUTION FOR CUSTOMER MODIFICATION ACCEPTANCE
           * 
           * When customer accepts a restaurant's modification proposal, we immediately
           * update the reservation time for responsive UI feedback:
           * 
           * Priority for time selection:
           * 1. iso_time from customer's kind:9904 response (if provided)
           * 2. iso_time from restaurant's kind:9903 modification request
           * 
           * This immediate update provides instant visual feedback to the user.
           * The restaurant will later send a kind:9902 confirmation which becomes
           * the final authoritative time (see time resolution logic in updateThreadWithMessage).
           */
          if (message.type === 'modification_response') {
            const modificationResponse = message.payload as ReservationModificationResponse;
            if (modificationResponse.status === 'confirmed' && existingThread.modificationRequest) {
              // Update time immediately using customer's confirmed time or modification request time
              updatedThread = {
                ...updatedThread,
                request: {
                  ...existingThread.request,
                  isoTime: modificationResponse.iso_time || existingThread.modificationRequest.iso_time,
                },
                status: 'modification_confirmed' as const,
                // Clear modification request since it's been accepted
                modificationRequest: undefined,
              };
            } else if (modificationResponse.status === 'declined') {
              // Customer declined the modification - clear the request
              // Status remains modification_requested for potential new proposals
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
  // Validation Rule 1: Reject messages with future timestamps
  // Allow 5 minutes of clock skew tolerance
  const now = Math.floor(Date.now() / 1000);
  const CLOCK_SKEW_TOLERANCE = 5 * 60; // 5 minutes in seconds
  if (message.rumor.created_at > now + CLOCK_SKEW_TOLERANCE) {
    console.warn('[ReservationContext] ⚠️ Rejecting message with future timestamp:', {
      created_at: message.rumor.created_at,
      now,
      difference: message.rumor.created_at - now,
      tolerance: CLOCK_SKEW_TOLERANCE,
    });
    return threads;
  }

  // Validation Rule 2: Validate required fields per NIP-RR schema
  if (!message.rumor.kind || !message.rumor.content || !message.rumor.created_at || !message.rumor.tags) {
    console.warn('[ReservationContext] ⚠️ Rejecting message missing required fields');
    return threads;
  }

  // Validate kind is a valid reservation kind
  const validKinds = [9901, 9902, 9903, 9904];
  if (!validKinds.includes(message.rumor.kind)) {
    console.warn('[ReservationContext] ⚠️ Rejecting message with invalid kind:', message.rumor.kind);
    return threads;
  }

  // Validate required tags based on message type
  const eTags = message.rumor.tags.filter((t) => t[0] === 'e');
  
  // Non-request messages (responses, modifications) MUST have e-tags referencing the original request
  if (message.type !== 'request' && eTags.length === 0) {
    console.warn('[ReservationContext] ⚠️ Rejecting non-request message without e-tags');
    return threads;
  }

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
    // Sort messages by created_at (ascending), with lexicographic id comparison for ties
    const sortedMessages = [...existingThread.messages, message].sort((a, b) => {
      // Rule 1: Sort by created_at timestamp
      if (a.rumor.created_at !== b.rumor.created_at) {
        return a.rumor.created_at - b.rumor.created_at;
      }
      // Rule 2: If created_at is identical, use lexicographic comparison of id
      return a.rumor.id.localeCompare(b.rumor.id);
    });

    const updatedThread: ReservationThread = {
      ...existingThread,
      messages: sortedMessages,
      lastUpdated: message.rumor.created_at,
    };

    /**
     * RESERVATION TIME RESOLUTION LOGIC
     * 
     * The reservation time displayed to the user is determined by the following priority:
     * 
     * 1. LATEST CONFIRMED RESPONSE (kind:9902 with status:confirmed and iso_time)
     *    - When restaurant sends final confirmation with a time
     *    - This is the authoritative time after modifications are completed
     * 
     * 2. ACCEPTED MODIFICATION (kind:9904 with status:confirmed and iso_time)
     *    - When customer accepts restaurant's proposed modification
     *    - Updates immediately for UI feedback before restaurant's final confirmation
     *    - May be overridden by subsequent kind:9902 with different time
     * 
     * 3. ORIGINAL REQUEST (kind:9901 iso_time)
     *    - Initial time proposed by customer
     *    - Used as fallback if no confirmations with times exist
     * 
     * EDGE CASES HANDLED:
     * - If restaurant confirms with old time after modification was accepted,
     *   we preserve the modification time (don't regress to original time)
     * - If restaurant confirms with new time, we update to that time
     * - If no iso_time in confirmation, we keep existing time
     * 
     * See also: RESERVATION_STATE_MACHINE.md for complete flow documentation
     */
    
    // Update status based on latest response
    if (message.type === 'response') {
      const response = message.payload as ReservationResponse;
      // Map response status to thread status
      // Only valid statuses are: confirmed, declined, expired, cancelled
      if (response.status === 'confirmed' || response.status === 'declined' || 
          response.status === 'expired' || response.status === 'cancelled') {
        updatedThread.status = response.status;
        
        // Time Resolution: Update reservation time if response includes a confirmed time
        if (response.status === 'confirmed' && response.iso_time) {
          // Find the original request time for comparison
          const originalRequestMessage = existingThread.messages.find(m => m.type === 'request');
          const originalRequestTime = originalRequestMessage 
            ? (originalRequestMessage.payload as ReservationRequest).iso_time 
            : existingThread.request.isoTime;
          
          // Edge Case: Restaurant confirms with original time after modification was accepted
          // If response time matches original (pre-modification) time, but we've already
          // updated to a modification time, preserve the modification time
          if (response.iso_time === originalRequestTime && 
              existingThread.request.isoTime !== originalRequestTime) {
            // Keep the modification time - don't regress to old time
            // This handles restaurants that confirm with old time by mistake
          } else {
            // Normal Case: Use the time from the restaurant's confirmation
            // This is the authoritative time for the reservation
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
        // Set status to modification_confirmed to show user their acceptance was registered
        updatedThread.request = {
          ...existingThread.request,
          isoTime: modificationResponse.iso_time || existingThread.modificationRequest.iso_time,
        };
        updatedThread.status = 'modification_confirmed';
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
