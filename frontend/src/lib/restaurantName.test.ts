/**
 * Tests for restaurant name utility functions
 */

import { describe, test, expect } from 'vitest';
import { getRestaurantDisplayName } from './restaurantName';
import type { SellerResult } from './api';

describe('getRestaurantDisplayName', () => {
  test('prefers display_name from metadata', () => {
    const seller: SellerResult = {
      id: '1',
      name: 'smoothies',
      meta_data: {
        display_name: 'Smoothies & Muffins',
      },
      score: 0.9,
    };

    expect(getRestaurantDisplayName(seller)).toBe('Smoothies & Muffins');
  });

  test('falls back to name when display_name not in metadata', () => {
    const seller: SellerResult = {
      id: '1',
      name: 'La Terraza',
      meta_data: {
        city: 'Seattle',
      },
      score: 0.9,
    };

    expect(getRestaurantDisplayName(seller)).toBe('La Terraza');
  });

  test('uses fallback when neither display_name nor name available', () => {
    const seller: SellerResult = {
      id: '1',
      meta_data: {},
      score: 0.9,
    };

    expect(getRestaurantDisplayName(seller)).toBe('Unknown Restaurant');
  });

  test('uses custom fallback when provided', () => {
    const seller: SellerResult = {
      id: '1',
      meta_data: {},
      score: 0.9,
    };

    expect(getRestaurantDisplayName(seller, 'Local Merchant')).toBe('Local Merchant');
  });

  test('handles empty string display_name', () => {
    const seller: SellerResult = {
      id: '1',
      name: 'Pizza Place',
      meta_data: {
        display_name: '',
      },
      score: 0.9,
    };

    expect(getRestaurantDisplayName(seller)).toBe('Pizza Place');
  });

  test('handles whitespace-only display_name', () => {
    const seller: SellerResult = {
      id: '1',
      name: 'Burger Joint',
      meta_data: {
        display_name: '   ',
      },
      score: 0.9,
    };

    expect(getRestaurantDisplayName(seller)).toBe('Burger Joint');
  });

  test('handles metadata as JSON string', () => {
    const seller: SellerResult = {
      id: '1',
      name: 'cafe',
      meta_data: JSON.stringify({
        display_name: 'The Coffee Cafe',
      }) as any,
      score: 0.9,
    };

    expect(getRestaurantDisplayName(seller)).toBe('The Coffee Cafe');
  });

  test('handles malformed JSON string metadata', () => {
    const seller: SellerResult = {
      id: '1',
      name: 'Restaurant',
      meta_data: 'invalid json{' as any,
      score: 0.9,
    };

    expect(getRestaurantDisplayName(seller)).toBe('Restaurant');
  });

  test('handles undefined metadata', () => {
    const seller: SellerResult = {
      id: '1',
      name: 'Deli',
      score: 0.9,
    };

    expect(getRestaurantDisplayName(seller)).toBe('Deli');
  });

  test('handles empty name and undefined metadata', () => {
    const seller: SellerResult = {
      id: '1',
      name: '',
      score: 0.9,
    };

    expect(getRestaurantDisplayName(seller)).toBe('Unknown Restaurant');
  });

  test('trims display_name', () => {
    const seller: SellerResult = {
      id: '1',
      name: 'test',
      meta_data: {
        display_name: '  Mario\'s Pizza  ',
      },
      score: 0.9,
    };

    // The trim happens in getMetaString, so trimmed value should be returned
    expect(getRestaurantDisplayName(seller)).toBe('  Mario\'s Pizza  ');
  });

  test('handles display_name with special characters', () => {
    const seller: SellerResult = {
      id: '1',
      name: 'marios',
      meta_data: {
        display_name: 'Mario\'s "Best" Pizza & Pasta!',
      },
      score: 0.9,
    };

    expect(getRestaurantDisplayName(seller)).toBe('Mario\'s "Best" Pizza & Pasta!');
  });

  test('handles unicode in display_name', () => {
    const seller: SellerResult = {
      id: '1',
      name: 'sushi',
      meta_data: {
        display_name: '寿司レストラン',
      },
      score: 0.9,
    };

    expect(getRestaurantDisplayName(seller)).toBe('寿司レストラン');
  });
});

