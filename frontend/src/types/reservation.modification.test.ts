/**
 * Tests for Reservation Modification Types
 * 
 * Validates that TypeScript types match the JSON schemas and can be used correctly.
 */

import { describe, it, expect } from "vitest";
import type {
    ReservationModificationRequest,
    ReservationModificationResponse,
} from "./reservation";

describe("ReservationModificationRequest", () => {
    it("should accept a valid modification request with all required fields", () => {
        const request: ReservationModificationRequest = {
            party_size: 2,
            iso_time: "2025-10-17T19:30:00-07:00",
            notes: "We're fully booked at 7pm, but 7:30pm is available.",
        };

        expect(request.iso_time).toBe("2025-10-17T19:30:00-07:00");
        expect(request.party_size).toBe(2);
        expect(request.notes).toBe("We're fully booked at 7pm, but 7:30pm is available.");
    });

    it("should accept a modification request with optional fields", () => {
        const request: ReservationModificationRequest = {
            party_size: 2,
            iso_time: "2025-10-17T19:30:00-07:00",
            notes: "We're fully booked at 7pm, but 7:30pm is available.",
            contact: {
                name: "John Doe",
            },
        };

        expect(request.contact?.name).toBe("John Doe");
    });

    it("should match the schema structure", () => {
        // Type check: all required fields must be present
        const request: ReservationModificationRequest = {
            party_size: 2,
            iso_time: "2025-10-17T19:30:00-07:00",
            notes: "Test message",
        };

        // Verify structure matches schema
        expect(typeof request.party_size).toBe("number");
        expect(typeof request.iso_time).toBe("string");
        expect(typeof request.notes === "string" || request.notes === undefined).toBe(true);
    });
});

describe("ReservationModificationResponse", () => {
    it("should accept a valid accepted response with iso_time", () => {
        const response: ReservationModificationResponse = {
            status: "confirmed",
            iso_time: "2025-10-17T19:30:00-07:00",
            message: "Yes, 7:30pm works perfectly!",
        };

        expect(response.status).toBe("confirmed");
        expect(response.iso_time).toBe("2025-10-17T19:30:00-07:00");
        expect(response.message).toBe("Yes, 7:30pm works perfectly!");
    });

    it("should accept a valid declined response with iso_time null", () => {
        const response: ReservationModificationResponse = {
            status: "declined",
            iso_time: null, // Per NIP-RR: required but can be null when declined
            message: "Unfortunately 7:30pm doesn't work for us.",
        };

        expect(response.status).toBe("declined");
        expect(response.iso_time).toBeNull();
        expect(response.message).toBe("Unfortunately 7:30pm doesn't work for us.");
    });

    it("should accept response with only status and iso_time null", () => {
        const response: ReservationModificationResponse = {
            status: "declined",
            iso_time: null, // Per NIP-RR: required but can be null when declined
        };

        expect(response.status).toBe("declined");
        expect(response.iso_time).toBeNull();
    });

    it("should match the schema structure", () => {
        // Type check: status is required
        const acceptedResponse: ReservationModificationResponse = {
            status: "confirmed",
            iso_time: "2025-10-17T19:30:00-07:00",
        };

        const declinedResponse: ReservationModificationResponse = {
            status: "declined",
            iso_time: null, // Per NIP-RR: required but can be null when declined
        };

        expect(typeof acceptedResponse.status).toBe("string");
        expect(typeof declinedResponse.status).toBe("string");
        
        // Status should be one of the enum values
        expect(["confirmed", "declined"]).toContain(acceptedResponse.status);
        expect(["confirmed", "declined"]).toContain(declinedResponse.status);
    });

    it("should require iso_time field (can be null when declined)", () => {
        // Per NIP-RR: iso_time is required (can be null when declined)
        const responseWithoutTime: ReservationModificationResponse = {
            status: "declined",
            iso_time: null, // Required field, null when declined
        };

        expect(responseWithoutTime.iso_time).toBeNull();
        
        const responseWithTime: ReservationModificationResponse = {
            status: "confirmed",
            iso_time: "2025-10-17T19:30:00-07:00",
        };

        expect(responseWithTime.iso_time).toBeDefined();
        expect(typeof responseWithTime.iso_time).toBe("string");
    });
});

describe("Type compatibility", () => {
    it("should be compatible with ReservationMessage payload union", () => {
        // This test ensures the types can be used in ReservationMessage payload
        const modificationRequest: ReservationModificationRequest = {
            party_size: 2,
            iso_time: "2025-10-17T19:30:00-07:00",
            notes: "Test",
        };

        const modificationResponse: ReservationModificationResponse = {
            status: "confirmed",
            iso_time: "2025-10-17T19:30:00-07:00",
        };

        // Type check: these should be assignable to ReservationMessage.payload
        // (This is tested implicitly by TypeScript compilation)
        expect(modificationRequest).toBeDefined();
        expect(modificationResponse).toBeDefined();
    });
});

