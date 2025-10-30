import type { SellerResult } from './api';
import { getRestaurantDisplayName } from './restaurantName';

/**
 * Represents a parsed reservation intent from natural language.
 */
export interface ReservationIntent {
  restaurantName?: string;
  partySize?: number;
  time?: string; // ISO 8601 date-time string
  notes?: string;
}

/**
 * Parses a user message to detect reservation intent and extract details.
 * 
 * @param message - The user's natural language message
 * @param searchContext - Current search results to match restaurant names
 * @returns ReservationIntent if detected, null otherwise
 * 
 * @example
 * ```typescript
 * const intent = parseReservationIntent(
 *   "Book a table for 4 at Mario's Pizza at 7pm tonight",
 *   searchResults
 * );
 * // { restaurantName: "Mario's Pizza", partySize: 4, time: "2025-10-22T19:00:00-07:00" }
 * ```
 */
export function parseReservationIntent(
  message: string,
  searchContext: SellerResult[]
): ReservationIntent | null {
  // Detect reservation keywords
  if (!/\b(book|reserve|reservation|table)\b/i.test(message)) {
    return null;
  }

  const intent: ReservationIntent = {};

  // Extract party size
  const sizeMatch = message.match(/\bfor\s+(\d+)(?:\s+(?:people|person|guests?|pax))?\b/i);
  if (sizeMatch) {
    intent.partySize = parseInt(sizeMatch[1], 10);
  }

  // Extract time patterns
  const timeStr = extractTime(message);
  if (timeStr) {
    intent.time = timeStr;
  }

  // Match restaurant from search context
  // Try matching against display_name first, then fall back to name
  for (const result of searchContext) {
    const displayName = getRestaurantDisplayName(result, '');
    const name = result.name || '';
    
    // Check if message includes the display name
    if (displayName && message.toLowerCase().includes(displayName.toLowerCase())) {
      intent.restaurantName = displayName;
      break;
    }
    // Fall back to checking the raw name if display name didn't match
    if (name && name !== displayName && message.toLowerCase().includes(name.toLowerCase())) {
      intent.restaurantName = displayName; // Still use display name for consistency
      break;
    }
  }

  // Extract notes (everything after "note:" or in quotes)
  const noteMatch = message.match(/\bnote[s]?:\s*(.+?)(?:\s+(?:at|for|on)\s+|$)/i);
  if (noteMatch) {
    intent.notes = noteMatch[1].trim();
  } else {
    // Try to extract quoted text
    const quoteMatch = message.match(/["'](.+?)["']/);
    if (quoteMatch) {
      intent.notes = quoteMatch[1].trim();
    }
  }

  return intent;
}

/**
 * Extracts time from natural language and converts to ISO 8601.
 * Supports patterns like:
 * - "at 7pm", "at 7:30pm"
 * - "tonight", "today", "tomorrow"
 * - "at 19:00"
 * 
 * @param message - The message to parse
 * @returns ISO 8601 date-time string or undefined
 */
function extractTime(message: string): string | undefined {
  const now = new Date();

  // Get current date components in local time
  let year = now.getFullYear();
  let month = now.getMonth();
  let day = now.getDate();

  // Detect day context
  if (/\btomorrow\b/i.test(message)) {
    // Use tomorrow's date
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    year = tomorrow.getFullYear();
    month = tomorrow.getMonth();
    day = tomorrow.getDate();
  }
  // "tonight" and "today" use current date (default)

  // Extract time: "at 7pm", "at 7:30pm", "@ 19:00"
  const timeMatch = message.match(/(?:at|@)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridiem = timeMatch[3]?.toLowerCase();

    // Convert 12-hour to 24-hour
    if (meridiem === 'pm' && hours !== 12) {
      hours += 12;
    } else if (meridiem === 'am' && hours === 12) {
      hours = 0;
    }

    // Create date with local time components
    const targetDate = new Date(year, month, day, hours, minutes, 0, 0);

    // If time has passed today and no explicit day was mentioned, assume tomorrow
    if (targetDate < now && !/\b(today|tonight|tomorrow)\b/i.test(message)) {
      targetDate.setDate(targetDate.getDate() + 1);
    }

    return targetDate.toISOString();
  }

  return undefined;
}

/**
 * Checks if a reservation intent has all required details.
 * 
 * @param intent - The reservation intent to validate
 * @returns true if complete, false otherwise
 */
export function isReservationComplete(intent: ReservationIntent): boolean {
  return !!(intent.restaurantName && intent.partySize && intent.time);
}

/**
 * Generates a prompt for missing reservation details.
 * 
 * @param intent - The partial reservation intent
 * @returns A user-friendly prompt for the missing detail
 */
export function getMissingDetailPrompt(intent: ReservationIntent): string | null {
  if (!intent.restaurantName) {
    return 'Which restaurant would you like to book?';
  }
  if (!intent.partySize) {
    return 'How many people?';
  }
  if (!intent.time) {
    return 'What time would you like to dine?';
  }
  return null;
}

