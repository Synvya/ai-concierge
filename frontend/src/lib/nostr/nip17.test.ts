/**
 * Tests for NIP-17 DM relay event functionality
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildDmRelayEvent, publishDmRelayEvent } from './nip17';
import * as relayPool from './relayPool';

// Mock relayPool
vi.mock('./relayPool');

describe('NIP-17 DM Relay Events', () => {
  describe('buildDmRelayEvent', () => {
    const testRelays = [
      'wss://relay.damus.io',
      'wss://relay.snort.social',
      'wss://nos.lol',
    ];

    test('builds a valid kind 10050 event template', () => {
      const event = buildDmRelayEvent(testRelays);

      expect(event.kind).toBe(10050);
      expect(event.content).toBe('');
      expect(event.created_at).toBeGreaterThan(0);
      expect(event.tags).toBeDefined();
    });

    test('includes relay tags for each relay URL', () => {
      const event = buildDmRelayEvent(testRelays);

      const relayTags = event.tags.filter((tag) => tag[0] === 'relay');
      expect(relayTags).toHaveLength(3);
      expect(relayTags[0][1]).toBe(testRelays[0]);
      expect(relayTags[1][1]).toBe(testRelays[1]);
      expect(relayTags[2][1]).toBe(testRelays[2]);
    });

    test('handles single relay URL', () => {
      const singleRelay = ['wss://relay.damus.io'];
      const event = buildDmRelayEvent(singleRelay);

      const relayTags = event.tags.filter((tag) => tag[0] === 'relay');
      expect(relayTags).toHaveLength(1);
      expect(relayTags[0][1]).toBe(singleRelay[0]);
    });

    test('handles empty relay array', () => {
      const event = buildDmRelayEvent([]);

      const relayTags = event.tags.filter((tag) => tag[0] === 'relay');
      expect(relayTags).toHaveLength(0);
    });

    test('handles multiple relay URLs', () => {
      const manyRelays = [
        'wss://relay.damus.io',
        'wss://relay.snort.social',
        'wss://nos.lol',
        'wss://relay.nostr.band',
        'wss://purplepag.es',
      ];
      const event = buildDmRelayEvent(manyRelays);

      const relayTags = event.tags.filter((tag) => tag[0] === 'relay');
      expect(relayTags).toHaveLength(5);
      manyRelays.forEach((relay, index) => {
        expect(relayTags[index][1]).toBe(relay);
      });
    });

    test('has empty content', () => {
      const event = buildDmRelayEvent(testRelays);
      expect(event.content).toBe('');
    });

    test('creates a timestamp close to current time', () => {
      const before = Math.floor(Date.now() / 1000);
      const event = buildDmRelayEvent(testRelays);
      const after = Math.floor(Date.now() / 1000);

      expect(event.created_at).toBeGreaterThanOrEqual(before);
      expect(event.created_at).toBeLessThanOrEqual(after);
    });

    test('creates tags in correct format', () => {
      const event = buildDmRelayEvent(testRelays);

      event.tags.forEach((tag) => {
        expect(Array.isArray(tag)).toBe(true);
        expect(tag.length).toBe(2);
        expect(tag[0]).toBe('relay');
        expect(typeof tag[1]).toBe('string');
        expect(tag[1]).toMatch(/^wss:\/\//);
      });
    });
  });

  describe('publishDmRelayEvent', () => {
    const testPrivateKeyHex =
      'abababababababababababababababababababababababababababababababab';
    const testRelays = [
      'wss://relay.damus.io',
      'wss://nos.lol',
      'wss://relay.nostr.band',
    ];

    let publishToRelaysMock: ReturnType<typeof vi.fn>;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      publishToRelaysMock = vi.fn().mockResolvedValue(undefined);
      vi.mocked(relayPool.publishToRelays).mockImplementation(publishToRelaysMock);
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.clearAllMocks();
      consoleLogSpy.mockRestore();
    });

    test('publishes event to specified relays', async () => {
      await publishDmRelayEvent(testPrivateKeyHex, testRelays);

      expect(publishToRelaysMock).toHaveBeenCalledTimes(1);
      const [event, relays] = publishToRelaysMock.mock.calls[0];
      
      expect(event.kind).toBe(10050);
      expect(relays).toEqual(testRelays);
    });

    test('publishes event to default relays when not specified', async () => {
      await publishDmRelayEvent(testPrivateKeyHex);

      expect(publishToRelaysMock).toHaveBeenCalledTimes(1);
      const [event, relays] = publishToRelaysMock.mock.calls[0];
      
      expect(event.kind).toBe(10050);
      expect(Array.isArray(relays)).toBe(true);
      expect(relays.length).toBeGreaterThan(0);
    });

    test('signs event with provided private key', async () => {
      await publishDmRelayEvent(testPrivateKeyHex, testRelays);

      const [event] = publishToRelaysMock.mock.calls[0];
      
      // Signed event should have id, pubkey, and sig
      expect(event.id).toBeDefined();
      expect(typeof event.id).toBe('string');
      expect(event.id.length).toBe(64); // Hex string
      
      expect(event.pubkey).toBeDefined();
      expect(typeof event.pubkey).toBe('string');
      expect(event.pubkey.length).toBe(64); // Hex string
      
      expect(event.sig).toBeDefined();
      expect(typeof event.sig).toBe('string');
      expect(event.sig.length).toBe(128); // Hex string
    });

    test('includes relay tags in published event', async () => {
      await publishDmRelayEvent(testPrivateKeyHex, testRelays);

      const [event] = publishToRelaysMock.mock.calls[0];
      
      const relayTags = event.tags.filter((tag: string[]) => tag[0] === 'relay');
      expect(relayTags).toHaveLength(testRelays.length);
      testRelays.forEach((relay, index) => {
        expect(relayTags[index][1]).toBe(relay);
      });
    });

    test('logs publication to console', async () => {
      await publishDmRelayEvent(testPrivateKeyHex, testRelays);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Published DM relay event'),
        testRelays
      );
    });

    test('handles publishing with single relay', async () => {
      const singleRelay = ['wss://relay.damus.io'];
      await publishDmRelayEvent(testPrivateKeyHex, singleRelay);

      expect(publishToRelaysMock).toHaveBeenCalledTimes(1);
      const [event, relays] = publishToRelaysMock.mock.calls[0];
      
      expect(event.kind).toBe(10050);
      expect(relays).toEqual(singleRelay);
    });

    test('handles publishing with empty relay array', async () => {
      await publishDmRelayEvent(testPrivateKeyHex, []);

      expect(publishToRelaysMock).toHaveBeenCalledTimes(1);
      const [event, relays] = publishToRelaysMock.mock.calls[0];
      
      expect(event.kind).toBe(10050);
      expect(relays).toEqual([]);
    });

    test('throws error if publishing fails', async () => {
      const error = new Error('Failed to publish');
      publishToRelaysMock.mockRejectedValue(error);

      await expect(publishDmRelayEvent(testPrivateKeyHex, testRelays)).rejects.toThrow(
        'Failed to publish'
      );
    });
  });
});

