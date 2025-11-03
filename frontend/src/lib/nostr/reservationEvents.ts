/**
 * Reservation Event Builders and Parsers
 * 
 * Handles creation and parsing of reservation messages (kinds 9901/9902/9903/9904)
 * with JSON schema validation.
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { Event, EventTemplate } from "nostr-tools";
import type {
    ReservationRequest,
    ReservationResponse,
    ReservationModificationRequest,
    ValidationResult,
    ValidationError,
} from "../../types/reservation";
import { encryptMessage, decryptMessage } from "./nip44";
import { hexToBytes } from '@noble/hashes/utils';

// Import JSON schemas
import requestSchema from "../../../../docs/schemas/reservation.request.schema.json";
import responseSchema from "../../../../docs/schemas/reservation.response.schema.json";
import modificationRequestSchema from "../../../../docs/schemas/reservation.modification.request.schema.json";

// Initialize AJV with formats support
const ajv = new Ajv({ allErrors: true, validateSchema: false });
addFormats(ajv);

// Compile schemas
const validateRequest = ajv.compile(requestSchema);
const validateResponse = ajv.compile(responseSchema);
const validateModificationRequest = ajv.compile(modificationRequestSchema);

/**
 * Validates a reservation request payload against the JSON schema.
 * 
 * @param payload - The request payload to validate
 * @returns Validation result with errors if invalid
 * 
 * @example
 * ```typescript
 * const result = validateReservationRequest({
 *   party_size: 2,
 *   iso_time: "2025-10-20T19:00:00-07:00"
 * });
 * 
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 */
export function validateReservationRequest(payload: unknown): ValidationResult {
    const valid = validateRequest(payload);

    if (valid) {
        return { valid: true };
    }

    const errors: ValidationError[] = (validateRequest.errors || []).map((err) => ({
        field: err.instancePath || err.params?.missingProperty,
        message: err.message || "Validation failed",
        value: err.data,
    }));

    return { valid: false, errors };
}

/**
 * Validates a reservation response payload against the JSON schema.
 * 
 * @param payload - The response payload to validate
 * @returns Validation result with errors if invalid
 * 
 * @example
 * ```typescript
 * const result = validateReservationResponse({
 *   status: "confirmed",
 *   iso_time: "2025-10-20T19:00:00-07:00"
 * });
 * ```
 */
export function validateReservationResponse(payload: unknown): ValidationResult {
    const valid = validateResponse(payload);

    if (valid) {
        return { valid: true };
    }

    const errors: ValidationError[] = (validateResponse.errors || []).map((err) => ({
        field: err.instancePath || err.params?.missingProperty,
        message: err.message || "Validation failed",
        value: err.data,
    }));

    return { valid: false, errors };
}

/**
 * Creates an encrypted rumor event for a reservation request (kind 9901).
 * 
 * @param request - The reservation request payload
 * @param senderPrivateKey - Sender's private key in hex format for encryption
 * @param recipientPublicKey - Recipient's public key in hex format for encryption
 * @param additionalTags - Optional additional tags (e.g., thread markers)
 * @returns Event template ready to be wrapped with NIP-59
 * @throws Error if validation fails
 * 
 * @example
 * ```typescript
 * const rumor = buildReservationRequest(
 *   {
 *     party_size: 2,
 *     iso_time: "2025-10-20T19:00:00-07:00",
 *     notes: "Window seat"
 *   },
 *   myPrivateKeyHex,
 *   restaurantPublicKeyHex
 * );
 * 
 * // Wrap and send
 * const giftWrap = wrapEvent(rumor, myPrivateKeyHex, restaurantPublicKeyHex);
 * await publishToRelays(giftWrap, relays);
 * ```
 */
export function buildReservationRequest(
    request: ReservationRequest,
    senderPrivateKey: string,
    recipientPublicKey: string,
    additionalTags: string[][] = []
): EventTemplate {
    // Validate payload
    const validation = validateReservationRequest(request);
    if (!validation.valid) {
        const errorMessages = validation.errors?.map(e => e.message).join(", ");
        throw new Error(`Invalid reservation request: ${errorMessages}`);
    }

    // Encrypt the payload
    const encrypted = encryptMessage(
        JSON.stringify(request),
        senderPrivateKey,
        recipientPublicKey
    );

    // Build event template
    return {
        kind: 9901,
        content: encrypted,
        tags: [
            ["p", recipientPublicKey],
            ...additionalTags,
        ],
        created_at: Math.floor(Date.now() / 1000),
    };
}

/**
 * Creates an encrypted rumor event for a reservation response (kind 9902).
 * 
 * @param response - The reservation response payload
 * @param senderPrivateKey - Sender's private key in hex format for encryption
 * @param recipientPublicKey - Recipient's public key in hex format for encryption
 * @param additionalTags - Optional additional tags (e.g., thread markers)
 * @returns Event template ready to be wrapped with NIP-59
 * @throws Error if validation fails
 * 
 * @example
 * ```typescript
 * const rumor = buildReservationResponse(
 *   {
 *     status: "confirmed",
 *     iso_time: "2025-10-20T19:00:00-07:00",
 *     message: "See you then!"
 *   },
 *   myPrivateKeyHex,
 *   conciergePublicKeyHex,
 *   [["e", requestEventId, "", "reply"]]
 * );
 * ```
 */
export function buildReservationResponse(
    response: ReservationResponse,
    senderPrivateKey: string,
    recipientPublicKey: string,
    additionalTags: string[][] = []
): EventTemplate {
    // Validate payload
    const validation = validateReservationResponse(response);
    if (!validation.valid) {
        const errorMessages = validation.errors?.map(e => e.message).join(", ");
        throw new Error(`Invalid reservation response: ${errorMessages}`);
    }

    // Encrypt the payload
    const encrypted = encryptMessage(
        JSON.stringify(response),
        senderPrivateKey,
        recipientPublicKey
    );

    // Build event template
    return {
        kind: 9902,
        content: encrypted,
        tags: [
            ["p", recipientPublicKey],
            ...additionalTags,
        ],
        created_at: Math.floor(Date.now() / 1000),
    };
}

/**
 * Parses and decrypts a reservation request from a rumor event.
 * 
 * @param rumor - The unwrapped rumor event (kind 9901)
 * @param recipientPrivateKey - Recipient's private key in hex format for decryption
 * @returns Parsed and validated reservation request
 * @throws Error if decryption or validation fails
 * 
 * @example
 * ```typescript
 * // After unwrapping gift wrap
 * const rumor = unwrapEvent(giftWrap, myPrivateKeyHex);
 * const request = parseReservationRequest(rumor, myPrivateKeyHex);
 * 
 * console.log(`Party size: ${request.party_size}`);
 * console.log(`Time: ${request.iso_time}`);
 * ```
 */
export function parseReservationRequest(
    rumor: Event | { kind: number; content: string; pubkey: string },
    recipientPrivateKey: string
): ReservationRequest {
    if (rumor.kind !== 9901) {
        throw new Error(`Expected kind 9901, got ${rumor.kind}`);
    }

    // Decrypt content
    const decrypted = decryptMessage(rumor.content, recipientPrivateKey, rumor.pubkey);
    const payload = JSON.parse(decrypted);

    // Validate
    const validation = validateReservationRequest(payload);
    if (!validation.valid) {
        const errorMessages = validation.errors?.map(e => e.message).join(", ");
        throw new Error(`Invalid reservation request: ${errorMessages}`);
    }

    return payload as ReservationRequest;
}

/**
 * Parses and decrypts a reservation response from a rumor event.
 * 
 * @param rumor - The unwrapped rumor event (kind 9902)
 * @param recipientPrivateKey - Recipient's private key in hex format for decryption
 * @returns Parsed and validated reservation response
 * @throws Error if decryption or validation fails
 * 
 * @example
 * ```typescript
 * const rumor = unwrapEvent(giftWrap, myPrivateKeyHex);
 * const response = parseReservationResponse(rumor, myPrivateKeyHex);
 * 
 * console.log(`Status: ${response.status}`);
 * ```
 */
export function parseReservationResponse(
    rumor: Event | { kind: number; content: string; pubkey: string },
    recipientPrivateKey: string
): ReservationResponse {
    if (rumor.kind !== 9902) {
        throw new Error(`Expected kind 9902, got ${rumor.kind}`);
    }

    // Decrypt content
    const decrypted = decryptMessage(rumor.content, recipientPrivateKey, rumor.pubkey);
    const payload = JSON.parse(decrypted);

    // Validate
    const validation = validateReservationResponse(payload);
    if (!validation.valid) {
        const errorMessages = validation.errors?.map(e => e.message).join(", ");
        throw new Error(`Invalid reservation response: ${errorMessages}`);
    }

    return payload as ReservationResponse;
}

/**
 * Validates a reservation modification request payload against the JSON schema.
 * 
 * @param payload - The modification request payload to validate
 * @returns Validation result with errors if invalid
 * 
 * @example
 * ```typescript
 * const result = validateReservationModificationRequest({
 *   iso_time: "2025-10-20T19:30:00-07:00",
 *   message: "We're fully booked at 7pm, but 7:30pm is available."
 * });
 * 
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 */
export function validateReservationModificationRequest(payload: unknown): ValidationResult {
    const valid = validateModificationRequest(payload);

    if (valid) {
        return { valid: true };
    }

    const errors: ValidationError[] = (validateModificationRequest.errors || []).map((err) => ({
        field: err.instancePath || err.params?.missingProperty,
        message: err.message || "Validation failed",
        value: err.data,
    }));

    return { valid: false, errors };
}

/**
 * Parses and decrypts a reservation modification request from a rumor event.
 * 
 * @param rumor - The unwrapped rumor event (kind 9903)
 * @param recipientPrivateKey - Recipient's private key in hex format for decryption
 * @returns Parsed and validated reservation modification request
 * @throws Error if decryption or validation fails
 * 
 * @example
 * ```typescript
 * // After unwrapping gift wrap
 * const rumor = unwrapEvent(giftWrap, myPrivateKeyHex);
 * const modificationRequest = parseReservationModificationRequest(rumor, myPrivateKeyHex);
 * 
 * console.log(`Suggested time: ${modificationRequest.iso_time}`);
 * console.log(`Message: ${modificationRequest.message}`);
 * ```
 */
export function parseReservationModificationRequest(
    rumor: Event | { kind: number; content: string; pubkey: string },
    recipientPrivateKey: string
): ReservationModificationRequest {
    if (rumor.kind !== 9903) {
        throw new Error(`Expected kind 9903, got ${rumor.kind}`);
    }

    // Decrypt content
    const decrypted = decryptMessage(rumor.content, recipientPrivateKey, rumor.pubkey);
    const payload = JSON.parse(decrypted);

    // Validate
    const validation = validateReservationModificationRequest(payload);
    if (!validation.valid) {
        const errorMessages = validation.errors?.map(e => e.message).join(", ");
        throw new Error(`Invalid reservation modification request: ${errorMessages}`);
    }

    return payload as ReservationModificationRequest;
}


