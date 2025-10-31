/**
 * Tests for NIP-10 Threading
 */

import { describe, it, expect } from "vitest";
import { generateKeypair } from "./keys";
import type { Event } from "nostr-tools";
import {
    addThreadMarkers,
    getThreadContext,
    isThreadRoot,
    getReferencedEventIds,
    buildReplyTags,
    groupEventsByThread,
    sortThreadEvents,
} from "./nip10";

describe("nip10", () => {
    describe("addThreadMarkers", () => {
        it("adds root marker when only rootEventId provided", () => {
            const tags = addThreadMarkers(
                [["p", "pubkey123"]],
                "root-event-id",
                undefined,
                "wss://relay.example.com"
            );

            expect(tags).toContainEqual(["e", "root-event-id", "wss://relay.example.com", "root"]);
            expect(tags).toHaveLength(2); // p tag + e tag
        });

        it("adds both root and reply markers when both provided", () => {
            const tags = addThreadMarkers(
                [["p", "pubkey123"]],
                "root-event-id",
                "reply-event-id",
                "wss://relay1.com",
                "wss://relay2.com"
            );

            expect(tags).toContainEqual(["e", "root-event-id", "wss://relay1.com", "root"]);
            expect(tags).toContainEqual(["e", "reply-event-id", "wss://relay2.com", "reply"]);
            expect(tags).toHaveLength(3); // p tag + 2 e tags
        });

        it("preserves existing tags", () => {
            const existingTags = [
                ["p", "pubkey123"],
                ["t", "reservation"],
            ];

            const tags = addThreadMarkers(existingTags, "root-id");

            expect(tags).toContainEqual(["p", "pubkey123"]);
            expect(tags).toContainEqual(["t", "reservation"]);
            expect(tags).toContainEqual(["e", "root-id", "", "root"]);
        });

        it("handles missing relay URLs", () => {
            const tags = addThreadMarkers([["p", "pubkey123"]], "root-id", "reply-id");

            expect(tags).toContainEqual(["e", "root-id", "", "root"]);
            expect(tags).toContainEqual(["e", "reply-id", "", "reply"]);
        });

        it("returns unchanged tags when no event IDs provided", () => {
            const existingTags = [["p", "pubkey123"]];
            const tags = addThreadMarkers(existingTags);

            expect(tags).toEqual(existingTags);
        });
    });

    describe("getThreadContext", () => {
        it("extracts root and reply markers from event", () => {
            const event: Event = {
                kind: 9902,
                content: "test",
                tags: [
                    ["e", "root-event-id", "wss://relay1.com", "root"],
                    ["e", "reply-event-id", "wss://relay2.com", "reply"],
                    ["p", "pubkey123"],
                ],
                created_at: 1000,
                pubkey: "sender-pubkey",
                id: "event-id",
                sig: "signature",
            };

            const context = getThreadContext(event);

            expect(context.rootId).toBe("root-event-id");
            expect(context.rootRelay).toBe("wss://relay1.com");
            expect(context.replyToId).toBe("reply-event-id");
            expect(context.replyRelay).toBe("wss://relay2.com");
        });

        it("handles events with only root marker", () => {
            const event: Event = {
                kind: 9901,
                content: "test",
                tags: [["e", "root-event-id", "", "root"]],
                created_at: 1000,
                pubkey: "sender-pubkey",
                id: "event-id",
                sig: "signature",
            };

            const context = getThreadContext(event);

            expect(context.rootId).toBe("root-event-id");
            expect(context.replyToId).toBeUndefined();
        });

        it("handles events with no thread markers", () => {
            const event: Event = {
                kind: 1,
                content: "test",
                tags: [["p", "pubkey123"]],
                created_at: 1000,
                pubkey: "sender-pubkey",
                id: "event-id",
                sig: "signature",
            };

            const context = getThreadContext(event);

            expect(context.rootId).toBeUndefined();
            expect(context.replyToId).toBeUndefined();
            expect(context.rootRelay).toBeUndefined();
            expect(context.replyRelay).toBeUndefined();
        });

        it("ignores e tags without markers", () => {
            const event: Event = {
                kind: 1,
                content: "test",
                tags: [
                    ["e", "some-event-id", "wss://relay.com"],
                    ["e", "root-id", "wss://relay.com", "root"],
                ],
                created_at: 1000,
                pubkey: "sender-pubkey",
                id: "event-id",
                sig: "signature",
            };

            const context = getThreadContext(event);

            expect(context.rootId).toBe("root-id");
            expect(context.replyToId).toBeUndefined();
        });
    });

    describe("isThreadRoot", () => {
        it("identifies event with no thread markers as root", () => {
            const event: Event = {
                kind: 9901,
                content: "test",
                tags: [["p", "pubkey123"]],
                created_at: 1000,
                pubkey: "sender-pubkey",
                id: "event-id",
                sig: "signature",
            };

            expect(isThreadRoot(event)).toBe(true);
        });

        it("identifies event with root marker as non-root", () => {
            const event: Event = {
                kind: 9902,
                content: "test",
                tags: [["e", "root-id", "", "root"]],
                created_at: 1000,
                pubkey: "sender-pubkey",
                id: "event-id",
                sig: "signature",
            };

            expect(isThreadRoot(event)).toBe(false);
        });

        it("identifies event with reply marker as non-root", () => {
            const event: Event = {
                kind: 9902,
                content: "test",
                tags: [["e", "reply-id", "", "reply"]],
                created_at: 1000,
                pubkey: "sender-pubkey",
                id: "event-id",
                sig: "signature",
            };

            expect(isThreadRoot(event)).toBe(false);
        });
    });

    describe("getReferencedEventIds", () => {
        it("extracts all event IDs from e tags", () => {
            const event: Event = {
                kind: 1,
                content: "test",
                tags: [
                    ["e", "event-1"],
                    ["e", "event-2", "wss://relay.com", "root"],
                    ["e", "event-3", "wss://relay.com", "reply"],
                    ["p", "pubkey123"],
                ],
                created_at: 1000,
                pubkey: "sender-pubkey",
                id: "event-id",
                sig: "signature",
            };

            const ids = getReferencedEventIds(event);

            expect(ids).toEqual(["event-1", "event-2", "event-3"]);
        });

        it("returns empty array for event with no e tags", () => {
            const event: Event = {
                kind: 1,
                content: "test",
                tags: [["p", "pubkey123"]],
                created_at: 1000,
                pubkey: "sender-pubkey",
                id: "event-id",
                sig: "signature",
            };

            const ids = getReferencedEventIds(event);

            expect(ids).toEqual([]);
        });

        it("skips e tags without event ID", () => {
            const event: Event = {
                kind: 1,
                content: "test",
                tags: [
                    ["e"],
                    ["e", "event-1"],
                    ["e", "event-2"],
                ],
                created_at: 1000,
                pubkey: "sender-pubkey",
                id: "event-id",
                sig: "signature",
            };

            const ids = getReferencedEventIds(event);

            expect(ids).toEqual(["event-1", "event-2"]);
        });
    });

    describe("buildReplyTags", () => {
        it("builds tags for first reply (creates root)", () => {
            const originalEvent: Event = {
                kind: 9901,
                content: "original",
                tags: [["p", "recipient-pubkey"]],
                created_at: 1000,
                pubkey: "original-author",
                id: "original-event-id",
                sig: "signature",
            };

            const tags = buildReplyTags(originalEvent, [], "wss://relay.com");

            expect(tags).toContainEqual(["e", "original-event-id", "wss://relay.com", "root"]);
            expect(tags).toContainEqual(["e", "original-event-id", "wss://relay.com", "reply"]);
            expect(tags).toContainEqual(["p", "original-author"]);
            expect(tags).toHaveLength(3);
        });

        it("builds tags for reply in existing thread", () => {
            const threadReply: Event = {
                kind: 9902,
                content: "reply",
                tags: [
                    ["e", "thread-root-id", "wss://relay.com", "root"],
                    ["p", "original-author"],
                ],
                created_at: 2000,
                pubkey: "reply-author",
                id: "reply-event-id",
                sig: "signature",
            };

            const tags = buildReplyTags(threadReply, [], "wss://relay.com");

            expect(tags).toContainEqual(["e", "thread-root-id", "wss://relay.com", "root"]);
            expect(tags).toContainEqual(["e", "reply-event-id", "wss://relay.com", "reply"]);
            expect(tags).toContainEqual(["p", "reply-author"]);
            expect(tags).toHaveLength(3);
        });

        it("includes additional pubkeys without duplicates", () => {
            const event: Event = {
                kind: 9901,
                content: "test",
                tags: [],
                created_at: 1000,
                pubkey: "author-1",
                id: "event-id",
                sig: "signature",
            };

            const tags = buildReplyTags(
                event,
                ["author-2", "author-3", "author-1"], // author-1 duplicate
                "wss://relay.com"
            );

            const pTags = tags.filter((tag) => tag[0] === "p");
            expect(pTags).toHaveLength(3);
            expect(pTags).toContainEqual(["p", "author-1"]);
            expect(pTags).toContainEqual(["p", "author-2"]);
            expect(pTags).toContainEqual(["p", "author-3"]);
        });

        it("works without relay URL", () => {
            const event: Event = {
                kind: 9901,
                content: "test",
                tags: [],
                created_at: 1000,
                pubkey: "author",
                id: "event-id",
                sig: "signature",
            };

            const tags = buildReplyTags(event);

            expect(tags).toContainEqual(["e", "event-id", "", "root"]);
            expect(tags).toContainEqual(["e", "event-id", "", "reply"]);
            expect(tags).toContainEqual(["p", "author"]);
        });
    });

    describe("groupEventsByThread", () => {
        it("groups events by thread root", () => {
            const rootEvent: Event = {
                kind: 9901,
                content: "root",
                tags: [],
                created_at: 1000,
                pubkey: "author-1",
                id: "root-id",
                sig: "sig1",
            };

            const reply1: Event = {
                kind: 9902,
                content: "reply-1",
                tags: [["e", "root-id", "", "root"]],
                created_at: 2000,
                pubkey: "author-2",
                id: "reply-1-id",
                sig: "sig2",
            };

            const reply2: Event = {
                kind: 9902,
                content: "reply-2",
                tags: [
                    ["e", "root-id", "", "root"],
                    ["e", "reply-1-id", "", "reply"],
                ],
                created_at: 3000,
                pubkey: "author-1",
                id: "reply-2-id",
                sig: "sig3",
            };

            const threads = groupEventsByThread([rootEvent, reply1, reply2]);

            expect(threads.size).toBe(1);
            expect(threads.get("root-id")).toHaveLength(3);
            expect(threads.get("root-id")).toContainEqual(rootEvent);
            expect(threads.get("root-id")).toContainEqual(reply1);
            expect(threads.get("root-id")).toContainEqual(reply2);
        });

        it("groups multiple independent threads", () => {
            const thread1Root: Event = {
                kind: 1,
                content: "thread1",
                tags: [],
                created_at: 1000,
                pubkey: "author-1",
                id: "thread1-root",
                sig: "sig1",
            };

            const thread1Reply: Event = {
                kind: 1,
                content: "thread1-reply",
                tags: [["e", "thread1-root", "", "root"]],
                created_at: 2000,
                pubkey: "author-2",
                id: "thread1-reply",
                sig: "sig2",
            };

            const thread2Root: Event = {
                kind: 1,
                content: "thread2",
                tags: [],
                created_at: 1500,
                pubkey: "author-3",
                id: "thread2-root",
                sig: "sig3",
            };

            const threads = groupEventsByThread([thread1Root, thread1Reply, thread2Root]);

            expect(threads.size).toBe(2);
            expect(threads.get("thread1-root")).toHaveLength(2);
            expect(threads.get("thread2-root")).toHaveLength(1);
        });

        it("handles empty array", () => {
            const threads = groupEventsByThread([]);

            expect(threads.size).toBe(0);
        });
    });

    describe("sortThreadEvents", () => {
        it("sorts events chronologically", () => {
            const event1: Event = {
                kind: 1,
                content: "first",
                tags: [],
                created_at: 1000,
                pubkey: "author",
                id: "id1",
                sig: "sig1",
            };

            const event2: Event = {
                kind: 1,
                content: "third",
                tags: [],
                created_at: 3000,
                pubkey: "author",
                id: "id3",
                sig: "sig3",
            };

            const event3: Event = {
                kind: 1,
                content: "second",
                tags: [],
                created_at: 2000,
                pubkey: "author",
                id: "id2",
                sig: "sig2",
            };

            const sorted = sortThreadEvents([event2, event1, event3]);

            expect(sorted[0].id).toBe("id1");
            expect(sorted[1].id).toBe("id2");
            expect(sorted[2].id).toBe("id3");
        });

        it("does not mutate original array", () => {
            const events: Event[] = [
                {
                    kind: 1,
                    content: "test",
                    tags: [],
                    created_at: 3000,
                    pubkey: "author",
                    id: "id3",
                    sig: "sig",
                },
                {
                    kind: 1,
                    content: "test",
                    tags: [],
                    created_at: 1000,
                    pubkey: "author",
                    id: "id1",
                    sig: "sig",
                },
            ];

            const originalOrder = events.map((e) => e.id);
            sortThreadEvents(events);

            expect(events.map((e) => e.id)).toEqual(originalOrder);
        });
    });

    describe("integration scenarios", () => {
        it("simulates a full reservation negotiation thread", () => {
            const concierge = generateKeypair();
            const restaurant = generateKeypair();

            // Step 1: Initial reservation request (thread root)
            const requestEvent: Event = {
                kind: 9901,
                content: "encrypted-request",
                tags: [["p", restaurant.publicKeyHex]],
                created_at: 1000,
                pubkey: concierge.publicKeyHex,
                id: "request-id",
                sig: "sig1",
            };

            expect(isThreadRoot(requestEvent)).toBe(true);

            // Step 2: Restaurant suggests different time (first reply)
            const suggestionTags = buildReplyTags(requestEvent, [], "wss://relay.damus.io");
            const suggestionEvent: Event = {
                kind: 9902,
                content: "encrypted-suggestion",
                tags: suggestionTags,
                created_at: 2000,
                pubkey: restaurant.publicKeyHex,
                id: "suggestion-id",
                sig: "sig2",
            };

            expect(isThreadRoot(suggestionEvent)).toBe(false);
            const suggestionContext = getThreadContext(suggestionEvent);
            expect(suggestionContext.rootId).toBe("request-id");
            expect(suggestionContext.replyToId).toBe("request-id");

            // Step 3: Concierge accepts (reply to suggestion)
            const acceptTags = buildReplyTags(suggestionEvent, [], "wss://relay.damus.io");
            const acceptEvent: Event = {
                kind: 9902,
                content: "encrypted-accept",
                tags: acceptTags,
                created_at: 3000,
                pubkey: concierge.publicKeyHex,
                id: "accept-id",
                sig: "sig3",
            };

            const acceptContext = getThreadContext(acceptEvent);
            expect(acceptContext.rootId).toBe("request-id"); // Same root
            expect(acceptContext.replyToId).toBe("suggestion-id"); // Reply to suggestion

            // Step 4: Restaurant confirms (final reply)
            const confirmTags = buildReplyTags(acceptEvent, [], "wss://relay.damus.io");
            const confirmEvent: Event = {
                kind: 9902,
                content: "encrypted-confirm",
                tags: confirmTags,
                created_at: 4000,
                pubkey: restaurant.publicKeyHex,
                id: "confirm-id",
                sig: "sig4",
            };

            const confirmContext = getThreadContext(confirmEvent);
            expect(confirmContext.rootId).toBe("request-id");
            expect(confirmContext.replyToId).toBe("accept-id");

            // Verify thread grouping
            const allEvents = [requestEvent, suggestionEvent, acceptEvent, confirmEvent];
            const threads = groupEventsByThread(allEvents);

            expect(threads.size).toBe(1);
            expect(threads.get("request-id")).toHaveLength(4);

            // Verify chronological sorting
            const sorted = sortThreadEvents(threads.get("request-id")!);
            expect(sorted[0].id).toBe("request-id");
            expect(sorted[1].id).toBe("suggestion-id");
            expect(sorted[2].id).toBe("accept-id");
            expect(sorted[3].id).toBe("confirm-id");
        });

        it("handles multiple concurrent reservation threads", () => {
            const concierge = generateKeypair();
            const restaurant = generateKeypair();

            // Two different reservation requests
            const request1: Event = {
                kind: 9901,
                content: "request-friday",
                tags: [["p", restaurant.publicKeyHex]],
                created_at: 1000,
                pubkey: concierge.publicKeyHex,
                id: "request1-id",
                sig: "sig1",
            };

            const request2: Event = {
                kind: 9901,
                content: "request-saturday",
                tags: [["p", restaurant.publicKeyHex]],
                created_at: 1100,
                pubkey: concierge.publicKeyHex,
                id: "request2-id",
                sig: "sig2",
            };

            // Replies to each
            const reply1: Event = {
                kind: 9902,
                content: "reply-to-friday",
                tags: buildReplyTags(request1),
                created_at: 2000,
                pubkey: restaurant.publicKeyHex,
                id: "reply1-id",
                sig: "sig3",
            };

            const reply2: Event = {
                kind: 9902,
                content: "reply-to-saturday",
                tags: buildReplyTags(request2),
                created_at: 2100,
                pubkey: restaurant.publicKeyHex,
                id: "reply2-id",
                sig: "sig4",
            };

            const threads = groupEventsByThread([request1, request2, reply1, reply2]);

            expect(threads.size).toBe(2);
            expect(threads.get("request1-id")).toHaveLength(2);
            expect(threads.get("request2-id")).toHaveLength(2);
        });
    });
});

