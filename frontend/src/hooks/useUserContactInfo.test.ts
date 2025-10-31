/**
 * Tests for useUserContactInfo hook
 */

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useUserContactInfo } from './useUserContactInfo';

describe('useUserContactInfo', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  it('should initialize with null contact info', () => {
    const { result } = renderHook(() => useUserContactInfo());

    expect(result.current.contactInfo).toBeNull();
    expect(result.current.hasContactInfo).toBe(false);
  });

  it('should set and persist contact info', () => {
    const { result } = renderHook(() => useUserContactInfo());

    act(() => {
      result.current.setContactInfo({
        name: 'John Doe',
        phone: '+1-555-1234',
      });
    });

    expect(result.current.contactInfo).toEqual({
      name: 'John Doe',
      phone: '+1-555-1234',
    });
    expect(result.current.hasContactInfo).toBe(true);

    // Check localStorage
    const stored = localStorage.getItem('ai-concierge-user-contact-info');
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!)).toEqual({
      name: 'John Doe',
      phone: '+1-555-1234',
    });
  });

  it('should load contact info from localStorage on initialization', () => {
    // Pre-populate localStorage
    localStorage.setItem(
      'ai-concierge-user-contact-info',
      JSON.stringify({
        name: 'Jane Smith',
        phone: '+1-555-5678',
      })
    );

    const { result } = renderHook(() => useUserContactInfo());

    expect(result.current.contactInfo).toEqual({
      name: 'Jane Smith',
      phone: '+1-555-5678',
    });
    expect(result.current.hasContactInfo).toBe(true);
  });

  it('should clear contact info', () => {
    const { result } = renderHook(() => useUserContactInfo());

    // Set contact info first
    act(() => {
      result.current.setContactInfo({
        name: 'John Doe',
        phone: '+1-555-1234',
      });
    });

    expect(result.current.hasContactInfo).toBe(true);

    // Clear it
    act(() => {
      result.current.clearContactInfo();
    });

    expect(result.current.contactInfo).toBeNull();
    expect(result.current.hasContactInfo).toBe(false);
    expect(localStorage.getItem('ai-concierge-user-contact-info')).toBeNull();
  });

  it('should handle invalid JSON in localStorage', () => {
    // Set invalid JSON
    localStorage.setItem('ai-concierge-user-contact-info', 'invalid-json');

    const { result } = renderHook(() => useUserContactInfo());

    // Should initialize with null due to parse error
    expect(result.current.contactInfo).toBeNull();
    expect(result.current.hasContactInfo).toBe(false);
  });

  it('should handle incomplete contact info in localStorage', () => {
    // Set contact info with missing phone
    localStorage.setItem(
      'ai-concierge-user-contact-info',
      JSON.stringify({ name: 'John Doe' })
    );

    const { result } = renderHook(() => useUserContactInfo());

    // Should initialize with null due to missing required field
    expect(result.current.contactInfo).toBeNull();
    expect(result.current.hasContactInfo).toBe(false);
  });
});
