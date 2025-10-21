/**
 * React hook for accessing Nostr identity
 * Automatically initializes identity on mount and provides stable reference
 */

import { useEffect, useState } from 'react';
import { getOrCreateIdentity, type NostrIdentity } from '../lib/nostr/keys';

/**
 * Hook to access the user's Nostr identity
 * Creates and persists identity in localStorage on first use
 * @returns NostrIdentity object with npub, nsec, and hex keys
 */
export function useNostrIdentity(): NostrIdentity | null {
  const [identity, setIdentity] = useState<NostrIdentity | null>(null);
  
  useEffect(() => {
    // Initialize identity on mount
    try {
      const id = getOrCreateIdentity();
      setIdentity(id);
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

