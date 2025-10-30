/**
 * React hook for accessing Nostr identity
 * Automatically initializes identity on mount and provides stable reference
 */

import { useEffect, useState, useRef } from 'react';
import { getOrCreateIdentity, type NostrIdentity } from '../lib/nostr/keys';
import { publishDmRelayEvent } from '../lib/nostr/nip17';

/**
 * Hook to access the user's Nostr identity
 * Creates and persists identity in localStorage on first use
 * Also publishes DM relay event (kind 10050) on initialization
 * @returns NostrIdentity object with npub, nsec, and hex keys
 */
export function useNostrIdentity(): NostrIdentity | null {
  const [identity, setIdentity] = useState<NostrIdentity | null>(null);
  const publishedRef = useRef(false);
  
  useEffect(() => {
    // Initialize identity on mount
    try {
      const id = getOrCreateIdentity();
      setIdentity(id);
      
      // Publish DM relay event (kind 10050) once per session
      // This announces our preferred relays for receiving DMs per NIP-17
      if (!publishedRef.current) {
        publishedRef.current = true;
        publishDmRelayEvent(id.privateKeyHex).catch((error) => {
          console.warn('Failed to publish DM relay event:', error);
          // Don't block identity initialization if publishing fails
        });
      }
    } catch (error) {
      console.error('Failed to initialize Nostr identity:', error);
    }
  }, []); // Run once on mount
  
  return identity;
}

/**
 * Hook to get just the npub (public key)
 * Convenient shorthand for cases where only npub is needed
 * @returns npub string or null if not yet initialized
 */
export function useNpub(): string | null {
  const identity = useNostrIdentity();
  return identity?.npub || null;
}

