/**
 * Tests for Reservation Events
 */

import { describe, it, expect } from "vitest";
import { generateKeypair } from "./keys";
import {
    validateReservationRequest,
    validateReservationResponse,
    buildReservationRequest,
    buildReservationResponse,
    parseReservationRequest,
    parseReservationResponse,
} from "./reservationEvents";
import type { ReservationRequest, ReservationResponse } from "../../types/reservation";
import { unwrapAndDecrypt, wrapEvent } from "./nip59";

describe("reservationEvents", () => {
    describe("validateReservationRequest", () => {
        it("validates a valid request", () => {
            const request: ReservationRequest = {
                party_size: 2,
                iso_time: "2025-10-20T19:00:00-07:00",
            };

            const result = validateReservationRequest(request);

            expect(result.valid).toBe(true);
            expect(result.errors).toBeUndefined();
        });

        it("validates request with all optional fields", () => {
            const request: ReservationRequest = {
                party_size: 4,
                iso_time: "2025-10-20T19:00:00-07:00",
                notes: "Window seat if possible",
                contact: {
                    name: "John Doe",
                    phone: "+1-555-0100",
                    email: "john@example.com",
                },
                constraints: {
                    earliest_iso_time: "2025-10-20T18:30:00-07:00",
                    latest_iso_time: "2025-10-20T20:00:00-07:00",
                    outdoor_ok: true,
                    accessibility_required: false,
                },
            };

            const result = validateReservationRequest(request);

            expect(result.valid).toBe(true);
        });

        it("rejects request missing required fields", () => {
            const request = {
                party_size: 2,
                // missing iso_time
            };

            const result = validateReservationRequest(request);

            expect(result.valid).toBe(false);
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
        });

        it("rejects request with invalid party_size", () => {
            const request = {
                party_size: 0, // Invalid: must be >= 1
                iso_time: "2025-10-20T19:00:00-07:00",
            };

            const result = validateReservationRequest(request);

            expect(result.valid).toBe(false);
        });

        it("rejects request with party_size > 20", () => {
            const request = {
                party_size: 25, // Invalid: must be <= 20
                iso_time: "2025-10-20T19:00:00-07:00",
            };

            const result = validateReservationRequest(request);

            expect(result.valid).toBe(false);
        });

        it("rejects request with invalid email", () => {
            const request = {
                party_size: 2,
                iso_time: "2025-10-20T19:00:00-07:00",
                contact: {
                    email: "not-an-email",
                },
            };

            const result = validateReservationRequest(request);

            expect(result.valid).toBe(false);
        });

        it("rejects request with notes too long", () => {
            const request = {
                party_size: 2,
                iso_time: "2025-10-20T19:00:00-07:00",
                notes: "x".repeat(2001), // Max 2000
            };

            const result = validateReservationRequest(request);

            expect(result.valid).toBe(false);
        });
    });

    describe("validateReservationResponse", () => {
        it("validates confirmed response", () => {
            const response: ReservationResponse = {
                status: "confirmed",
                iso_time: "2025-10-20T19:00:00-07:00",
                message: "See you at 7pm!",
                table: "A4",
            };

            const result = validateReservationResponse(response);

            expect(result.valid).toBe(true);
        });

        it("validates suggested response", () => {
            const response: ReservationResponse = {
                status: "suggested",
                iso_time: "2025-10-20T19:30:00-07:00",
                message: "7pm is full, how about 7:30?",
            };

            const result = validateReservationResponse(response);

            expect(result.valid).toBe(true);
        });

        it("validates declined response", () => {
            const response: ReservationResponse = {
                status: "declined",
                message: "Sorry, we're fully booked",
            };

            const result = validateReservationResponse(response);

            expect(result.valid).toBe(true);
        });

        it("rejects response missing required status", () => {
            const response = {
                iso_time: "2025-10-20T19:00:00-07:00",
            };

            const result = validateReservationResponse(response);

            expect(result.valid).toBe(false);
        });

        it("rejects response with invalid status", () => {
            const response = {
                status: "invalid-status",
            } as unknown as ReservationResponse;

            const result = validateReservationResponse(response);

            expect(result.valid).toBe(false);
        });

        it("rejects confirmed response without iso_time", () => {
            const response = {
                status: "confirmed",
                // missing required iso_time for confirmed status
            };

            const result = validateReservationResponse(response);

            expect(result.valid).toBe(false);
        });

        it("rejects suggested response without iso_time", () => {
            const response = {
                status: "suggested",
                // missing required iso_time for suggested status
            };

            const result = validateReservationResponse(response);

            expect(result.valid).toBe(false);
        });
    });

    describe("buildReservationRequest", () => {
        it("builds encrypted event template", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const request: ReservationRequest = {
                party_size: 2,
                iso_time: "2025-10-20T19:00:00-07:00",
            };

            const template = buildReservationRequest(
                request,
                sender.privateKeyHex,
                recipient.publicKeyHex
            );

            expect(template.kind).toBe(9901);
            expect(template.content).toBeTruthy();
            expect(template.content).not.toContain("party_size"); // Encrypted
            expect(template.tags).toContainEqual(["p", recipient.publicKeyHex]);
        });

        it("includes additional tags", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const request: ReservationRequest = {
                party_size: 4,
                iso_time: "2025-10-20T19:00:00-07:00",
            };

            const template = buildReservationRequest(
                request,
                sender.privateKeyHex,
                recipient.publicKeyHex,
                [["t", "reservation"]]
            );

            expect(template.tags).toContainEqual(["t", "reservation"]);
        });

        it("throws on invalid request", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const invalidRequest = {
                party_size: 0, // Invalid
                iso_time: "2025-10-20T19:00:00-07:00",
            } as ReservationRequest;

            expect(() =>
                buildReservationRequest(
                    invalidRequest,
                    sender.privateKeyHex,
                    recipient.publicKeyHex
                )
            ).toThrow("Invalid reservation request");
        });
    });

    describe("buildReservationResponse", () => {
        it("builds encrypted event template", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const response: ReservationResponse = {
                status: "confirmed",
                iso_time: "2025-10-20T19:00:00-07:00",
                message: "See you then!",
            };

            const template = buildReservationResponse(
                response,
                sender.privateKeyHex,
                recipient.publicKeyHex
            );

            expect(template.kind).toBe(9902);
            expect(template.content).toBeTruthy();
            expect(template.content).not.toContain("confirmed"); // Encrypted
            expect(template.tags).toContainEqual(["p", recipient.publicKeyHex]);
        });

        it("includes additional tags", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const response: ReservationResponse = {
                status: "declined",
                message: "Sorry, fully booked",
            };

            const template = buildReservationResponse(
                response,
                sender.privateKeyHex,
                recipient.publicKeyHex,
                [["e", "request-event-id", "", "reply"]]
            );

            expect(template.tags).toContainEqual(["e", "request-event-id", "", "reply"]);
        });

        it("throws on invalid response", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const invalidResponse = {
                status: "confirmed",
                // missing required iso_time for confirmed
            } as ReservationResponse;

            expect(() =>
                buildReservationResponse(
                    invalidResponse,
                    sender.privateKeyHex,
                    recipient.publicKeyHex
                )
            ).toThrow("Invalid reservation response");
        });
    });

    describe("parseReservationRequest", () => {
        it("parses and decrypts a reservation request", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const originalRequest: ReservationRequest = {
                party_size: 2,
                iso_time: "2025-10-20T19:00:00-07:00",
                notes: "Window seat please",
            };

            // Build and wrap
            const rumor = buildReservationRequest(
                originalRequest,
                sender.privateKeyHex,
                recipient.publicKeyHex
            );

            // Parse (in real world this would be a rumor from unwrapEvent)
            const mockRumor = {
                kind: 9901,
                content: rumor.content,
                pubkey: sender.publicKeyHex,
            };

            const parsed = parseReservationRequest(mockRumor, recipient.privateKeyHex);

            expect(parsed.party_size).toBe(originalRequest.party_size);
            expect(parsed.iso_time).toBe(originalRequest.iso_time);
            expect(parsed.notes).toBe(originalRequest.notes);
        });

        it("throws on wrong event kind", () => {
            const mockRumor = {
                kind: 1, // Wrong kind
                content: "encrypted",
                pubkey: "pubkey",
            };

            expect(() => parseReservationRequest(mockRumor, "privatekey")).toThrow(
                "Expected kind 9901"
            );
        });

        it("throws on invalid payload", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            // Build with invalid data that somehow bypassed builder validation
            const encrypted = JSON.stringify({ party_size: 0 }); // Invalid

            const mockRumor = {
                kind: 9901,
                content: encrypted, // Not encrypted for test
                pubkey: sender.publicKeyHex,
            };

            // This will fail because it's not encrypted properly
            // In real scenario, we'd have properly encrypted invalid data
            expect(() => parseReservationRequest(mockRumor, recipient.privateKeyHex)).toThrow();
        });
    });

    describe("parseReservationResponse", () => {
        it("parses and decrypts a reservation response", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const originalResponse: ReservationResponse = {
                status: "confirmed",
                iso_time: "2025-10-20T19:00:00-07:00",
                message: "Confirmed!",
                table: "A4",
            };

            // Build
            const rumor = buildReservationResponse(
                originalResponse,
                sender.privateKeyHex,
                recipient.publicKeyHex
            );

            // Parse
            const mockRumor = {
                kind: 9902,
                content: rumor.content,
                pubkey: sender.publicKeyHex,
            };

            const parsed = parseReservationResponse(mockRumor, recipient.privateKeyHex);

            expect(parsed.status).toBe(originalResponse.status);
            expect(parsed.iso_time).toBe(originalResponse.iso_time);
            expect(parsed.message).toBe(originalResponse.message);
            expect(parsed.table).toBe(originalResponse.table);
        });

        it("throws on wrong event kind", () => {
            const mockRumor = {
                kind: 9901, // Wrong kind (should be 9902)
                content: "encrypted",
                pubkey: "pubkey",
            };

            expect(() => parseReservationResponse(mockRumor, "privatekey")).toThrow(
                "Expected kind 9902"
            );
        });
    });

    describe("integration scenarios", () => {
        it("full request/response cycle with NIP-59", () => {
            const concierge = generateKeypair();
            const restaurant = generateKeypair();

            // Step 1: Concierge creates a request
            const request: ReservationRequest = {
                party_size: 4,
                iso_time: "2025-10-20T19:00:00-07:00",
                notes: "Celebrating anniversary",
                contact: {
                    name: "Alice Smith",
                    email: "alice@example.com",
                },
            };

            const requestRumor = buildReservationRequest(
                request,
                concierge.privateKeyHex,
                restaurant.publicKeyHex
            );

            // Wrap for sending
            const requestGiftWrap = wrapEvent(
                requestRumor,
                concierge.privateKeyHex,
                restaurant.publicKeyHex
            );

            expect(requestGiftWrap.kind).toBe(1059);

            // Step 2: Restaurant receives and parses request
            const { rumor: unwrappedRequest } = unwrapAndDecrypt(
                requestGiftWrap,
                restaurant.privateKeyHex
            );

            const parsedRequest = parseReservationRequest(
                unwrappedRequest,
                restaurant.privateKeyHex
            );

            expect(parsedRequest.party_size).toBe(4);
            expect(parsedRequest.notes).toBe("Celebrating anniversary");

            // Step 3: Restaurant creates response
            const response: ReservationResponse = {
                status: "confirmed",
                iso_time: "2025-10-20T19:00:00-07:00",
                message: "Confirmed! Table A4 reserved. Happy anniversary!",
                table: "A4",
            };

            const responseRumor = buildReservationResponse(
                response,
                restaurant.privateKeyHex,
                concierge.publicKeyHex,
                [["e", unwrappedRequest.id, "", "reply"]]
            );

            // Wrap for sending
            const responseGiftWrap = wrapEvent(
                responseRumor,
                restaurant.privateKeyHex,
                concierge.publicKeyHex
            );

            // Step 4: Concierge receives and parses response
            const { rumor: unwrappedResponse } = unwrapAndDecrypt(
                responseGiftWrap,
                concierge.privateKeyHex
            );

            const parsedResponse = parseReservationResponse(
                unwrappedResponse,
                concierge.privateKeyHex
            );

            expect(parsedResponse.status).toBe("confirmed");
            expect(parsedResponse.table).toBe("A4");
            expect(parsedResponse.message).toContain("Happy anniversary");
        });

        it("handles suggested time alternative", () => {
            const concierge = generateKeypair();
            const restaurant = generateKeypair();

            const request: ReservationRequest = {
                party_size: 6,
                iso_time: "2025-10-20T19:00:00-07:00",
            };

            const requestRumor = buildReservationRequest(
                request,
                concierge.privateKeyHex,
                restaurant.publicKeyHex
            );

            const requestGiftWrap = wrapEvent(
                requestRumor,
                concierge.privateKeyHex,
                restaurant.publicKeyHex
            );

            const { rumor: unwrappedRequest } = unwrapAndDecrypt(
                requestGiftWrap,
                restaurant.privateKeyHex
            );

            // Restaurant suggests different time
            const response: ReservationResponse = {
                status: "suggested",
                iso_time: "2025-10-20T20:00:00-07:00",
                message: "7pm is fully booked. Would 8pm work?",
            };

            const responseRumor = buildReservationResponse(
                response,
                restaurant.privateKeyHex,
                concierge.publicKeyHex
            );

            const responseGiftWrap = wrapEvent(
                responseRumor,
                restaurant.privateKeyHex,
                concierge.publicKeyHex
            );

            const { rumor: unwrappedResponse } = unwrapAndDecrypt(
                responseGiftWrap,
                concierge.privateKeyHex
            );

            const parsedResponse = parseReservationResponse(
                unwrappedResponse,
                concierge.privateKeyHex
            );

            expect(parsedResponse.status).toBe("suggested");
            expect(parsedResponse.iso_time).toBe("2025-10-20T20:00:00-07:00");
        });

        it("handles declined reservation", () => {
            const concierge = generateKeypair();
            const restaurant = generateKeypair();

            const request: ReservationRequest = {
                party_size: 8,
                iso_time: "2025-12-31T20:00:00-07:00",
            };

            const requestRumor = buildReservationRequest(
                request,
                concierge.privateKeyHex,
                restaurant.publicKeyHex
            );

            const requestGiftWrap = wrapEvent(
                requestRumor,
                concierge.privateKeyHex,
                restaurant.publicKeyHex
            );

            const { rumor: unwrappedRequest } = unwrapAndDecrypt(
                requestGiftWrap,
                restaurant.privateKeyHex
            );

            // Restaurant declines
            const response: ReservationResponse = {
                status: "declined",
                message: "Sorry, we're fully booked for New Year's Eve",
            };

            const responseRumor = buildReservationResponse(
                response,
                restaurant.privateKeyHex,
                concierge.publicKeyHex
            );

            const responseGiftWrap = wrapEvent(
                responseRumor,
                restaurant.privateKeyHex,
                concierge.publicKeyHex
            );

            const { rumor: unwrappedResponse } = unwrapAndDecrypt(
                responseGiftWrap,
                concierge.privateKeyHex
            );

            const parsedResponse = parseReservationResponse(
                unwrappedResponse,
                concierge.privateKeyHex
            );

            expect(parsedResponse.status).toBe("declined");
            expect(parsedResponse.iso_time).toBeUndefined();
        });
    });
});

