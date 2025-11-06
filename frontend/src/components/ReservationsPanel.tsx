/**
 * Reservations Panel Component
 * 
 * Main panel displaying all reservation threads in a list format.
 * Shows empty state when no reservations exist.
 */

import {
  Box,
  Center,
  Heading,
  Stack,
  Text,
  VStack,
  Icon,
} from '@chakra-ui/react';
import { useReservations, type ReservationThread } from '../contexts/ReservationContext';
import { ThreadCard } from './ThreadCard';
import { useModificationResponse } from '../hooks/useModificationResponse';

export function ReservationsPanel() {
  const { threads } = useReservations();
  const { sendModificationResponse } = useModificationResponse();

  // Filter threads to only show:
  // 1. Reservations with dates in the future
  // 2. With status: sent, confirmed, modification_requested, or modification_accepted
  // Note: Per Guidance.md, only show Confirmed, Modification Requested, or Modification Confirmed
  // However, 'sent' represents pending requests that should be shown as they're active
  const filteredThreads = threads.filter((thread) => {
    // Check if reservation time is in the future
    const reservationDate = new Date(thread.request.isoTime);
    const now = new Date();
    if (reservationDate <= now) {
      return false;
    }

    // Check if status is one of the allowed values
    // 'sent' = pending requests, 'confirmed' = confirmed reservations
    // 'modification_requested' = awaiting user response, 'modification_accepted' = user accepted modification
    const allowedStatuses = ['sent', 'confirmed', 'modification_requested', 'modification_accepted'];
    return allowedStatuses.includes(thread.status);
  });

  const handleAcceptModification = async (thread: ReservationThread) => {
    // Note: We don't check supports_modifications here because:
    // 1. The restaurant already sent a modification request (indicating support)
    // 2. We don't have direct access to SellerResult in this context
    // If needed, we could fetch restaurant data from search results
    await sendModificationResponse(thread, 'confirmed');
  };

  const handleDeclineModification = async (thread: ReservationThread) => {
    await sendModificationResponse(thread, 'declined');
  };

  if (filteredThreads.length === 0) {
    return (
      <Center minH="400px">
        <VStack spacing={4}>
          <Icon viewBox="0 0 24 24" boxSize="12" color="gray.300">
            <path
              fill="currentColor"
              d="M20 6h-2.18c.11-.31.18-.65.18-1a2.996 2.996 0 0 0-5.5-1.65l-.5.67l-.5-.68C10.96 2.54 10.05 2 9 2C7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2M15 4c.55 0 1 .45 1 1s-.45 1-1 1s-1-.45-1-1s.45-1 1-1M9 4c.55 0 1 .45 1 1s-.45 1-1 1s-1-.45-1-1s.45-1 1-1m11 15H4v-2h16zm0-5H4V8h5.08L7 10.83L8.62 12L12 7.4l3.38 4.6L17 10.83L14.92 8H20z"
            />
          </Icon>
          <VStack spacing={2}>
            <Heading size="md" color="gray.600">
              No upcoming reservations
            </Heading>
            <Text color="gray.500" textAlign="center" maxW="sm">
              Your upcoming confirmed reservations and active requests will appear here. Past
              reservations and declined requests are not shown.
            </Text>
          </VStack>
        </VStack>
      </Center>
    );
  }

  return (
    <Box>
      <Stack spacing={4} mb={6}>
        <Heading size="lg">Reservations</Heading>
        <Text color="gray.600">
          Track your reservation requests and view conversations with restaurants
        </Text>
      </Stack>

      <Stack spacing={3}>
        {filteredThreads.map((thread) => (
          <ThreadCard
            key={thread.threadId}
            thread={thread}
            onClick={() => {
              // TODO: Navigate to thread detail view
              console.log('Navigate to thread:', thread.threadId);
            }}
            onAcceptModification={handleAcceptModification}
            onDeclineModification={handleDeclineModification}
          />
        ))}
      </Stack>
    </Box>
  );
}

