import { SimplePool } from "nostr-tools";
import type { Event } from "nostr-tools";

const pool = new SimplePool();

export function getPool(): SimplePool {
    return pool;
}

export async function publishToRelays(event: Event, relays: string[]): Promise<void> {
    const targets = Array.from(new Set(relays.map((relay) => relay.trim()).filter(Boolean)));

    if (!targets.length) {
        throw new Error("No relays configured");
    }

    const publishPromises = pool.publish(targets, event);
    const results = await Promise.allSettled(publishPromises);

    const failures = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected"
    );

    if (failures.length === results.length) {
        const reasons = failures.map((failure) =>
            failure.reason instanceof Error ? failure.reason.message : String(failure.reason)
        );
        throw new Error(reasons[0] ?? "Relay rejected event");
    }
}

