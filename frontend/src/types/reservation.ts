/**
 * Types for Synvya Reservation Messages (NIP-32101/32102)
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
 * Reservation request payload (kind 32101)
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
    | "suggested"
    | "expired"
    | "cancelled";

/**
 * Reservation response payload (kind 32102)
 */
export interface ReservationResponse {
    /** Status of the reservation */
    status: ReservationStatus;
    /** Proposed or confirmed time (null for declined/expired) */
    iso_time?: string | null;
    /** Optional message to the requester */
    message?: string;
    /** Optional table identifier */
    table?: string | null;
    /** When a soft hold expires (if applicable) */
    hold_expires_at?: string | null;
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

