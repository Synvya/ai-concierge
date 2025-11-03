/**
 * Reservation Messenger Service
 * 
 * Handles relay subscriptions for incoming gift-wrapped reservation messages.
 * Listens for kind 1059 events, unwraps them, and parses reservation requests/responses.
 */

import type { Event } from "nostr-tools";
import type { SubCloser } from "nostr-tools/abstract-pool";
import { getPool } from "../lib/nostr/relayPool";
import { unwrapEvent, type Rumor } from "../lib/nostr/nip59";
import {
    parseReservationRequest,
    parseReservationResponse,
    parseReservationModificationRequest,
} from "../lib/nostr/reservationEvents";
import type { ReservationRequest, ReservationResponse, ReservationModificationRequest, ReservationModificationResponse } from "../types/reservation";

/**
 * Parsed reservation message with metadata
 */
export interface ReservationMessage {
    /** The unwrapped rumor event */
    rumor: Rumor;
    /** Message type (request, response, modification_request, or modification_response) */
    type: "request" | "response" | "modification_request" | "modification_response";
    /** Parsed payload */
    payload: ReservationRequest | ReservationResponse | ReservationModificationRequest | ReservationModificationResponse;
    /** Sender's public key */
    senderPubkey: string;
    /** Original gift wrap event */
    giftWrap: Event;
}

/**
 * Callback for new reservation messages
 */
export type ReservationMessageCallback = (message: ReservationMessage) => void;

/**
 * Callback for errors during message processing
 */
export type ReservationErrorCallback = (error: Error, event?: Event) => void;

/**
 * Configuration for reservation subscription
 */
export interface ReservationSubscriptionConfig {
    /** Relay URLs to subscribe to */
    relays: string[];
    /** User's private key in hex format for decryption */
    privateKey: string;
    /** User's public key in hex format (for filtering) */
    publicKey: string;
    /** Callback for new messages */
    onMessage: ReservationMessageCallback;
    /** Optional callback for errors */
    onError?: ReservationErrorCallback;
    /** Optional callback when subscription is active */
    onReady?: () => void;
    /** Optional: Number of seconds to look back for historical messages (default: 30 days) */
    historySince?: number;
}

/**
 * Active subscription manager
 */
export class ReservationSubscription {
    private config: ReservationSubscriptionConfig;
    private subscription: SubCloser | null = null;
    private isStarted = false;
    private isReady = false;

    constructor(config: ReservationSubscriptionConfig) {
        this.config = config;
    }

    /**
     * Starts the subscription to relay(s)
     */
    start(): void {
        if (this.isStarted) {
            console.warn("Reservation subscription already active");
            return;
        }

        const pool = getPool();
        const { relays, publicKey, privateKey, onMessage, onError, onReady, historySince } = this.config;

        // Calculate the 'since' timestamp for historical messages
        // Default to 30 days ago if not specified
        const defaultHistorySeconds = 30 * 24 * 60 * 60; // 30 days in seconds
        const historyWindow = historySince ?? defaultHistorySeconds;
        const sinceTimestamp = Math.floor(Date.now() / 1000) - historyWindow;

        // Subscribe to gift wrap events addressed to this user
        this.subscription = pool.subscribeMany(
            relays,
            {
                kinds: [1059], // Gift wrap
                "#p": [publicKey], // Addressed to user
                since: sinceTimestamp, // Fetch historical messages
            },
            {
                onevent: (event: Event) => {
                    console.log('[ReservationMessenger] Received gift wrap event:', event.id, 'kind:', event.kind, 'from:', event.pubkey);
                    this.handleEvent(event, privateKey, onMessage, onError);
                },
                oneose: () => {
                    // End of stored events - subscription is now ready
                    if (!this.isReady) {
                        this.isReady = true;
                        onReady?.();
                    }
                },
            }
        );

        this.isStarted = true;
    }

    /**
     * Stops the subscription
     */
    stop(): void {
        if (this.subscription) {
            this.subscription.close();
            this.subscription = null;
        }
        this.isStarted = false;
        this.isReady = false;
    }

    /**
     * Whether the subscription has been started
     */
    get active(): boolean {
        return this.isStarted;
    }

    /**
     * Whether the subscription has received initial events and is ready
     */
    get ready(): boolean {
        return this.isReady;
    }

    /**
     * Handles an incoming gift wrap event
     */
    private handleEvent(
        event: Event,
        privateKey: string,
        onMessage: ReservationMessageCallback,
        onError?: ReservationErrorCallback
    ): void {
        try {
            console.log('[ReservationMessenger] Unwrapping gift wrap:', event.id);
            // Unwrap the gift wrap
            const rumor = unwrapEvent(event, privateKey);
            console.log('[ReservationMessenger] Unwrapped rumor kind:', rumor.kind);

            // Determine type and parse
            if (rumor.kind === 9901) {
                // Reservation request
                const payload = parseReservationRequest(rumor, privateKey);
                onMessage({
                    rumor,
                    type: "request",
                    payload,
                    senderPubkey: rumor.pubkey,
                    giftWrap: event,
                });
            } else if (rumor.kind === 9902) {
                // Reservation response
                console.log('[ReservationMessenger] Parsing kind:9902 response');
                const payload = parseReservationResponse(rumor, privateKey);
                console.log('[ReservationMessenger] Response parsed successfully, status:', payload.status);
                onMessage({
                    rumor,
                    type: "response",
                    payload,
                    senderPubkey: rumor.pubkey,
                    giftWrap: event,
                });
                console.log('[ReservationMessenger] Response message delivered to callback');
            } else if (rumor.kind === 9903) {
                // Reservation modification request
                console.log('[ReservationMessenger] Parsing kind:9903 modification request');
                const payload = parseReservationModificationRequest(rumor, privateKey);
                console.log('[ReservationMessenger] Modification request parsed successfully');
                onMessage({
                    rumor,
                    type: "modification_request",
                    payload,
                    senderPubkey: rumor.pubkey,
                    giftWrap: event,
                });
                console.log('[ReservationMessenger] Modification request message delivered to callback');
            } else {
                // Unknown kind - ignore or log
                console.debug(`Received gift wrap with unexpected kind: ${rumor.kind}`);
            }
        } catch (error) {
            // Handle decryption or parsing errors
            const errorMessage = error instanceof Error ? error : new Error(String(error));
            
            // With Self CC (NIP-17), we publish TWO gift wraps:
            // 1. One encrypted for the recipient (merchant/customer)
            // 2. One encrypted for ourselves (Self CC)
            // When subscribing, we receive BOTH, but can only decrypt the one encrypted for us.
            // "invalid MAC" errors are expected and should be silently ignored.
            if (errorMessage.message.includes('invalid MAC')) {
                console.debug('[ReservationMessenger] Skipping gift wrap not encrypted for us (expected with Self CC)');
                return; // Silently ignore
            }
            
            // Report other errors
            console.error('[ReservationMessenger] Error handling event:', errorMessage);
            onError?.(errorMessage, event);
        }
    }
}

/**
 * Creates and starts a reservation subscription
 * 
 * @param config - Subscription configuration
 * @returns Active subscription instance
 * 
 * @example
 * ```typescript
 * const subscription = startReservationSubscription({
 *   relays: ["wss://relay.damus.io", "wss://nos.lol"],
 *   privateKey: userPrivateKeyHex,
 *   publicKey: userPublicKeyHex,
 *   onMessage: (message) => {
 *     if (message.type === 'request') {
 *       console.log('New reservation request:', message.payload);
 *     }
 *   },
 *   onError: (error) => {
 *     console.error('Subscription error:', error);
 *   }
 * });
 * 
 * // Later, to stop
 * subscription.stop();
 * ```
 */
export function startReservationSubscription(
    config: ReservationSubscriptionConfig
): ReservationSubscription {
    const subscription = new ReservationSubscription(config);
    subscription.start();
    return subscription;
}

/**
 * Creates a subscription but doesn't start it immediately
 * 
 * @param config - Subscription configuration
 * @returns Subscription instance (not yet started)
 * 
 * @example
 * ```typescript
 * const subscription = createReservationSubscription({
 *   relays: relayList,
 *   privateKey: keyHex,
 *   publicKey: pubkeyHex,
 *   onMessage: handleMessage
 * });
 * 
 * // Start when ready
 * subscription.start();
 * ```
 */
export function createReservationSubscription(
    config: ReservationSubscriptionConfig
): ReservationSubscription {
    return new ReservationSubscription(config);
}

