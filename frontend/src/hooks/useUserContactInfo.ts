/**
 * React hook for managing user contact information
 * Stores name and phone in localStorage for reservation requests
 */

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ai-concierge-user-contact-info';

export interface UserContactInfo {
  name: string;
  phone: string;
}

/**
 * Hook to access and manage user contact information
 * Returns contact info from localStorage if it exists
 * @returns Object with contactInfo, setContactInfo, and hasContactInfo
 */
export function useUserContactInfo() {
  const [contactInfo, setContactInfoState] = useState<UserContactInfo | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as UserContactInfo;
        // Validate that we have both name and phone
        if (parsed.name && parsed.phone) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn('Failed to load contact info:', error);
    }
    return null;
  });

  /**
   * Update contact info and persist to localStorage
   */
  const setContactInfo = (info: UserContactInfo | null) => {
    setContactInfoState(info);
    try {
      if (info) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (error) {
      console.error('Failed to save contact info:', error);
    }
  };

  /**
   * Clear contact info from state and storage
   */
  const clearContactInfo = () => {
    setContactInfo(null);
  };

  return {
    contactInfo,
    setContactInfo,
    clearContactInfo,
    hasContactInfo: contactInfo !== null,
  };
}

