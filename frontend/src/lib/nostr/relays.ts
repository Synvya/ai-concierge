/**
 * Default Nostr relay configuration for the AI Concierge
 */

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
] as const;

export type RelayUrl = typeof DEFAULT_RELAYS[number];

