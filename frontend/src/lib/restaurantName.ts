/**
 * Utility functions for extracting restaurant display names
 * Prefers display_name from Nostr kind:0 profile over the name field
 */

import type { SellerResult } from './api';

/**
 * Get a string value from metadata object
 */
function getMetaString(meta: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!meta) {
    return undefined;
  }
  const value = meta[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/**
 * Parse metadata from SellerResult
 * Handles both object and JSON string formats
 */
function parseMetaData(metaData: SellerResult['meta_data']): Record<string, unknown> {
  if (!metaData) {
    return {};
  }
  if (typeof metaData === 'object') {
    return metaData as Record<string, unknown>;
  }
  if (typeof metaData === 'string') {
    try {
      const parsed = JSON.parse(metaData);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Get the display name for a restaurant/seller
 * Prefers display_name from Nostr kind:0 profile metadata, falls back to name
 * 
 * @param seller - The seller/restaurant object
 * @param fallback - Fallback name if neither display_name nor name are available
 * @returns The display name to show to users
 */
export function getRestaurantDisplayName(
  seller: SellerResult,
  fallback: string = 'Unknown Restaurant'
): string {
  const meta = parseMetaData(seller.meta_data);
  const displayName = getMetaString(meta, 'display_name');
  
  if (displayName) {
    return displayName;
  }
  
  // Check if name exists and is not empty
  if (seller.name && seller.name.trim().length > 0) {
    return seller.name;
  }
  
  return fallback;
}

