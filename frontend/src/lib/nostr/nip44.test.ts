import { describe, test, expect } from 'vitest';
import { encryptMessage, decryptMessage, getConversationKey } from './nip44';
import { generateKeypair } from './keys';

describe('NIP-44 Encryption', () => {
  describe('encryptMessage and decryptMessage', () => {
    test('successfully encrypts and decrypts a message', () => {
      const alice = generateKeypair();
      const bob = generateKeypair();
      const message = 'Hello, this is a secret message!';

      // Alice encrypts for Bob
      const encrypted = encryptMessage(message, alice.privateKeyHex, bob.publicKeyHex);

      // Encrypted message should be different from plaintext
      expect(encrypted).not.toBe(message);
      expect(encrypted.length).toBeGreaterThan(0);

      // Bob decrypts from Alice
      const decrypted = decryptMessage(encrypted, bob.privateKeyHex, alice.publicKeyHex);

      // Decrypted message should match original
      expect(decrypted).toBe(message);
    });

    test('handles unicode characters correctly', () => {
      const alice = generateKeypair();
      const bob = generateKeypair();
      const message = 'Café réservation 🍽️ for 4 people at 7pm';

      const encrypted = encryptMessage(message, alice.privateKeyHex, bob.publicKeyHex);
      const decrypted = decryptMessage(encrypted, bob.privateKeyHex, alice.publicKeyHex);

      expect(decrypted).toBe(message);
    });

    test('handles very short messages', () => {
      const alice = generateKeypair();
      const bob = generateKeypair();
      const message = 'x';

      const encrypted = encryptMessage(message, alice.privateKeyHex, bob.publicKeyHex);
      const decrypted = decryptMessage(encrypted, bob.privateKeyHex, alice.publicKeyHex);

      expect(decrypted).toBe(message);
    });

    test('handles long messages', () => {
      const alice = generateKeypair();
      const bob = generateKeypair();
      const message = 'A'.repeat(10000); // 10k characters

      const encrypted = encryptMessage(message, alice.privateKeyHex, bob.publicKeyHex);
      const decrypted = decryptMessage(encrypted, bob.privateKeyHex, alice.publicKeyHex);

      expect(decrypted).toBe(message);
      expect(decrypted.length).toBe(10000);
    });

    test('produces different ciphertext for same message (includes random nonce)', () => {
      const alice = generateKeypair();
      const bob = generateKeypair();
      const message = 'Same message';

      const encrypted1 = encryptMessage(message, alice.privateKeyHex, bob.publicKeyHex);
      const encrypted2 = encryptMessage(message, alice.privateKeyHex, bob.publicKeyHex);

      // Should be different due to random nonce
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to same plaintext
      const decrypted1 = decryptMessage(encrypted1, bob.privateKeyHex, alice.publicKeyHex);
      const decrypted2 = decryptMessage(encrypted2, bob.privateKeyHex, alice.publicKeyHex);

      expect(decrypted1).toBe(message);
      expect(decrypted2).toBe(message);
    });

    test('cannot decrypt with wrong private key', () => {
      const alice = generateKeypair();
      const bob = generateKeypair();
      const charlie = generateKeypair();
      const message = 'Secret message';

      const encrypted = encryptMessage(message, alice.privateKeyHex, bob.publicKeyHex);

      // Charlie tries to decrypt (should fail)
      expect(() => {
        decryptMessage(encrypted, charlie.privateKeyHex, alice.publicKeyHex);
      }).toThrow();
    });

    test('cannot decrypt with wrong public key', () => {
      const alice = generateKeypair();
      const bob = generateKeypair();
      const charlie = generateKeypair();
      const message = 'Secret message';

      const encrypted = encryptMessage(message, alice.privateKeyHex, bob.publicKeyHex);

      // Bob tries to decrypt but uses wrong sender public key
      expect(() => {
        decryptMessage(encrypted, bob.privateKeyHex, charlie.publicKeyHex);
      }).toThrow();
    });

    test('throws on corrupted ciphertext', () => {
      const alice = generateKeypair();
      const bob = generateKeypair();
      const message = 'Test message';

      const encrypted = encryptMessage(message, alice.privateKeyHex, bob.publicKeyHex);
      const corrupted = encrypted.slice(0, -10) + 'corrupted!';

      expect(() => {
        decryptMessage(corrupted, bob.privateKeyHex, alice.publicKeyHex);
      }).toThrow();
    });
  });

  describe('encrypt for self', () => {
    test('successfully encrypts and decrypts for self', () => {
      const identity = generateKeypair();
      const data = 'My private notes';

      const encrypted = encryptMessage(data, identity.privateKeyHex, identity.publicKeyHex);
      const decrypted = decryptMessage(encrypted, identity.privateKeyHex, identity.publicKeyHex);

      expect(decrypted).toBe(data);
    });

    test('encrypted data cannot be read by others', () => {
      const alice = generateKeypair();
      const bob = generateKeypair();
      const data = 'Alice private data';

      const encrypted = encryptMessage(data, alice.privateKeyHex, alice.publicKeyHex);

      // Bob cannot decrypt it
      expect(() => {
        decryptMessage(encrypted, bob.privateKeyHex, bob.publicKeyHex);
      }).toThrow();
    });

    test('handles JSON data', () => {
      const identity = generateKeypair();
      const data = JSON.stringify({ type: 'note', content: 'Secret note', timestamp: Date.now() });

      const encrypted = encryptMessage(data, identity.privateKeyHex, identity.publicKeyHex);
      const decrypted = decryptMessage(encrypted, identity.privateKeyHex, identity.publicKeyHex);

      expect(decrypted).toBe(data);

      const parsed = JSON.parse(decrypted);
      expect(parsed.type).toBe('note');
      expect(parsed.content).toBe('Secret note');
    });
  });

  describe('getConversationKey', () => {
    test('returns same conversation key for both parties', () => {
      const alice = generateKeypair();
      const bob = generateKeypair();

      // Alice derives conversation key with Bob
      const aliceKey = getConversationKey(alice.privateKeyHex, bob.publicKeyHex);

      // Bob derives conversation key with Alice
      const bobKey = getConversationKey(bob.privateKeyHex, alice.publicKeyHex);

      // They should be the same (ECDH property)
      expect(aliceKey).toEqual(bobKey);
    });

    test('returns Uint8Array', () => {
      const alice = generateKeypair();
      const bob = generateKeypair();

      const key = getConversationKey(alice.privateKeyHex, bob.publicKeyHex);

      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBeGreaterThan(0);
    });

    test('different key pairs produce different conversation keys', () => {
      const alice = generateKeypair();
      const bob = generateKeypair();
      const charlie = generateKeypair();

      const keyAliceBob = getConversationKey(alice.privateKeyHex, bob.publicKeyHex);
      const keyAliceCharlie = getConversationKey(alice.privateKeyHex, charlie.publicKeyHex);

      expect(keyAliceBob).not.toEqual(keyAliceCharlie);
    });
  });

  describe('reservation message scenario', () => {
    test('encrypts and decrypts a reservation request', () => {
      const concierge = generateKeypair();
      const restaurant = generateKeypair();

      const reservationRequest = JSON.stringify({
        party_size: 4,
        iso_time: '2025-10-21T19:00:00-07:00',
        notes: 'Window seat please',
        contact: 'user@example.com',
      });

      // Concierge encrypts for restaurant
      const encrypted = encryptMessage(
        reservationRequest,
        concierge.privateKeyHex,
        restaurant.publicKeyHex
      );

      // Restaurant decrypts from concierge
      const decrypted = decryptMessage(
        encrypted,
        restaurant.privateKeyHex,
        concierge.publicKeyHex
      );

      const parsed = JSON.parse(decrypted);
      expect(parsed.party_size).toBe(4);
      expect(parsed.notes).toBe('Window seat please');
    });

    test('encrypts and decrypts a reservation response', () => {
      const concierge = generateKeypair();
      const restaurant = generateKeypair();

      const reservationResponse = JSON.stringify({
        status: 'confirmed',
        table: '12',
        message: 'Your reservation is confirmed!',
      });

      // Restaurant encrypts for concierge
      const encrypted = encryptMessage(
        reservationResponse,
        restaurant.privateKeyHex,
        concierge.publicKeyHex
      );

      // Concierge decrypts from restaurant
      const decrypted = decryptMessage(
        encrypted,
        concierge.privateKeyHex,
        restaurant.publicKeyHex
      );

      const parsed = JSON.parse(decrypted);
      expect(parsed.status).toBe('confirmed');
      expect(parsed.table).toBe('12');
    });
  });
});
