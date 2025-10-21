import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  generateKeypair,
  getOrCreateIdentity,
  getIdentity,
  getPublicKeyBech32,
  getPrivateKeyBech32,
  clearIdentity,
  npubToHex,
  nsecToHex,
} from './keys';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

// Replace global localStorage
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('Nostr key management', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorageMock.clear();
  });
  
  describe('generateKeypair', () => {
    test('generates valid keypair', () => {
      const identity = generateKeypair();
      
      // Check npub format
      expect(identity.npub).toMatch(/^npub1[a-z0-9]+$/);
      expect(identity.npub.length).toBeGreaterThan(60);
      
      // Check nsec format
      expect(identity.nsec).toMatch(/^nsec1[a-z0-9]+$/);
      expect(identity.nsec.length).toBeGreaterThan(60);
      
      // Check hex formats
      expect(identity.publicKeyHex).toMatch(/^[0-9a-f]{64}$/i);
      expect(identity.privateKeyHex).toMatch(/^[0-9a-f]{64}$/i);
    });
    
    test('generates unique keypairs', () => {
      const identity1 = generateKeypair();
      const identity2 = generateKeypair();
      
      expect(identity1.npub).not.toBe(identity2.npub);
      expect(identity1.nsec).not.toBe(identity2.nsec);
      expect(identity1.publicKeyHex).not.toBe(identity2.publicKeyHex);
      expect(identity1.privateKeyHex).not.toBe(identity2.privateKeyHex);
    });
  });
  
  describe('getOrCreateIdentity', () => {
    test('creates new identity when none exists', () => {
      const identity = getOrCreateIdentity();
      
      expect(identity).toBeDefined();
      expect(identity.npub).toMatch(/^npub1/);
      expect(identity.nsec).toMatch(/^nsec1/);
    });
    
    test('returns same identity on subsequent calls', () => {
      const identity1 = getOrCreateIdentity();
      const identity2 = getOrCreateIdentity();
      
      expect(identity1.npub).toBe(identity2.npub);
      expect(identity1.nsec).toBe(identity2.nsec);
      expect(identity1.publicKeyHex).toBe(identity2.publicKeyHex);
      expect(identity1.privateKeyHex).toBe(identity2.privateKeyHex);
    });
    
    test('stores identity in localStorage', () => {
      const identity = getOrCreateIdentity();
      
      const stored = localStorageMock.getItem('ai-concierge-nostr-identity');
      expect(stored).toBeDefined();
      
      const parsed = JSON.parse(stored!);
      expect(parsed.npub).toBe(identity.npub);
      expect(parsed.nsec).toBe(identity.nsec);
    });
    
    test('handles corrupted localStorage data', () => {
      // Set invalid data
      localStorageMock.setItem('ai-concierge-nostr-identity', 'invalid json');
      
      // Should generate new identity
      const identity = getOrCreateIdentity();
      expect(identity.npub).toMatch(/^npub1/);
    });
    
    test('regenerates if stored identity is invalid', () => {
      // Set incomplete identity
      localStorageMock.setItem('ai-concierge-nostr-identity', JSON.stringify({
        npub: 'invalid',
        nsec: 'invalid',
      }));
      
      // Should generate new valid identity
      const identity = getOrCreateIdentity();
      expect(identity.npub).toMatch(/^npub1[a-z0-9]+$/);
      expect(identity.npub.length).toBeGreaterThan(60);
    });
  });
  
  describe('getIdentity', () => {
    test('returns null when no identity exists', () => {
      const identity = getIdentity();
      expect(identity).toBeNull();
    });
    
    test('returns identity after creation', () => {
      const created = getOrCreateIdentity();
      const retrieved = getIdentity();
      
      expect(retrieved).not.toBeNull();
      expect(retrieved?.npub).toBe(created.npub);
    });
  });
  
  describe('getPublicKeyBech32', () => {
    test('returns null when no identity', () => {
      expect(getPublicKeyBech32()).toBeNull();
    });
    
    test('returns npub after identity creation', () => {
      const identity = getOrCreateIdentity();
      const npub = getPublicKeyBech32();
      
      expect(npub).toBe(identity.npub);
    });
  });
  
  describe('getPrivateKeyBech32', () => {
    test('returns null when no identity', () => {
      expect(getPrivateKeyBech32()).toBeNull();
    });
    
    test('returns nsec after identity creation', () => {
      const identity = getOrCreateIdentity();
      const nsec = getPrivateKeyBech32();
      
      expect(nsec).toBe(identity.nsec);
    });
  });
  
  describe('clearIdentity', () => {
    test('removes identity from localStorage', () => {
      getOrCreateIdentity();
      
      // Verify it exists
      expect(getIdentity()).not.toBeNull();
      
      // Clear it
      clearIdentity();
      
      // Verify it's gone
      expect(getIdentity()).toBeNull();
      expect(localStorageMock.getItem('ai-concierge-nostr-identity')).toBeNull();
    });
    
    test('handles clearing when no identity exists', () => {
      // Should not throw
      expect(() => clearIdentity()).not.toThrow();
    });
  });
  
  describe('npubToHex', () => {
    test('converts valid npub to hex', () => {
      const identity = generateKeypair();
      const hex = npubToHex(identity.npub);
      
      expect(hex).toBe(identity.publicKeyHex);
      expect(hex).toMatch(/^[0-9a-f]{64}$/i);
    });
    
    test('returns null for invalid npub', () => {
      expect(npubToHex('invalid')).toBeNull();
      expect(npubToHex('')).toBeNull();
      expect(npubToHex('npub1invalid')).toBeNull();
    });
  });
  
  describe('nsecToHex', () => {
    test('converts valid nsec to hex', () => {
      const identity = generateKeypair();
      const hex = nsecToHex(identity.nsec);
      
      expect(hex).toBe(identity.privateKeyHex);
      expect(hex).toMatch(/^[0-9a-f]{64}$/i);
    });
    
    test('returns null for invalid nsec', () => {
      expect(nsecToHex('invalid')).toBeNull();
      expect(nsecToHex('')).toBeNull();
      expect(nsecToHex('nsec1invalid')).toBeNull();
    });
  });
  
  describe('identity persistence', () => {
    test('identity survives "page reload" simulation', () => {
      const identity1 = getOrCreateIdentity();
      
      // Simulate page reload by clearing in-memory state
      // (localStorage persists)
      const identity2 = getOrCreateIdentity();
      
      expect(identity2.npub).toBe(identity1.npub);
      expect(identity2.nsec).toBe(identity1.nsec);
    });
    
    test('new identity after clearing storage', () => {
      const identity1 = getOrCreateIdentity();
      
      clearIdentity();
      
      const identity2 = getOrCreateIdentity();
      
      expect(identity2.npub).not.toBe(identity1.npub);
      expect(identity2.nsec).not.toBe(identity1.nsec);
    });
  });
});

