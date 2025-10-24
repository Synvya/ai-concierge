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
import type { ReservationRequest, ReservationResponse } from '../types/reservation';

/**
 * Represents a complete reservation conversation thread
 */
export interface ReservationThread {
  /** Unique thread identifier (root event ID) */
  threadId: string;
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
  status: 'sent' | 'confirmed' | 'declined' | 'suggested' | 'expired' | 'cancelled';
  /** Timestamp of last message (Unix timestamp in seconds) */
  lastUpdated: number;
}

interface ReservationContextValue {
  /** All reservation threads */
  threads: ReservationThread[];
  /** Whether the messenger is actively subscribed */
  isActive: boolean;
  /** Add a message to a thread (for sent messages) */
  addOutgoingMessage: (message: ReservationMessage, restaurantName: string, restaurantNpub: string) => void;
}

const ReservationContext = createContext<ReservationContextValue | null>(null);

/**
 * Provider component for reservation state management
 */
export function ReservationProvider({ children }: { children: React.ReactNode }) {
  const [threads, setThreads] = useState<ReservationThread[]>([]);
  const [subscription, setSubscription] = useState<ReservationSubscription | null>(null);
  const nostrIdentity = useNostrIdentity();

  const handleIncomingMessage = useCallback((message: ReservationMessage) => {
    setThreads((prev) => updateThreadWithMessage(prev, message));
  }, []);

  // Start subscription when identity is available
  useEffect(() => {
    if (!nostrIdentity) {
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
        console.log('Reservation messenger ready');
      },
    });

    setSubscription(sub);

    return () => {
      sub.stop();
    };
  }, [nostrIdentity, handleIncomingMessage]);

  const addOutgoingMessage = useCallback(
    (message: ReservationMessage, restaurantName: string, restaurantNpub: string) => {
      setThreads((prev) => {
        // Find thread by extracting thread context
        const threadContext = getThreadContext(message.rumor as any); // Rumor extends UnsignedEvent but getThreadContext expects Event
        const threadId = threadContext.rootId || message.giftWrap.id;

        const existingThread = prev.find((t) => t.threadId === threadId);

        if (existingThread) {
          // Add message to existing thread
          return prev.map((t) =>
            t.threadId === threadId
              ? {
                  ...t,
                  messages: [...t.messages, message].sort((a, b) => a.rumor.created_at - b.rumor.created_at),
                  lastUpdated: message.rumor.created_at,
                }
              : t
          );
        } else {
          // Create new thread
          const request = message.payload as ReservationRequest;
          const newThread: ReservationThread = {
            threadId,
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

  const value: ReservationContextValue = {
    threads,
    isActive: subscription?.active ?? false,
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
 */
function updateThreadWithMessage(
  threads: ReservationThread[],
  message: ReservationMessage
): ReservationThread[] {
  // Extract thread context using NIP-10
  const threadContext = getThreadContext(message.rumor as any);
  const threadId = threadContext.rootId || message.giftWrap.id;

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
      updatedThread.status = response.status;
    }

    return threads
      .map((t) => (t.threadId === threadId ? updatedThread : t))
      .sort((a, b) => b.lastUpdated - a.lastUpdated);
  } else {
    // This shouldn't happen for incoming responses, but handle gracefully
    // Create a new thread (message must be a request)
    if (message.type === 'request') {
      const request = message.payload as ReservationRequest;
      const newThread: ReservationThread = {
        threadId,
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

    // Response without a matching thread - log warning and ignore
    console.warn('Received response for unknown thread:', threadId);
    return threads;
  }
}

