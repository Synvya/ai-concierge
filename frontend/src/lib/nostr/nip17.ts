/**
 * NIP-17: Private Direct Messages
 * Implements DM relay event (kind 10050) publishing
 */

import { finalizeEvent, type EventTemplate, type UnsignedEvent } from 'nostr-tools/pure';
import { publishToRelays } from './relayPool';
import { DEFAULT_RELAYS } from './relays';

/**
 * Build a NIP-17 DM Relay event (kind 10050)
 * 
 * This event indicates the user's preferred relays to receive DMs.
 * According to NIP-17, this event MUST include a list of relay tags with relay URIs.
 * 
 * @param relayUrls - Array of relay URLs to include as preferred DM relays
 * @returns EventTemplate for kind 10050
 */
export function buildDmRelayEvent(relayUrls: string[]): EventTemplate {
  const tags: string[][] = relayUrls.map((url) => ['relay', url]);
  
  return {
    kind: 10050,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
  };
}

/**
 * Publish a DM relay event to announce preferred DM relays
 * 
 * This should be called when:
 * - User identity is first created
 * - Relay configuration changes
 * - On app initialization to ensure relays are up-to-date
 * 
 * @param privateKeyHex - User's private key in hex format
 * @param relayUrls - Array of relay URLs (defaults to DEFAULT_RELAYS)
 * @returns Promise that resolves when event is published
 */
export async function publishDmRelayEvent(
  privateKeyHex: string,
  relayUrls: string[] = DEFAULT_RELAYS
): Promise<void> {
  // Build the event template
  const template = buildDmRelayEvent(relayUrls);
  
  // Convert hex private key to Uint8Array
  const privateKey = Uint8Array.from(Buffer.from(privateKeyHex, 'hex'));
  
  // Sign the event
  const signedEvent = finalizeEvent(template as UnsignedEvent, privateKey);
  
  // Publish to relays
  await publishToRelays(signedEvent, relayUrls);
  
  console.log('Published DM relay event (kind 10050) to relays:', relayUrls);
}

