/**
 * Tests for Reservation Events
 */

import { describe, it, expect } from "vitest";
import { generateKeypair } from "./keys";
import {
    validateReservationRequestPayload,
    validateReservationResponsePayload,
    validateReservationModificationRequestPayload,
    validateReservationModificationResponsePayload,
    buildReservationRequest,
    buildReservationResponse,
    buildReservationModificationResponse,
    parseReservationRequest,
    parseReservationResponse,
    parseReservationModificationRequest,
} from "./reservationEvents";
import type { ReservationRequest, ReservationResponse, ReservationModificationRequest, ReservationModificationResponse } from "../../types/reservation";
import { unwrapEvent, wrapEvent } from "./nip59";

describe("reservationEvents", () => {
    describe("validateReservationRequestPayload", () => {
        it("validates a valid request", () => {
            const request: ReservationRequest = {
                party_size: 2,
                iso_time: "2025-10-20T19:00:00-07:00",
            };

            const result = validateReservationRequestPayload(request);

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

            const result = validateReservationRequestPayload(request);

            expect(result.valid).toBe(true);
        });

        it("rejects request missing required fields", () => {
            const request = {
                party_size: 2,
                // missing iso_time
            };

            const result = validateReservationRequestPayload(request);

            expect(result.valid).toBe(false);
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
        });

        it("rejects request with invalid party_size", () => {
            const request = {
                party_size: 0, // Invalid: must be >= 1
                iso_time: "2025-10-20T19:00:00-07:00",
            };

            const result = validateReservationRequestPayload(request);

            expect(result.valid).toBe(false);
        });

        it("rejects request with party_size > 20", () => {
            const request = {
                party_size: 25, // Invalid: must be <= 20
                iso_time: "2025-10-20T19:00:00-07:00",
            };

            const result = validateReservationRequestPayload(request);

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

            const result = validateReservationRequestPayload(request);

            expect(result.valid).toBe(false);
        });

        it("rejects request with notes too long", () => {
            const request = {
                party_size: 2,
                iso_time: "2025-10-20T19:00:00-07:00",
                notes: "x".repeat(2001), // Max 2000
            };

            const result = validateReservationRequestPayload(request);

            expect(result.valid).toBe(false);
        });
    });

    describe("validateReservationResponsePayload", () => {
        it("validates confirmed response", () => {
            const response: ReservationResponse = {
                status: "confirmed",
                iso_time: "2025-10-20T19:00:00-07:00",
                message: "See you at 7pm!",
                table: "A4",
            };

            const result = validateReservationResponsePayload(response);

            expect(result.valid).toBe(true);
        });

        it("validates declined response", () => {
            const response: ReservationResponse = {
                status: "declined",
                message: "Sorry, we're fully booked",
            };

            const result = validateReservationResponsePayload(response);

            expect(result.valid).toBe(true);
        });

        it("rejects response missing required status", () => {
            const response = {
                iso_time: "2025-10-20T19:00:00-07:00",
            };

            const result = validateReservationResponsePayload(response);

            expect(result.valid).toBe(false);
        });

        it("rejects response with invalid status", () => {
            const response = {
                status: "invalid-status",
            } as unknown as ReservationResponse;

            const result = validateReservationResponsePayload(response);

            expect(result.valid).toBe(false);
        });

        it("rejects confirmed response without iso_time", () => {
            const response = {
                status: "confirmed",
                // missing required iso_time for confirmed status
            };

            const result = validateReservationResponsePayload(response);

            expect(result.valid).toBe(false);
        });
    });

    describe("validateReservationModificationRequestPayload", () => {
        it("validates a valid modification request", () => {
            const request: ReservationModificationRequest = {
                iso_time: "2025-10-20T19:30:00-07:00",
                message: "We're fully booked at 7pm, but 7:30pm is available.",
            };

            const result = validateReservationModificationRequestPayload(request);

            expect(result.valid).toBe(true);
            expect(result.errors).toBeUndefined();
        });

        it("validates modification request with optional original_iso_time", () => {
            const request: ReservationModificationRequest = {
                iso_time: "2025-10-20T19:30:00-07:00",
                message: "We're fully booked at 7pm, but 7:30pm is available.",
                original_iso_time: "2025-10-20T19:00:00-07:00",
            };

            const result = validateReservationModificationRequestPayload(request);

            expect(result.valid).toBe(true);
        });

        it("rejects modification request missing required iso_time", () => {
            const request = {
                message: "We're fully booked at 7pm",
                // missing iso_time
            };

            const result = validateReservationModificationRequestPayload(request);

            expect(result.valid).toBe(false);
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
        });

        it("rejects modification request missing required message", () => {
            const request = {
                iso_time: "2025-10-20T19:30:00-07:00",
                // missing message
            };

            const result = validateReservationModificationRequestPayload(request);

            expect(result.valid).toBe(false);
        });

        it("rejects modification request with message too long", () => {
            const request = {
                iso_time: "2025-10-20T19:30:00-07:00",
                message: "x".repeat(2001), // Max 2000
            };

            const result = validateReservationModificationRequestPayload(request);

            expect(result.valid).toBe(false);
        });

        it("rejects modification request with invalid date format", () => {
            const request = {
                iso_time: "not-a-date",
                message: "Test message",
            };

            const result = validateReservationModificationRequestPayload(request);

            expect(result.valid).toBe(false);
        });
    });

    describe("parseReservationModificationRequest", () => {
        it("parses a valid modification request", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const originalRequest: ReservationModificationRequest = {
                iso_time: "2025-10-20T19:30:00-07:00",
                message: "We're fully booked at 7pm, but 7:30pm is available.",
                original_iso_time: "2025-10-20T19:00:00-07:00",
            };

            // Create modification request rumor manually (content is plain JSON, not encrypted)
            const mockRumor = {
                kind: 9903,
                content: JSON.stringify(originalRequest),
                pubkey: sender.publicKeyHex,
            };

            const parsed = parseReservationModificationRequest(mockRumor);

            expect(parsed.iso_time).toBe(originalRequest.iso_time);
            expect(parsed.message).toBe(originalRequest.message);
            expect(parsed.original_iso_time).toBe(originalRequest.original_iso_time);
        });

        it("throws on wrong event kind", () => {
            const mockRumor = {
                kind: 9901, // Wrong kind (should be 9903)
                content: "encrypted",
                pubkey: "pubkey",
            };

            expect(() => parseReservationModificationRequest(mockRumor)).toThrow(
                "Expected kind 9903"
            );
        });

        it("throws on invalid payload", () => {
            const sender = generateKeypair();

            // Invalid payload (missing required message)
            const invalidPayload = {
                iso_time: "2025-10-20T19:30:00-07:00",
                // missing required message
            };

            const mockRumor = {
                kind: 9903,
                content: JSON.stringify(invalidPayload),
                pubkey: sender.publicKeyHex,
            };

            expect(() => parseReservationModificationRequest(mockRumor)).toThrow(
                "Invalid reservation modification request"
            );
        });

        it("throws on invalid JSON", () => {
            const sender = generateKeypair();

            // Create rumor with invalid JSON content
            const mockRumor = {
                kind: 9903,
                content: "not valid json",
                pubkey: sender.publicKeyHex,
            };

            expect(() => parseReservationModificationRequest(mockRumor)).toThrow();
        });
    });

    describe("validateReservationModificationResponsePayload", () => {
        it("validates a valid accepted response", () => {
            const response: ReservationModificationResponse = {
                status: "accepted",
                iso_time: "2025-10-20T19:30:00-07:00",
                message: "Yes, 7:30pm works perfectly!",
            };

            const result = validateReservationModificationResponsePayload(response);

            expect(result.valid).toBe(true);
            expect(result.errors).toBeUndefined();
        });

        it("validates a valid declined response", () => {
            const response: ReservationModificationResponse = {
                status: "declined",
                message: "Unfortunately 7:30pm doesn't work for us.",
            };

            const result = validateReservationModificationResponsePayload(response);

            expect(result.valid).toBe(true);
        });

        it("validates accepted response without message", () => {
            const response: ReservationModificationResponse = {
                status: "accepted",
                iso_time: "2025-10-20T19:30:00-07:00",
            };

            const result = validateReservationModificationResponsePayload(response);

            expect(result.valid).toBe(true);
        });

        it("rejects accepted response missing required iso_time", () => {
            const response = {
                status: "accepted",
                // missing required iso_time for accepted status
            };

            const result = validateReservationModificationResponsePayload(response);

            expect(result.valid).toBe(false);
            expect(result.errors).toBeDefined();
            expect(result.errors!.length).toBeGreaterThan(0);
        });

        it("rejects response missing required status", () => {
            const response = {
                iso_time: "2025-10-20T19:30:00-07:00",
            };

            const result = validateReservationModificationResponsePayload(response);

            expect(result.valid).toBe(false);
        });

        it("rejects response with invalid status", () => {
            const response = {
                status: "invalid-status",
            } as unknown as ReservationModificationResponse;

            const result = validateReservationModificationResponsePayload(response);

            expect(result.valid).toBe(false);
        });

        it("rejects response with message too long", () => {
            const response = {
                status: "accepted",
                iso_time: "2025-10-20T19:30:00-07:00",
                message: "x".repeat(2001), // Max 2000
            };

            const result = validateReservationModificationResponsePayload(response);

            expect(result.valid).toBe(false);
        });

        it("accepts declined response without iso_time", () => {
            const response: ReservationModificationResponse = {
                status: "declined",
            };

            const result = validateReservationModificationResponsePayload(response);

            expect(result.valid).toBe(true);
        });
    });

    describe("buildReservationModificationResponse", () => {
        it("builds encrypted event template for accepted response", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const response: ReservationModificationResponse = {
                status: "accepted",
                iso_time: "2025-10-20T19:30:00-07:00",
                message: "Yes, 7:30pm works perfectly!",
            };

            const template = buildReservationModificationResponse(
                response,
                sender.privateKeyHex,
                recipient.publicKeyHex
            );

            expect(template.kind).toBe(9904);
            expect(template.content).toBeTruthy();
            expect(template.content).toContain("status"); // Plain JSON
            expect(template.tags).toContainEqual(["p", recipient.publicKeyHex]);
        });

        it("builds encrypted event template for declined response", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const response: ReservationModificationResponse = {
                status: "declined",
                message: "Unfortunately 7:30pm doesn't work for us.",
            };

            const template = buildReservationModificationResponse(
                response,
                sender.privateKeyHex,
                recipient.publicKeyHex
            );

            expect(template.kind).toBe(9904);
            expect(template.content).toBeTruthy();
            expect(template.content).toContain("status"); // Plain JSON
            expect(template.tags).toContainEqual(["p", recipient.publicKeyHex]);
        });

        it("includes additional tags for thread linking", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const response: ReservationModificationResponse = {
                status: "accepted",
                iso_time: "2025-10-20T19:30:00-07:00",
            };

            const template = buildReservationModificationResponse(
                response,
                sender.privateKeyHex,
                recipient.publicKeyHex,
                [
                    ["e", "original-request-id", "", "root"],
                    ["e", "modification-request-id", "", "reply"],
                ]
            );

            expect(template.tags).toContainEqual(["e", "original-request-id", "", "root"]);
            expect(template.tags).toContainEqual(["e", "modification-request-id", "", "reply"]);
        });

        it("throws on invalid accepted response (missing iso_time)", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const invalidResponse = {
                status: "accepted",
                // missing required iso_time
            } as ReservationModificationResponse;

            expect(() =>
                buildReservationModificationResponse(
                    invalidResponse,
                    sender.privateKeyHex,
                    recipient.publicKeyHex
                )
            ).toThrow("Invalid reservation modification response");
        });

        it("throws on invalid response (invalid status)", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const invalidResponse = {
                status: "invalid-status",
            } as unknown as ReservationModificationResponse;

            expect(() =>
                buildReservationModificationResponse(
                    invalidResponse,
                    sender.privateKeyHex,
                    recipient.publicKeyHex
                )
            ).toThrow("Invalid reservation modification response");
        });

        it("validates required iso_time for accepted status", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            // This should fail validation before building
            const invalidResponse = {
                status: "accepted",
                // missing iso_time
            } as ReservationModificationResponse;

            expect(() => 
                buildReservationModificationResponse(
                    invalidResponse,
                    sender.privateKeyHex,
                    recipient.publicKeyHex
                )
            ).toThrow();
        });

        it("handles empty additional tags", () => {
            const sender = generateKeypair();
            const recipient = generateKeypair();

            const response: ReservationModificationResponse = {
                status: "accepted",
                iso_time: "2025-10-20T19:30:00-07:00",
            };

            const template = buildReservationModificationResponse(
                response,
                sender.privateKeyHex,
                recipient.publicKeyHex,
                [] // Empty tags
            );

            expect(template.kind).toBe(9904);
            // Should still have p tag
            expect(template.tags).toContainEqual(["p", recipient.publicKeyHex]);
        });
    });

    describe("buildReservationRequest", () => {
        it("builds event template with plain JSON content", () => {
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
            expect(template.content).toContain("party_size"); // Plain JSON
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
        it("builds event template with plain JSON content", () => {
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
            expect(template.content).toContain("confirmed"); // Plain JSON
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
        it("parses a reservation request", () => {
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

            const parsed = parseReservationRequest(mockRumor);

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

            expect(() => parseReservationRequest(mockRumor)).toThrow(
                "Expected kind 9901"
            );
        });

        it("throws on invalid payload", () => {
            const sender = generateKeypair();

            // Invalid payload (party_size = 0)
            const mockRumor = {
                kind: 9901,
                content: JSON.stringify({ party_size: 0 }), // Invalid
                pubkey: sender.publicKeyHex,
            };

            expect(() => parseReservationRequest(mockRumor)).toThrow();
        });
    });

    describe("parseReservationResponse", () => {
        it("parses a reservation response", () => {
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

            const parsed = parseReservationResponse(mockRumor);

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

            expect(() => parseReservationResponse(mockRumor)).toThrow(
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
            const unwrappedRequest = unwrapEvent(
                requestGiftWrap,
                restaurant.privateKeyHex
            );

            const parsedRequest = parseReservationRequest(unwrappedRequest);

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
                [["e", unwrappedRequest.id, "", "root"]]  // Schema requires 'root', not 'reply'
            );

            // Wrap for sending
            const responseGiftWrap = wrapEvent(
                responseRumor,
                restaurant.privateKeyHex,
                concierge.publicKeyHex
            );

            // Step 4: Concierge receives and parses response
            const unwrappedResponse = unwrapEvent(
                responseGiftWrap,
                concierge.privateKeyHex
            );

            const parsedResponse = parseReservationResponse(unwrappedResponse);

            expect(parsedResponse.status).toBe("confirmed");
            expect(parsedResponse.table).toBe("A4");
            expect(parsedResponse.message).toContain("Happy anniversary");
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

            const unwrappedRequest = unwrapEvent(
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
                concierge.publicKeyHex,
                [["e", unwrappedRequest.id, "", "root"]]  // Schema requires e tag referencing original request
            );

            const responseGiftWrap = wrapEvent(
                responseRumor,
                restaurant.privateKeyHex,
                concierge.publicKeyHex
            );

            const unwrappedResponse = unwrapEvent(
                responseGiftWrap,
                concierge.privateKeyHex
            );

            const parsedResponse = parseReservationResponse(unwrappedResponse);

            expect(parsedResponse.status).toBe("declined");
            expect(parsedResponse.iso_time).toBeUndefined();
        });
    });
});

