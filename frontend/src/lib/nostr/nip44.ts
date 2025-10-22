/**
 * NIP-44: Versioned Encryption for Nostr Messages
 * 
 * Provides authenticated encryption for direct messages and rumor content.
 * Uses xchacha20-poly1305 for encryption and HKDF-SHA256 for key derivation.
 * 
 * @see https://github.com/nostr-protocol/nips/blob/master/44.md
 */

import { getConversationKey as getConversationKeyFromLib, encrypt as encryptLib, decrypt as decryptLib } from "nostr-tools/nip44";
import { hexToBytes } from '@noble/hashes/utils';

/**
 * Derives a shared conversation key from a private key and public key using ECDH + HKDF.
 * This key is used for encrypting/decrypting messages between two parties.
 * 
 * @param privateKey - The sender's/receiver's 32-byte private key (hex string)
 * @param publicKey - The other party's 32-byte hex public key
 * @returns 32-byte conversation key
 */
export function getConversationKey(privateKey: string, publicKey: string): Uint8Array {
  const privateKeyBytes = hexToBytes(privateKey);
  return getConversationKeyFromLib(privateKeyBytes, publicKey);
}

/**
 * Encrypts plaintext using NIP-44 v2 encryption.
 * Returns base64-encoded payload: [version_byte][nonce][ciphertext][mac]
 * 
 * @param plaintext - The message to encrypt (UTF-8 string)
 * @param conversationKey - 32-byte shared key from getConversationKey()
 * @param nonce - Optional 32-byte nonce (randomly generated if not provided)
 * @returns Base64-encoded encrypted payload
 */
export function encrypt(plaintext: string, conversationKey: Uint8Array, nonce?: Uint8Array): string {
  return encryptLib(plaintext, conversationKey, nonce);
}

/**
 * Decrypts a NIP-44 v2 encrypted payload.
 * 
 * @param payload - Base64-encoded encrypted payload from encrypt()
 * @param conversationKey - 32-byte shared key from getConversationKey()
 * @returns Decrypted plaintext (UTF-8 string)
 * @throws Error if payload is malformed or MAC verification fails
 */
export function decrypt(payload: string, conversationKey: Uint8Array): string {
  return decryptLib(payload, conversationKey);
}

/**
 * Encrypts a message from sender to recipient.
 * Convenience function that derives the conversation key and encrypts in one call.
 * 
 * @param plaintext - The message to encrypt
 * @param senderPrivateKey - Sender's 32-byte private key (hex string)
 * @param recipientPublicKey - Recipient's 32-byte hex public key
 * @returns Base64-encoded encrypted payload
 */
export function encryptMessage(
  plaintext: string,
  senderPrivateKey: string,
  recipientPublicKey: string
): string {
  const senderPrivateKeyBytes = hexToBytes(senderPrivateKey);
  const conversationKey = getConversationKeyFromLib(senderPrivateKeyBytes, recipientPublicKey);
  return encrypt(plaintext, conversationKey);
}

/**
 * Decrypts a message sent to recipient from sender.
 * Convenience function that derives the conversation key and decrypts in one call.
 * 
 * @param payload - Base64-encoded encrypted payload
 * @param recipientPrivateKey - Recipient's 32-byte private key (hex string)
 * @param senderPublicKey - Sender's 32-byte hex public key
 * @returns Decrypted plaintext
 * @throws Error if decryption fails
 */
export function decryptMessage(
  payload: string,
  recipientPrivateKey: string,
  senderPublicKey: string
): string {
  const recipientPrivateKeyBytes = hexToBytes(recipientPrivateKey);
  const conversationKey = getConversationKeyFromLib(recipientPrivateKeyBytes, senderPublicKey);
  return decrypt(payload, conversationKey);
}
