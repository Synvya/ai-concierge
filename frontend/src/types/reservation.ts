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
    | "suggested"
    | "expired"
    | "cancelled";

/**
 * Reservation modification request payload (kind 9903)
 * Sent from restaurant to customer to suggest an alternative time
 */
export interface ReservationModificationRequest {
    /** Suggested alternative time in ISO8601 format with timezone */
    iso_time: string;
    /** Explanation of why modification is needed and details about the suggested time */
    message: string;
    /** Original requested time (for reference) */
    original_iso_time?: string;
}

/**
 * Reservation modification response payload (kind 9904)
 * Sent from customer to restaurant to accept or decline a modification suggestion
 */
export interface ReservationModificationResponse {
    /** Whether customer accepts the modification */
    status: "accepted" | "declined";
    /** Accepted time (required if status is 'accepted') */
    iso_time?: string;
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

