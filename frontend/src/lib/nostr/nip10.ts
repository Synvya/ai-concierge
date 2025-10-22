/**
 * NIP-10: Conventions for clients' use of `e` and `p` tags in text events
 * 
 * Provides utilities for threaded conversations using proper event markers.
 * Uses the "marked" approach with explicit "root" and "reply" markers.
 * 
 * @see https://github.com/nostr-protocol/nips/blob/master/10.md
 */

import type { Event } from "nostr-tools";

/**
 * Thread context extracted from an event's tags
 */
export interface ThreadContext {
    /** The root event ID of the thread (if present) */
    rootId?: string;
    /** The immediate parent event ID being replied to (if present) */
    replyToId?: string;
    /** The relay URL associated with the root event (if present) */
    rootRelay?: string;
    /** The relay URL associated with the reply event (if present) */
    replyRelay?: string;
}

/**
 * Adds NIP-10 thread markers to event tags.
 * 
 * For the first message in a thread (reply to an event):
 * - Adds root marker pointing to the original event
 * 
 * For subsequent messages in a thread:
 * - Adds root marker pointing to the thread root
 * - Adds reply marker pointing to the immediate parent
 * 
 * @param existingTags - Current event tags
 * @param rootEventId - Root event ID of the thread (optional for thread root)
 * @param replyToEventId - Immediate parent event ID (optional)
 * @param rootRelay - Relay URL for root event (optional but recommended)
 * @param replyRelay - Relay URL for reply event (optional but recommended)
 * @returns Updated tags array with thread markers
 * 
 * @example
 * ```typescript
 * // First reply in a thread
 * const tags = addThreadMarkers(
 *   [["p", recipientPubkey]],
 *   "abc123...",  // root event ID
 *   undefined,     // no reply (this IS the first reply)
 *   "wss://relay.damus.io"
 * );
 * // Result: [["p", ...], ["e", "abc123...", "wss://relay.damus.io", "root"]]
 * 
 * // Reply in an existing thread
 * const tags = addThreadMarkers(
 *   [["p", recipientPubkey]],
 *   "abc123...",  // root event ID
 *   "def456...",  // immediate parent ID
 *   "wss://relay.damus.io",
 *   "wss://relay.damus.io"
 * );
 * // Result: [
 * //   ["p", ...],
 * //   ["e", "abc123...", "wss://relay.damus.io", "root"],
 * //   ["e", "def456...", "wss://relay.damus.io", "reply"]
 * // ]
 * ```
 */
export function addThreadMarkers(
    existingTags: string[][],
    rootEventId?: string,
    replyToEventId?: string,
    rootRelay?: string,
    replyRelay?: string
): string[][] {
    const tags = [...existingTags];

    // Add root marker if we have a root event
    if (rootEventId) {
        tags.push(["e", rootEventId, rootRelay || "", "root"]);
    }

    // Add reply marker if we have a reply-to event
    if (replyToEventId) {
        tags.push(["e", replyToEventId, replyRelay || "", "reply"]);
    }

    return tags;
}

/**
 * Extracts thread context from an event's tags.
 * Looks for `e` tags with "root" and "reply" markers.
 * 
 * @param event - The event to extract thread context from
 * @returns Thread context with root and reply information
 * 
 * @example
 * ```typescript
 * const context = getThreadContext(event);
 * 
 * if (context.rootId) {
 *   console.log('Part of thread:', context.rootId);
 * }
 * 
 * if (context.replyToId) {
 *   console.log('Replying to:', context.replyToId);
 * }
 * ```
 */
export function getThreadContext(event: Event): ThreadContext {
    const context: ThreadContext = {};

    for (const tag of event.tags) {
        if (tag[0] !== "e") continue;

        const [, eventId, relay, marker] = tag;

        if (marker === "root") {
            context.rootId = eventId;
            context.rootRelay = relay || undefined;
        } else if (marker === "reply") {
            context.replyToId = eventId;
            context.replyRelay = relay || undefined;
        }
    }

    return context;
}

/**
 * Checks if an event is the root of a thread.
 * An event is considered a thread root if it has no "root" or "reply" markers.
 * 
 * @param event - The event to check
 * @returns True if the event is a thread root
 * 
 * @example
 * ```typescript
 * if (isThreadRoot(event)) {
 *   console.log('This is the start of a conversation');
 * }
 * ```
 */
export function isThreadRoot(event: Event): boolean {
    const context = getThreadContext(event);
    return !context.rootId && !context.replyToId;
}

/**
 * Gets all event IDs referenced in e tags (regardless of marker).
 * Useful for fetching all related events in a thread.
 * 
 * @param event - The event to extract references from
 * @returns Array of referenced event IDs
 * 
 * @example
 * ```typescript
 * const referencedIds = getReferencedEventIds(event);
 * // Fetch all referenced events
 * const relatedEvents = await fetchEvents(referencedIds);
 * ```
 */
export function getReferencedEventIds(event: Event): string[] {
    const ids: string[] = [];

    for (const tag of event.tags) {
        if (tag[0] === "e" && tag[1]) {
            ids.push(tag[1]);
        }
    }

    return ids;
}

/**
 * Builds complete thread tags for a reply, including both e tags and p tags.
 * Automatically includes the pubkey of the event being replied to.
 * 
 * @param replyToEvent - The event being replied to
 * @param additionalPubkeys - Additional pubkeys to include (e.g., other participants)
 * @param relay - Relay URL to use for e tags
 * @returns Complete tags array for the reply
 * 
 * @example
 * ```typescript
 * // Reply to a message in a thread
 * const tags = buildReplyTags(
 *   parentEvent,
 *   [otherParticipantPubkey],
 *   "wss://relay.damus.io"
 * );
 * 
 * const replyEvent = {
 *   kind: 32102,
 *   content: encryptedResponse,
 *   tags,
 *   created_at: Math.floor(Date.now() / 1000)
 * };
 * ```
 */
export function buildReplyTags(
    replyToEvent: Event,
    additionalPubkeys: string[] = [],
    relay?: string
): string[][] {
    const tags: string[][] = [];

    // Extract thread context from the event we're replying to
    const context = getThreadContext(replyToEvent);

    // Determine the root event ID
    // If replying to an event that's already in a thread, use its root
    // Otherwise, the event we're replying to becomes the root
    const rootEventId = context.rootId || replyToEvent.id;
    const replyToEventId = replyToEvent.id;

    // Add thread markers
    tags.push(["e", rootEventId, relay || "", "root"]);
    tags.push(["e", replyToEventId, relay || "", "reply"]);

    // Add p tag for the author of the event we're replying to
    tags.push(["p", replyToEvent.pubkey]);

    // Add p tags for additional participants (deduplicated)
    const existingPubkeys = new Set([replyToEvent.pubkey]);
    for (const pubkey of additionalPubkeys) {
        if (!existingPubkeys.has(pubkey)) {
            tags.push(["p", pubkey]);
            existingPubkeys.add(pubkey);
        }
    }

    return tags;
}

/**
 * Groups events by their thread root.
 * Useful for organizing multiple events into conversation threads.
 * 
 * @param events - Array of events to group
 * @returns Map of root event ID to array of events in that thread
 * 
 * @example
 * ```typescript
 * const threads = groupEventsByThread(allEvents);
 * 
 * for (const [rootId, threadEvents] of threads.entries()) {
 *   console.log(`Thread ${rootId}:`, threadEvents.length, 'messages');
 *   threadEvents.sort((a, b) => a.created_at - b.created_at);
 *   displayThread(threadEvents);
 * }
 * ```
 */
export function groupEventsByThread(events: Event[]): Map<string, Event[]> {
    const threads = new Map<string, Event[]>();

    for (const event of events) {
        const context = getThreadContext(event);
        // Use root ID if available, otherwise use the event's own ID (it's a root)
        const threadId = context.rootId || event.id;

        if (!threads.has(threadId)) {
            threads.set(threadId, []);
        }

        threads.get(threadId)!.push(event);
    }

    return threads;
}

/**
 * Sorts events within a thread chronologically.
 * Useful after grouping events by thread.
 * 
 * @param events - Array of events in a thread
 * @returns Sorted array (oldest first)
 * 
 * @example
 * ```typescript
 * const threadEvents = threads.get(rootId);
 * const sorted = sortThreadEvents(threadEvents);
 * // Display in chronological order
 * ```
 */
export function sortThreadEvents(events: Event[]): Event[] {
    return [...events].sort((a, b) => a.created_at - b.created_at);
}

