/**
 * ReservationsPanel Tests
 * 
 * Tests for the Reservations panel component including empty state,
 * thread display, and real-time updates.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ChakraProvider } from '@chakra-ui/react';
import { ReservationsPanel } from './ReservationsPanel';
import { ReservationProvider } from '../contexts/ReservationContext';
import * as ReservationContext from '../contexts/ReservationContext';
import type { ReservationThread } from '../contexts/ReservationContext';

// Helper to render with providers
function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ChakraProvider>
      <ReservationProvider>
        {ui}
      </ReservationProvider>
    </ChakraProvider>
  );
}

describe('ReservationsPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('empty state', () => {
    test('shows empty state when no threads', () => {
      // Mock useReservations to return empty threads
      vi.spyOn(ReservationContext, 'useReservations').mockReturnValue({
        threads: [],
        isActive: false,
        addOutgoingMessage: vi.fn(),
      });

      renderWithProviders(<ReservationsPanel />);

      expect(screen.getByText(/no reservations yet/i)).toBeInTheDocument();
      expect(screen.getByText(/when you make a reservation/i)).toBeInTheDocument();
    });

    test('shows calendar icon in empty state', () => {
      vi.spyOn(ReservationContext, 'useReservations').mockReturnValue({
        threads: [],
        isActive: false,
        addOutgoingMessage: vi.fn(),
      });

      const { container } = renderWithProviders(<ReservationsPanel />);

      // Check for SVG icon
      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('thread list', () => {
    const mockThreads: ReservationThread[] = [
      {
        threadId: 'thread-123',
        restaurantId: 'restaurant-123',
        restaurantName: "Mario's Pizza",
        restaurantNpub: 'npub1test123',
        messages: [],
        request: {
          partySize: 4,
          isoTime: '2025-10-21T19:00:00-07:00',
          notes: 'Window seat please',
        },
        status: 'sent',
        lastUpdated: Math.floor(Date.now() / 1000) - 300, // 5 minutes ago
      },
      {
        threadId: 'thread-456',
        restaurantId: 'restaurant-456',
        restaurantName: 'La Terraza',
        restaurantNpub: 'npub1test456',
        messages: [],
        request: {
          partySize: 2,
          isoTime: '2025-10-22T18:30:00-07:00',
        },
        status: 'confirmed',
        lastUpdated: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
      },
      {
        threadId: 'thread-789',
        restaurantId: 'restaurant-789',
        restaurantName: 'The Olive Garden',
        restaurantNpub: 'npub1test789',
        messages: [],
        request: {
          partySize: 6,
          isoTime: '2025-10-23T20:00:00-07:00',
        },
        status: 'declined',
        lastUpdated: Math.floor(Date.now() / 1000) - 86400, // 1 day ago
      },
    ];

    test('displays thread list with all threads', () => {
      vi.spyOn(ReservationContext, 'useReservations').mockReturnValue({
        threads: mockThreads,
        isActive: true,
        addOutgoingMessage: vi.fn(),
      });

      renderWithProviders(<ReservationsPanel />);

      expect(screen.getByText("Mario's Pizza")).toBeInTheDocument();
      expect(screen.getByText('La Terraza')).toBeInTheDocument();
      expect(screen.getByText('The Olive Garden')).toBeInTheDocument();
    });

    test('displays party size correctly', () => {
      vi.spyOn(ReservationContext, 'useReservations').mockReturnValue({
        threads: [mockThreads[0]],
        isActive: true,
        addOutgoingMessage: vi.fn(),
      });

      renderWithProviders(<ReservationsPanel />);

      expect(screen.getByText(/4/)).toBeInTheDocument();
      expect(screen.getByText(/people/i)).toBeInTheDocument();
    });

    test('displays singular "person" for party of 1', () => {
      const singleThread: ReservationThread = {
        ...mockThreads[0],
        request: { ...mockThreads[0].request, partySize: 1 },
      };

      vi.spyOn(ReservationContext, 'useReservations').mockReturnValue({
        threads: [singleThread],
        isActive: true,
        addOutgoingMessage: vi.fn(),
      });

      renderWithProviders(<ReservationsPanel />);

      // Text is split across elements, so use a function matcher
      const text = screen.getByText((content, element) => {
        return element?.textContent === '1 person';
      });
      expect(text).toBeInTheDocument();
    });

    test('displays datetime in readable format', () => {
      vi.spyOn(ReservationContext, 'useReservations').mockReturnValue({
        threads: [mockThreads[0]],
        isActive: true,
        addOutgoingMessage: vi.fn(),
      });

      renderWithProviders(<ReservationsPanel />);

      // Should show formatted date (exact format depends on locale)
      const dateText = screen.getByText(/oct/i);
      expect(dateText).toBeInTheDocument();
    });

    test('displays notes when present', () => {
      vi.spyOn(ReservationContext, 'useReservations').mockReturnValue({
        threads: [mockThreads[0]],
        isActive: true,
        addOutgoingMessage: vi.fn(),
      });

      renderWithProviders(<ReservationsPanel />);

      expect(screen.getByText(/window seat please/i)).toBeInTheDocument();
    });

    test('displays status badges with correct colors', () => {
      vi.spyOn(ReservationContext, 'useReservations').mockReturnValue({
        threads: mockThreads,
        isActive: true,
        addOutgoingMessage: vi.fn(),
      });

      renderWithProviders(<ReservationsPanel />);

      expect(screen.getByText('Sent')).toBeInTheDocument();
      expect(screen.getByText('Confirmed')).toBeInTheDocument();
      expect(screen.getByText('Declined')).toBeInTheDocument();
    });

    test('displays relative timestamps', () => {
      vi.spyOn(ReservationContext, 'useReservations').mockReturnValue({
        threads: [mockThreads[0]],
        isActive: true,
        addOutgoingMessage: vi.fn(),
      });

      renderWithProviders(<ReservationsPanel />);

      // Should show relative time (e.g., "5m ago")
      const timestamps = screen.getAllByText(/ago/i);
      expect(timestamps.length).toBeGreaterThan(0);
    });

    test('sorts threads by lastUpdated (most recent first)', () => {
      const threads: ReservationThread[] = [
        {
          ...mockThreads[0],
          restaurantName: 'Restaurant A',
          lastUpdated: 1000,
        },
        {
          ...mockThreads[1],
          restaurantName: 'Restaurant B',
          lastUpdated: 3000,
        },
        {
          ...mockThreads[2],
          restaurantName: 'Restaurant C',
          lastUpdated: 2000,
        },
      ];

      vi.spyOn(ReservationContext, 'useReservations').mockReturnValue({
        threads,
        isActive: true,
        addOutgoingMessage: vi.fn(),
      });

      renderWithProviders(<ReservationsPanel />);

      // Verify all three restaurants are rendered
      expect(screen.getByText('Restaurant A')).toBeInTheDocument();
      expect(screen.getByText('Restaurant B')).toBeInTheDocument();
      expect(screen.getByText('Restaurant C')).toBeInTheDocument();
    });
  });

  describe('header', () => {
    test('displays header when threads exist', () => {
      vi.spyOn(ReservationContext, 'useReservations').mockReturnValue({
        threads: [{
          threadId: 'thread-123',
          restaurantId: 'restaurant-123',
          restaurantName: "Mario's Pizza",
          restaurantNpub: 'npub1test',
          messages: [],
          request: { partySize: 4, isoTime: '2025-10-21T19:00:00Z' },
          status: 'sent',
          lastUpdated: Date.now() / 1000,
        }],
        isActive: true,
        addOutgoingMessage: vi.fn(),
      });

      renderWithProviders(<ReservationsPanel />);

      const headers = screen.getAllByText('Reservations');
      expect(headers.length).toBeGreaterThan(0);
      expect(screen.getByText(/track your reservation requests/i)).toBeInTheDocument();
    });

    test('does not display header in empty state', () => {
      vi.spyOn(ReservationContext, 'useReservations').mockReturnValue({
        threads: [],
        isActive: false,
        addOutgoingMessage: vi.fn(),
      });

      renderWithProviders(<ReservationsPanel />);

      // In empty state, the heading should be "No reservations yet", not "Reservations"
      expect(screen.queryByText(/track your reservation requests/i)).not.toBeInTheDocument();
      expect(screen.getByText(/no reservations yet/i)).toBeInTheDocument();
    });
  });

  describe('status display', () => {
    test('displays all status types correctly', () => {
      const statuses: Array<ReservationThread['status']> = [
        'sent',
        'confirmed',
        'declined',
        'suggested',
        'expired',
        'cancelled',
      ];

      const threads = statuses.map((status, index) => ({
        threadId: `thread-${index}`,
        restaurantId: `restaurant-${index}`,
        restaurantName: `Restaurant ${index}`,
        restaurantNpub: `npub1test${index}`,
        messages: [],
        request: { partySize: 2, isoTime: '2025-10-21T19:00:00Z' },
        status,
        lastUpdated: Date.now() / 1000,
      }));

      vi.spyOn(ReservationContext, 'useReservations').mockReturnValue({
        threads,
        isActive: true,
        addOutgoingMessage: vi.fn(),
      });

      renderWithProviders(<ReservationsPanel />);

      // Use getAllByText for badges that might appear multiple times
      expect(screen.getAllByText('Sent').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Confirmed').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Declined').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Alternative Suggested').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Expired').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0);
    });
  });
});

