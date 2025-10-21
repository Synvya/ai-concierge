/**
 * Nostr key management utilities for browser-based identity
 * Generates and persists npub/nsec keypairs in localStorage
 */

import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { npubEncode, nsecEncode, decode } from 'nostr-tools/nip19';

const STORAGE_KEY = 'ai-concierge-nostr-identity';

export interface NostrIdentity {
  npub: string;
  nsec: string;
  publicKeyHex: string;
  privateKeyHex: string;
}

/**
 * Generate a new Nostr keypair
 * @returns NostrIdentity with npub, nsec, and hex formats
 */
export function generateKeypair(): NostrIdentity {
  // Generate private key (32 bytes)
  const privateKey = generateSecretKey();
  
  // Derive public key
  const publicKey = getPublicKey(privateKey);
  
  // Encode to bech32 format
  const npub = npubEncode(publicKey);
  const nsec = nsecEncode(privateKey);
  
  // Convert to hex strings for storage
  const privateKeyHex = Buffer.from(privateKey).toString('hex');
  const publicKeyHex = publicKey;
  
  return {
    npub,
    nsec,
    publicKeyHex,
    privateKeyHex,
  };
}

/**
 * Get or create Nostr identity from localStorage
 * If no identity exists, generates a new one and stores it
 * @returns NostrIdentity from storage or newly generated
 */
export function getOrCreateIdentity(): NostrIdentity {
  try {
    // Try to load from localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    
    if (stored) {
      const identity = JSON.parse(stored) as NostrIdentity;
      
      // Validate the stored identity
      if (isValidIdentity(identity)) {
        return identity;
      }
      
      // If invalid, fall through to generate new
      console.warn('Invalid stored identity, generating new one');
    }
  } catch (error) {
    console.warn('Failed to load stored identity:', error);
  }
  
  // Generate new identity
  const identity = generateKeypair();
  
  // Save to localStorage
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  } catch (error) {
    console.error('Failed to save identity to localStorage:', error);
  }
  
  return identity;
}

/**
 * Get the current Nostr identity without creating a new one
 * @returns NostrIdentity if exists, null otherwise
 */
export function getIdentity(): NostrIdentity | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    
    if (stored) {
      const identity = JSON.parse(stored) as NostrIdentity;
      
      if (isValidIdentity(identity)) {
        return identity;
      }
    }
  } catch (error) {
    console.warn('Failed to load identity:', error);
  }
  
  return null;
}

/**
 * Get the public key (npub) from stored identity
 * @returns npub string or null if no identity exists
 */
export function getPublicKeyBech32(): string | null {
  const identity = getIdentity();
  return identity?.npub || null;
}

/**
 * Get the private key (nsec) from stored identity
 * WARNING: Handle with care, never expose to servers
 * @returns nsec string or null if no identity exists
 */
export function getPrivateKeyBech32(): string | null {
  const identity = getIdentity();
  return identity?.nsec || null;
}

/**
 * Clear the stored identity from localStorage
 * Use with caution - this cannot be undone
 */
export function clearIdentity(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear identity:', error);
  }
}

/**
 * Validate a Nostr identity object
 * @param identity Identity to validate
 * @returns true if valid, false otherwise
 */
function isValidIdentity(identity: unknown): identity is NostrIdentity {
  if (typeof identity !== 'object' || identity === null) {
    return false;
  }
  
  const id = identity as Partial<NostrIdentity>;
  
  // Check all required fields exist and are strings
  if (
    typeof id.npub !== 'string' ||
    typeof id.nsec !== 'string' ||
    typeof id.publicKeyHex !== 'string' ||
    typeof id.privateKeyHex !== 'string'
  ) {
    return false;
  }
  
  // Validate npub format
  if (!id.npub.startsWith('npub1') || id.npub.length < 60) {
    return false;
  }
  
  // Validate nsec format
  if (!id.nsec.startsWith('nsec1') || id.nsec.length < 60) {
    return false;
  }
  
  // Validate hex format (64 characters for keys)
  if (!/^[0-9a-f]{64}$/i.test(id.publicKeyHex)) {
    return false;
  }
  
  if (!/^[0-9a-f]{64}$/i.test(id.privateKeyHex)) {
    return false;
  }
  
  return true;
}

/**
 * Decode an npub to hex public key
 * @param npub Bech32-encoded public key
 * @returns Hex public key or null if invalid
 */
export function npubToHex(npub: string): string | null {
  try {
    const decoded = decode(npub);
    if (decoded.type === 'npub') {
      return decoded.data;
    }
  } catch (error) {
    console.warn('Failed to decode npub:', error);
  }
  return null;
}

/**
 * Decode an nsec to hex private key
 * WARNING: Handle with extreme care
 * @param nsec Bech32-encoded private key
 * @returns Hex private key or null if invalid
 */
export function nsecToHex(nsec: string): string | null {
  try {
    const decoded = decode(nsec);
    if (decoded.type === 'nsec') {
      return Buffer.from(decoded.data).toString('hex');
    }
  } catch (error) {
    console.warn('Failed to decode nsec:', error);
  }
  return null;
}

