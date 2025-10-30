/**
 * Tests for NIP-59 Gift Wrap
 */

import { describe, it, expect } from "vitest";
import { generateKeypair } from "./keys";
import type { Event } from "nostr-tools";
import {
    createRumor,
    createSeal,
    createWrap,
    wrapEvent,
    unwrapEvent,
    unwrapManyEvents,
    createGiftWrappedMessage,
    unwrapAndDecrypt,
    isGiftWrap,
    isSeal,
    type Rumor,
} from "./nip59";
import { encryptMessage, decryptMessage } from "./nip44";

describe("nip59", () => {
    describe("createRumor", () => {
        it("creates a rumor from a partial event", () => {
            const keypair = generateKeypair();

            const rumor = createRumor(
                {
                    kind: 9901,
                    content: "encrypted-content",
                    tags: [["p", keypair.publicKeyHex]],
                    created_at: Math.floor(Date.now() / 1000),
                },
                keypair.privateKeyHex
            );

            expect(rumor).toHaveProperty("id");
            expect(rumor).toHaveProperty("pubkey");
            expect(rumor).toHaveProperty("kind", 9901);
            expect(rumor).toHaveProperty("content", "encrypted-content");
            expect(rumor).not.toHaveProperty("sig"); // Rumors are unsigned
        });

        it("generates different ids for different content", () => {
            const keypair = generateKeypair();

            const rumor1 = createRumor(
                {
                    kind: 9901,
                    content: "content-1",
                    tags: [],
                    created_at: 1000,
                },
                keypair.privateKeyHex
            );

            const rumor2 = createRumor(
                {
                    kind: 9901,
                    content: "content-2",
                    tags: [],
                    created_at: 1000,
                },
                keypair.privateKeyHex
            );

            expect(rumor1.id).not.toBe(rumor2.id);
        });
    });

    describe("createSeal", () => {
        it("creates a seal (kind 13) from a rumor", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const rumor = createRumor(
                {
                    kind: 9901,
                    content: "test",
                    tags: [],
                    created_at: Math.floor(Date.now() / 1000),
                },
                sender.privateKeyHex
            );

            const seal = createSeal(rumor, sender.privateKeyHex, recipient.publicKeyHex);

            expect(seal.kind).toBe(13);
            expect(seal).toHaveProperty("id");
            expect(seal).toHaveProperty("sig"); // Seals are signed
            expect(seal).toHaveProperty("pubkey");
            expect(seal.content).toBeTruthy(); // Contains encrypted rumor
        });
    });

    describe("createWrap", () => {
        it("creates a gift wrap (kind 1059) from a seal", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const rumor = createRumor(
                {
                    kind: 9901,
                    content: "test",
                    tags: [],
                    created_at: Math.floor(Date.now() / 1000),
                },
                sender.privateKeyHex
            );

            const seal = createSeal(rumor, sender.privateKeyHex, recipient.publicKeyHex);
            const wrap = createWrap(seal, recipient.publicKeyHex);

            expect(wrap.kind).toBe(1059);
            expect(wrap).toHaveProperty("id");
            expect(wrap).toHaveProperty("sig");
            expect(wrap.content).toBeTruthy();

            // Check for 'p' tag pointing to recipient
            const pTag = wrap.tags.find((tag) => tag[0] === "p");
            expect(pTag).toBeTruthy();
            expect(pTag?.[1]).toBe(recipient.publicKeyHex);
        });

        it("uses random ephemeral key for gift wrap", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const rumor = createRumor(
                {
                    kind: 9901,
                    content: "test",
                    tags: [],
                    created_at: Math.floor(Date.now() / 1000),
                },
                sender.privateKeyHex
            );

            const seal = createSeal(rumor, sender.privateKeyHex, recipient.publicKeyHex);
            const wrap = createWrap(seal, recipient.publicKeyHex);

            // Gift wrap should NOT use sender's real pubkey
            expect(wrap.pubkey).not.toBe(sender.publicKeyHex);
        });
    });

    describe("wrapEvent", () => {
        it("performs full three-layer wrapping in one call", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const wrap = wrapEvent(
                {
                    kind: 9901,
                    content: "test-content",
                    tags: [["p", recipient.publicKeyHex]],
                    created_at: Math.floor(Date.now() / 1000),
                },
                sender.privateKeyHex,
                recipient.publicKeyHex
            );

            expect(wrap.kind).toBe(1059);
            expect(wrap).toHaveProperty("id");
            expect(wrap).toHaveProperty("sig");
        });
    });

    describe("unwrapEvent", () => {
        it("unwraps a gift-wrapped event to extract the rumor", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const originalContent = "secret-message";

            const wrap = wrapEvent(
                {
                    kind: 9901,
                    content: originalContent,
                    tags: [["t", "test"]],
                    created_at: 1000,
                },
                sender.privateKeyHex,
                recipient.publicKeyHex
            );

            const rumor = unwrapEvent(wrap, recipient.privateKeyHex);

            expect(rumor.kind).toBe(32101);
            expect(rumor.content).toBe(originalContent);
            expect(rumor.created_at).toBe(1000);
            expect(rumor.tags).toContainEqual(["t", "test"]);
        });

        it("full wrap/unwrap cycle preserves event data", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const originalEvent = {
                kind: 32102,
                content: "response-content",
                tags: [
                    ["e", "parent-event-id", "", "root"],
                    ["p", recipient.publicKeyHex],
                ],
                created_at: 1234567890,
            };

            const wrap = wrapEvent(originalEvent, sender.privateKeyHex, recipient.publicKeyHex);
            const rumor = unwrapEvent(wrap, recipient.privateKeyHex);

            expect(rumor.kind).toBe(originalEvent.kind);
            expect(rumor.content).toBe(originalEvent.content);
            expect(rumor.created_at).toBe(originalEvent.created_at);
            expect(rumor.tags).toEqual(originalEvent.tags);
            expect(rumor.pubkey).toBe(sender.publicKeyHex);
        });

        it("throws error when wrong recipient tries to unwrap", () => {
            const sender = generateKeypair();
            const bob = generateKeypair();
            const charlie = generateKeypair();

            const wrap = wrapEvent(
                {
                    kind: 9901,
                    content: "for-bob-only",
                    tags: [],
                    created_at: Math.floor(Date.now() / 1000),
                },
                sender.privateKeyHex,
                bob.publicKeyHex
            );

            // Charlie tries to unwrap a message meant for Bob
            expect(() => unwrapEvent(wrap, charlie.privateKeyHex)).toThrow();
        });
    });

    describe("unwrapManyEvents", () => {
        it("unwraps multiple gift-wrapped events", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const wraps = [
                wrapEvent(
                    { kind: 32101, content: "msg-1", tags: [], created_at: 1000 },
                    sender.privateKeyHex,
                    recipient.publicKeyHex
                ),
                wrapEvent(
                    { kind: 32101, content: "msg-2", tags: [], created_at: 2000 },
                    sender.privateKeyHex,
                    recipient.publicKeyHex
                ),
                wrapEvent(
                    { kind: 32102, content: "msg-3", tags: [], created_at: 3000 },
                    sender.privateKeyHex,
                    recipient.publicKeyHex
                ),
            ];

            const rumors = unwrapManyEvents(wraps, recipient.privateKeyHex);

            expect(rumors).toHaveLength(3);
            expect(rumors[0].content).toBe("msg-1");
            expect(rumors[1].content).toBe("msg-2");
            expect(rumors[2].content).toBe("msg-3");
        });

        it("skips events that fail to unwrap", () => {
            const sender = generateKeypair();
            const bob = generateKeypair();
            const charlie = generateKeypair();

            const wraps = [
                wrapEvent(
                    { kind: 32101, content: "for-bob-1", tags: [], created_at: 1000 },
                    sender.privateKeyHex,
                    bob.publicKeyHex
                ),
                wrapEvent(
                    { kind: 32101, content: "for-bob-2", tags: [], created_at: 2000 },
                    sender.privateKeyHex,
                    bob.publicKeyHex
                ),
            ];

            // Charlie tries to unwrap messages meant for Bob
            const rumors = unwrapManyEvents(wraps, charlie.privateKeyHex);

            // Should silently skip events that fail
            expect(rumors).toHaveLength(0);
        });

        it("partially unwraps mixed recipient events", () => {
            const sender = generateKeypair();
            const bob = generateKeypair();
            const charlie = generateKeypair();

            const wraps = [
                wrapEvent(
                    { kind: 32101, content: "for-bob", tags: [], created_at: 1000 },
                    sender.privateKeyHex,
                    bob.publicKeyHex
                ),
                wrapEvent(
                    { kind: 32101, content: "for-charlie", tags: [], created_at: 2000 },
                    sender.privateKeyHex,
                    charlie.publicKeyHex
                ),
            ];

            // Bob should only unwrap his message
            const bobRumors = unwrapManyEvents(wraps, bob.privateKeyHex);
            expect(bobRumors).toHaveLength(1);
            expect(bobRumors[0].content).toBe("for-bob");

            // Charlie should only unwrap his message
            const charlieRumors = unwrapManyEvents(wraps, charlie.privateKeyHex);
            expect(charlieRumors).toHaveLength(1);
            expect(charlieRumors[0].content).toBe("for-charlie");
        });
    });

    describe("createGiftWrappedMessage", () => {
        it("creates a gift-wrapped message with encrypted JSON payload", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const payload = {
                party_size: 4,
                iso_time: "2025-10-20T19:00:00-07:00",
                notes: "Window seat please",
            };

            const wrap = createGiftWrappedMessage(
                32101,
                payload,
                sender.privateKeyHex,
                recipient.publicKeyHex
            );

            expect(wrap.kind).toBe(1059);
            expect(wrap).toHaveProperty("id");
            expect(wrap).toHaveProperty("sig");

            // Check 'p' tag
            const pTag = wrap.tags.find((tag) => tag[0] === "p");
            expect(pTag?.[1]).toBe(recipient.publicKeyHex);
        });

        it("includes additional tags in the rumor", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const payload = { test: "data" };

            const wrap = createGiftWrappedMessage(
                32101,
                payload,
                sender.privateKeyHex,
                recipient.publicKeyHex,
                [
                    ["e", "parent-event-id", "", "root"],
                    ["t", "reservation"],
                ]
            );

            // Unwrap to check the rumor has additional tags
            const rumor = unwrapEvent(wrap, recipient.privateKeyHex);

            expect(rumor.tags).toContainEqual(["e", "parent-event-id", "", "root"]);
            expect(rumor.tags).toContainEqual(["t", "reservation"]);
        });

        it("encrypts payload so it's not readable in transit", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const payload = { secret: "password123" };

            const wrap = createGiftWrappedMessage(
                32101,
                payload,
                sender.privateKeyHex,
                recipient.publicKeyHex
            );

            // The wrap content should be encrypted, not plain JSON
            expect(wrap.content).not.toContain("password123");
            expect(wrap.content).not.toContain("secret");

            // But it should be decryptable by the recipient
            const rumor = unwrapEvent(wrap, recipient.privateKeyHex);
            const decrypted = decryptMessage(
                rumor.content,
                recipient.privateKeyHex,
                rumor.pubkey
            );
            const parsed = JSON.parse(decrypted);

            expect(parsed.secret).toBe("password123");
        });
    });

    describe("unwrapAndDecrypt", () => {
        it("unwraps and decrypts a gift-wrapped message", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const payload = {
                party_size: 2,
                iso_time: "2025-10-22T20:00:00-07:00",
                notes: "Allergic to peanuts",
            };

            const wrap = createGiftWrappedMessage(
                32101,
                payload,
                sender.privateKeyHex,
                recipient.publicKeyHex
            );

            const { rumor, payload: decryptedPayload } = unwrapAndDecrypt(
                wrap,
                recipient.privateKeyHex
            );

            expect(rumor.kind).toBe(32101);
            expect(rumor.pubkey).toBe(sender.publicKeyHex);
            expect(decryptedPayload).toEqual(payload);
        });

        it("preserves complex nested JSON structures", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const payload = {
                request: {
                    party_size: 6,
                    iso_time: "2025-12-31T23:59:59Z",
                    preferences: ["vegetarian", "gluten-free"],
                    contact: {
                        email: "alice@example.com",
                        phone: "+1-555-0100",
                    },
                },
                metadata: {
                    app_version: "1.0.0",
                    platform: "web",
                },
            };

            const wrap = createGiftWrappedMessage(
                32101,
                payload,
                sender.privateKeyHex,
                recipient.publicKeyHex
            );

            const { payload: decryptedPayload } = unwrapAndDecrypt(wrap, recipient.privateKeyHex);

            expect(decryptedPayload).toEqual(payload);
        });

        it("handles unicode in payload", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const payload = {
                message: "Réservation pour 4 personnes 🍽️",
                restaurant: "Café François",
                emoji: "🎉🎊🥳",
            };

            const wrap = createGiftWrappedMessage(
                32101,
                payload,
                sender.privateKeyHex,
                recipient.publicKeyHex
            );

            const { payload: decryptedPayload } = unwrapAndDecrypt(wrap, recipient.privateKeyHex);

            expect(decryptedPayload).toEqual(payload);
        });
    });

    describe("Type guards", () => {
        it("isGiftWrap identifies kind 1059 events", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const wrap = wrapEvent(
                { kind: 32101, content: "test", tags: [], created_at: 1000 },
                sender.privateKeyHex,
                recipient.publicKeyHex
            );

            expect(isGiftWrap(wrap)).toBe(true);

            const notGiftWrap = { kind: 1, content: "test" } as Event;
            expect(isGiftWrap(notGiftWrap)).toBe(false);
        });

        it("isSeal identifies kind 13 events", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const rumor = createRumor(
                { kind: 32101, content: "test", tags: [], created_at: 1000 },
                sender.privateKeyHex
            );

            const seal = createSeal(rumor, sender.privateKeyHex, recipient.publicKeyHex);

            expect(isSeal(seal)).toBe(true);

            const notSeal = { kind: 1059, content: "test" } as Event;
            expect(isSeal(notSeal)).toBe(false);
        });
    });

    describe("End-to-end reservation flow", () => {
        it("simulates a full reservation request/response cycle", () => {
            // Alice (client) and Bob (restaurant)
            const alice = generateKeypair();
            const bob = generateKeypair();

            // Alice creates a reservation request
            const reservationRequest = {
                party_size: 4,
                iso_time: "2025-10-23T19:00:00-07:00",
                notes: "Anniversary dinner, prefer quiet table",
            };

            const requestWrap = createGiftWrappedMessage(
                32101, // kind: reservation.request
                reservationRequest,
                alice.privateKeyHex,
                bob.publicKeyHex
            );

            // Bob receives and decrypts the request
            const { rumor: requestRumor, payload: receivedRequest } = unwrapAndDecrypt(
                requestWrap,
                bob.privateKeyHex
            );

            expect(receivedRequest).toEqual(reservationRequest);
            expect(requestRumor.pubkey).toBe(alice.publicKeyHex);

            // Bob creates a response (confirmed)
            const reservationResponse = {
                status: "confirmed",
                confirmation_code: "ABC123",
                iso_time: "2025-10-23T19:00:00-07:00",
                party_size: 4,
                notes: "Table reserved by the window. Looking forward to hosting you!",
            };

            const responseWrap = createGiftWrappedMessage(
                32102, // kind: reservation.response
                reservationResponse,
                bob.privateKeyHex,
                alice.publicKeyHex,
                [["e", requestRumor.id, "", "root"]] // Reference original request
            );

            // Alice receives and decrypts the response
            const { rumor: responseRumor, payload: receivedResponse } = unwrapAndDecrypt(
                responseWrap,
                alice.privateKeyHex
            );

            expect(receivedResponse).toEqual(reservationResponse);
            expect(responseRumor.pubkey).toBe(bob.publicKeyHex);

            // Check that response references original request
            const eTag = responseRumor.tags.find((tag) => tag[0] === "e");
            expect(eTag?.[1]).toBe(requestRumor.id);
        });
    });
});

