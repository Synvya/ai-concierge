/**
 * Tests for Reservation Messenger Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateKeypair } from "../lib/nostr/keys";
import type { Event } from "nostr-tools";
import {
    ReservationSubscription,
    startReservationSubscription,
    createReservationSubscription,
    type ReservationMessage,
} from "./reservationMessenger";
import { wrapEvent } from "../lib/nostr/nip59";
import { buildReservationRequest, buildReservationResponse } from "../lib/nostr/reservationEvents";
import type { ReservationRequest, ReservationResponse } from "../types/reservation";
import { getPool } from "../lib/nostr/relayPool";

// Mock the relay pool
vi.mock("../lib/nostr/relayPool", () => ({
    getPool: vi.fn(),
    publishToRelays: vi.fn(),
}));

describe("reservationMessenger", () => {
    let mockSubscription: {
        close: (reason?: string) => void;
    };

    let mockPool: any;

    beforeEach(() => {
        mockSubscription = {
            close: vi.fn(),
        };

        mockPool = {
            subscribeMany: vi.fn(() => mockSubscription),
        };

        vi.mocked(getPool).mockReturnValue(mockPool);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe("ReservationSubscription", () => {
        it("creates subscription with config", () => {
            const user = generateKeypair();

            const subscription = new ReservationSubscription({
                relays: ["wss://relay.example.com"],
                privateKey: user.privateKeyHex,
                publicKey: user.publicKeyHex,
                onMessage: vi.fn(),
            });

            expect(subscription).toBeInstanceOf(ReservationSubscription);
            expect(subscription.active).toBe(false);
        });

        it("starts subscription to relays", () => {
            const user = generateKeypair();

            const subscription = new ReservationSubscription({
                relays: ["wss://relay1.com", "wss://relay2.com"],
                privateKey: user.privateKeyHex,
                publicKey: user.publicKeyHex,
                onMessage: vi.fn(),
            });

            subscription.start();

            expect(mockPool.subscribeMany).toHaveBeenCalledWith(
                ["wss://relay1.com", "wss://relay2.com"],
                expect.objectContaining({
                    kinds: [1059],
                    "#p": [user.publicKeyHex],
                    since: expect.any(Number), // Should include since for historical messages
                }),
                expect.objectContaining({
                    onevent: expect.any(Function),
                    oneose: expect.any(Function),
                })
            );
        });

        it("uses custom historySince parameter", () => {
            const user = generateKeypair();
            const customHistorySeconds = 7 * 24 * 60 * 60; // 7 days

            const subscription = new ReservationSubscription({
                relays: ["wss://relay1.com"],
                privateKey: user.privateKeyHex,
                publicKey: user.publicKeyHex,
                onMessage: vi.fn(),
                historySince: customHistorySeconds,
            });

            subscription.start();

            // Calculate expected timestamp
            const expectedSince = Math.floor(Date.now() / 1000) - customHistorySeconds;

            const callArgs = (mockPool.subscribeMany as any).mock.calls[0];
            const filter = callArgs[1];
            
            // Should be within 1 second of expected (accounting for test execution time)
            expect(filter.since).toBeGreaterThanOrEqual(expectedSince - 1);
            expect(filter.since).toBeLessThanOrEqual(expectedSince + 1);
        });

        it("doesn't start twice if already active", () => {
            const user = generateKeypair();
            const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });

            const subscription = new ReservationSubscription({
                relays: ["wss://relay.example.com"],
                privateKey: user.privateKeyHex,
                publicKey: user.publicKeyHex,
                onMessage: vi.fn(),
            });

            subscription.start();
            subscription.start(); // Try to start again

            expect(consoleWarnSpy).toHaveBeenCalledWith(
                "Reservation subscription already active"
            );
            expect(mockPool.subscribeMany).toHaveBeenCalledTimes(1);

            consoleWarnSpy.mockRestore();
        });

        it("stops subscription", () => {
            const user = generateKeypair();

            const subscription = new ReservationSubscription({
                relays: ["wss://relay.example.com"],
                privateKey: user.privateKeyHex,
                publicKey: user.publicKeyHex,
                onMessage: vi.fn(),
            });

            subscription.start();
            expect(subscription.active).toBe(true); // Active after start
            expect(subscription.ready).toBe(false); // Not ready until oneose

            subscription.stop();

            expect(mockSubscription.close).toHaveBeenCalled();
            expect(subscription.active).toBe(false);
            expect(subscription.ready).toBe(false);
        });

        it("calls onReady when subscription becomes ready", () => {
            const user = generateKeypair();
            const onReady = vi.fn();

            const subscription = new ReservationSubscription({
                relays: ["wss://relay.example.com"],
                privateKey: user.privateKeyHex,
                publicKey: user.publicKeyHex,
                onMessage: vi.fn(),
                onReady,
            });

            subscription.start();
            expect(subscription.active).toBe(true);
            expect(subscription.ready).toBe(false);

            // Get the options passed to subscribeMany
            const options = mockPool.subscribeMany.mock.calls[0][2];

            // Simulate end of stored events
            options.oneose();

            expect(onReady).toHaveBeenCalled();
            expect(subscription.ready).toBe(true);
        });

        it("processes incoming reservation request", () => {
            const restaurant = generateKeypair();
            const concierge = generateKeypair();

            const onMessage = vi.fn();

            const subscription = new ReservationSubscription({
                relays: ["wss://relay.example.com"],
                privateKey: restaurant.privateKeyHex,
                publicKey: restaurant.publicKeyHex,
                onMessage,
            });

            subscription.start();

            // Create a reservation request
            const request: ReservationRequest = {
                party_size: 2,
                iso_time: "2025-10-20T19:00:00-07:00",
                notes: "Window seat",
            };

            const requestTemplate = buildReservationRequest(
                request,
                concierge.privateKeyHex,
                restaurant.publicKeyHex
            );

            const giftWrap = wrapEvent(
                requestTemplate,
                concierge.privateKeyHex,
                restaurant.publicKeyHex
            );

            // Get the onevent callback
            const options = mockPool.subscribeMany.mock.calls[0][2];
            options.onevent(giftWrap);

            // Verify onMessage was called
            expect(onMessage).toHaveBeenCalled();

            const message: ReservationMessage = onMessage.mock.calls[0][0];
            expect(message.type).toBe("request");
            expect(message.senderPubkey).toBe(concierge.publicKeyHex);
            expect(message.payload).toMatchObject({
                party_size: 2,
                iso_time: "2025-10-20T19:00:00-07:00",
                notes: "Window seat",
            });
            expect(message.rumor.kind).toBe(9901);
            expect(message.giftWrap).toBe(giftWrap);
        });

        it("processes incoming reservation response", () => {
            const concierge = generateKeypair();
            const restaurant = generateKeypair();

            const onMessage = vi.fn();

            const subscription = new ReservationSubscription({
                relays: ["wss://relay.example.com"],
                privateKey: concierge.privateKeyHex,
                publicKey: concierge.publicKeyHex,
                onMessage,
            });

            subscription.start();

            // Create a reservation response
            const response: ReservationResponse = {
                status: "confirmed",
                iso_time: "2025-10-20T19:00:00-07:00",
                message: "Confirmed!",
                table: "A4",
            };

            const responseTemplate = buildReservationResponse(
                response,
                restaurant.privateKeyHex,
                concierge.publicKeyHex
            );

            const giftWrap = wrapEvent(
                responseTemplate,
                restaurant.privateKeyHex,
                concierge.publicKeyHex
            );

            // Get the onevent callback
            const options = mockPool.subscribeMany.mock.calls[0][2];
            options.onevent(giftWrap);

            // Verify onMessage was called
            expect(onMessage).toHaveBeenCalled();

            const message: ReservationMessage = onMessage.mock.calls[0][0];
            expect(message.type).toBe("response");
            expect(message.senderPubkey).toBe(restaurant.publicKeyHex);
            expect(message.payload).toMatchObject({
                status: "confirmed",
                iso_time: "2025-10-20T19:00:00-07:00",
                message: "Confirmed!",
                table: "A4",
            });
            expect(message.rumor.kind).toBe(9902);
        });

        it("silently ignores invalid MAC errors (Self CC pattern)", () => {
            const user = generateKeypair();
            const wrongUser = generateKeypair(); // Different user
            const onMessage = vi.fn();
            const onError = vi.fn();
            const consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => { });

            const subscription = new ReservationSubscription({
                relays: ["wss://relay.example.com"],
                privateKey: wrongUser.privateKeyHex, // Wrong key!
                publicKey: user.publicKeyHex,
                onMessage,
                onError,
            });

            subscription.start();

            // Create a gift wrap for the correct user
            const request: ReservationRequest = {
                party_size: 2,
                iso_time: "2025-10-20T19:00:00-07:00",
            };

            const sender = generateKeypair();
            const requestTemplate = buildReservationRequest(
                request,
                sender.privateKeyHex,
                user.publicKeyHex
            );

            const giftWrap = wrapEvent(
                requestTemplate,
                sender.privateKeyHex,
                user.publicKeyHex
            );

            // Try to decrypt with wrong key (produces "invalid MAC" error)
            const options = mockPool.subscribeMany.mock.calls[0][2];
            options.onevent(giftWrap);

            // With Self CC, "invalid MAC" errors are silently ignored (expected behavior)
            // This happens when we receive Self CC copies encrypted for others
            expect(onMessage).not.toHaveBeenCalled();
            expect(onError).not.toHaveBeenCalled(); // Error should NOT be reported
            expect(consoleDebugSpy).toHaveBeenCalledWith(
                '[ReservationMessenger] Skipping gift wrap not encrypted for us (expected with Self CC)'
            );

            consoleDebugSpy.mockRestore();
        });

        it("ignores events with unexpected kinds", () => {
            const user = generateKeypair();
            const onMessage = vi.fn();
            const consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => { });

            const subscription = new ReservationSubscription({
                relays: ["wss://relay.example.com"],
                privateKey: user.privateKeyHex,
                publicKey: user.publicKeyHex,
                onMessage,
            });

            subscription.start();

            // Create a gift wrap with unexpected kind
            const sender = generateKeypair();
            const unexpectedEvent = {
                kind: 1, // Text note, not reservation
                content: "Hello",
                tags: [["p", user.publicKeyHex]],
                created_at: Math.floor(Date.now() / 1000),
            };

            const giftWrap = wrapEvent(
                unexpectedEvent,
                sender.privateKeyHex,
                user.publicKeyHex
            );

            const options = mockPool.subscribeMany.mock.calls[0][2];
            options.onevent(giftWrap);

            // Should not call onMessage
            expect(onMessage).not.toHaveBeenCalled();
            expect(consoleDebugSpy).toHaveBeenCalledWith(
                "Received gift wrap with unexpected kind: 1"
            );

            consoleDebugSpy.mockRestore();
        });
    });

    describe("startReservationSubscription", () => {
        it("creates and starts subscription", () => {
            const user = generateKeypair();

            const subscription = startReservationSubscription({
                relays: ["wss://relay.example.com"],
                privateKey: user.privateKeyHex,
                publicKey: user.publicKeyHex,
                onMessage: vi.fn(),
            });

            expect(subscription).toBeInstanceOf(ReservationSubscription);
            expect(subscription.active).toBe(true);
        });
    });

    describe("createReservationSubscription", () => {
        it("creates subscription without starting", () => {
            const user = generateKeypair();

            const subscription = createReservationSubscription({
                relays: ["wss://relay.example.com"],
                privateKey: user.privateKeyHex,
                publicKey: user.publicKeyHex,
                onMessage: vi.fn(),
            });

            expect(subscription).toBeInstanceOf(ReservationSubscription);
            expect(subscription.active).toBe(false);

            // Can start manually
            subscription.start();
            expect(subscription.active).toBe(true);
        });
    });

    describe("integration scenarios", () => {
        it("handles full request/response flow", () => {
            const concierge = generateKeypair();
            const restaurant = generateKeypair();

            const conciergeMessages: ReservationMessage[] = [];
            const restaurantMessages: ReservationMessage[] = [];

            // Concierge subscription (receives responses)
            const conciergeSubscription = new ReservationSubscription({
                relays: ["wss://relay.example.com"],
                privateKey: concierge.privateKeyHex,
                publicKey: concierge.publicKeyHex,
                onMessage: (msg) => conciergeMessages.push(msg),
            });

            // Restaurant subscription (receives requests)
            const restaurantSubscription = new ReservationSubscription({
                relays: ["wss://relay.example.com"],
                privateKey: restaurant.privateKeyHex,
                publicKey: restaurant.publicKeyHex,
                onMessage: (msg) => restaurantMessages.push(msg),
            });

            conciergeSubscription.start();
            restaurantSubscription.start();

            // 1. Concierge sends request
            const request: ReservationRequest = {
                party_size: 4,
                iso_time: "2025-10-20T19:00:00-07:00",
                notes: "Anniversary dinner",
            };

            const requestTemplate = buildReservationRequest(
                request,
                concierge.privateKeyHex,
                restaurant.publicKeyHex
            );

            const requestGiftWrap = wrapEvent(
                requestTemplate,
                concierge.privateKeyHex,
                restaurant.publicKeyHex
            );

            // Simulate restaurant receiving request
            const restaurantOptions = mockPool.subscribeMany.mock.calls[1][2];
            restaurantOptions.onevent(requestGiftWrap);

            expect(restaurantMessages).toHaveLength(1);
            expect(restaurantMessages[0].type).toBe("request");
            expect(restaurantMessages[0].payload).toMatchObject(request);

            // 2. Restaurant sends response
            const response: ReservationResponse = {
                status: "confirmed",
                iso_time: "2025-10-20T19:00:00-07:00",
                message: "Table reserved!",
                table: "A4",
            };

            const responseTemplate = buildReservationResponse(
                response,
                restaurant.privateKeyHex,
                concierge.publicKeyHex
            );

            const responseGiftWrap = wrapEvent(
                responseTemplate,
                restaurant.privateKeyHex,
                concierge.publicKeyHex
            );

            // Simulate concierge receiving response
            const conciergeOptions = mockPool.subscribeMany.mock.calls[0][2];
            conciergeOptions.onevent(responseGiftWrap);

            expect(conciergeMessages).toHaveLength(1);
            expect(conciergeMessages[0].type).toBe("response");
            expect(conciergeMessages[0].payload).toMatchObject(response);
        });
    });
});

