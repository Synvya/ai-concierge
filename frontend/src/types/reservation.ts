/**
 * Types for Synvya Reservation Messages (NIP-9901/9902/9903/9904)
 * 
 * These types match the JSON schemas defined in docs/schemas/
 */

/**
 * Contact information for a reservation guest
 */
export interface ReservationContact {
    name?: string;
    phone?: string;
    email?: string;
}

/**
 * Constraints and preferences for reservation negotiation
 */
export interface ReservationConstraints {
    earliest_iso_time?: string;
    latest_iso_time?: string;
    outdoor_ok?: boolean;
    accessibility_required?: boolean;
}

/**
 * Reservation request payload (kind 9901)
 */
export interface ReservationRequest {
    /** Number of guests (1-20) */
    party_size: number;
    /** Requested time in ISO8601 format with timezone */
    iso_time: string;
    /** Optional notes or special requests */
    notes?: string;
    /** Optional contact information */
    contact?: ReservationContact;
    /** Optional constraints for negotiation */
    constraints?: ReservationConstraints;
}

/**
 * Status of a reservation response
 */
export type ReservationStatus =
    | "confirmed"
    | "declined"
    | "expired"
    | "cancelled";

/**
 * Reservation modification request payload (kind:9903)
 * Sent from restaurant to customer to suggest an alternative time
 * Per NIP-RR: Uses the same structure as reservation request (kind:9901)
 */
export interface ReservationModificationRequest {
    /** Number of guests (1-20) */
    party_size: number;
    /** Suggested alternative time in ISO8601 format with timezone */
    iso_time: string;
    /** Optional notes or special requests (max 2000 characters) */
    notes?: string;
    /** Optional contact information */
    contact?: ReservationContact;
    /** Optional constraints for negotiation */
    constraints?: ReservationConstraints;
}

/**
 * Reservation modification response payload (kind:9904)
 * Sent from customer to restaurant to accept or decline a modification suggestion
 * Per NIP-RR: status must be "confirmed" or "declined"
 * Per NIP-RR: iso_time is required (can be null when declined)
 */
export interface ReservationModificationResponse {
    /** Whether customer confirms the modification (per NIP-RR: "confirmed" or "declined") */
    status: "confirmed" | "declined";
    /** ISO8601 datetime with timezone (required field, can be null when declined) */
    iso_time: string | null;
    /** Optional message from customer */
    message?: string;
}

/**
 * Reservation response payload (kind 9902)
 */
export interface ReservationResponse {
    /** Status of the reservation */
    status: ReservationStatus;
    /** Proposed or confirmed time (null for declined/expired) */
    iso_time?: string | null;
    /** Optional message to the requester */
    message?: string;
    /** Optional table identifier (only for confirmed status) */
    table?: string | null;
}

/**
 * Validation error details
 */
export interface ValidationError {
    field?: string;
    message: string;
    value?: unknown;
}

/**
 * Result of validation
 */
export interface ValidationResult {
    valid: boolean;
    errors?: ValidationError[];
}

