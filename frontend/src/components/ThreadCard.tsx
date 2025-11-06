/**
 * Thread Card Component
 * 
 * Displays a summary card for a reservation thread with restaurant info,
 * party size, datetime, and current status.
 */

import {
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  Flex,
  Heading,
  Text,
  VStack,
  HStack,
} from '@chakra-ui/react';
import type { ReservationThread } from '../contexts/ReservationContext';

interface ThreadCardProps {
  thread: ReservationThread;
  onClick: () => void;
  onAcceptModification?: (thread: ReservationThread) => void;
  onDeclineModification?: (thread: ReservationThread) => void;
}

export function ThreadCard({ thread, onClick, onAcceptModification, onDeclineModification }: ThreadCardProps) {
  const statusColorScheme = {
    sent: 'blue',
    confirmed: 'green',
    declined: 'red',
    modification_requested: 'orange',
    modification_confirmed: 'green',
    expired: 'gray',
    cancelled: 'gray',
  };

  const statusLabel = {
    sent: 'Pending',
    confirmed: 'Confirmed',
    declined: 'Declined',
    modification_requested: 'Modification Requested',
    modification_confirmed: 'Modification Confirmed',
    expired: 'Expired',
    cancelled: 'Cancelled',
  };

  const formatDateTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  const formatLastUpdated = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  return (
    <Card
      variant="outline"
      borderColor="purple.100"
      bg="white"
      cursor="pointer"
      onClick={onClick}
      _hover={{
        borderColor: 'purple.300',
        shadow: 'md',
      }}
      transition="all 0.2s"
    >
      <CardBody>
        <Flex justify="space-between" align="flex-start" gap={4}>
          <VStack align="flex-start" spacing={2} flex="1">
            <Heading size="sm">{thread.restaurantName}</Heading>
            
            <Flex gap={4} flexWrap="wrap">
              <Text fontSize="sm" color="gray.600">
                <Text as="span" fontWeight="medium">
                  {thread.request.partySize}
                </Text>{' '}
                {thread.request.partySize === 1 ? 'person' : 'people'}
              </Text>
              
              <Text fontSize="sm" color="gray.600">
                {formatDateTime(thread.request.isoTime)}
              </Text>
            </Flex>

            {thread.request.notes && (
              <Text fontSize="sm" color="gray.500" fontStyle="italic">
                "{thread.request.notes}"
              </Text>
            )}

            {/* Show modification request details if status is modification_requested */}
            {thread.status === 'modification_requested' && thread.modificationRequest && (
              <Box
                mt={2}
                p={3}
                bg="orange.50"
                borderRadius="md"
                border="1px solid"
                borderColor="orange.200"
              >
                <Text fontSize="sm" fontWeight="medium" color="orange.800" mb={2}>
                  ⏰ Modification Request
                </Text>
                <VStack align="flex-start" spacing={1} fontSize="sm">
                  <Text color="gray.700">
                    <Text as="span" fontWeight="medium">Original:</Text>{' '}
                    {formatDateTime(thread.request.isoTime)}
                  </Text>
                  <Text color="gray.700">
                    <Text as="span" fontWeight="medium">Suggested:</Text>{' '}
                    {formatDateTime(thread.modificationRequest.iso_time)}
                  </Text>
                  {thread.modificationRequest.notes && (
                    <Text color="gray.600" mt={1} fontStyle="italic">
                      "{thread.modificationRequest.notes}"
                    </Text>
                  )}
                </VStack>
              </Box>
            )}

            <Text fontSize="xs" color="gray.400">
              {formatLastUpdated(thread.lastUpdated)}
            </Text>
          </VStack>

          <VStack align="flex-end" spacing={2}>
            <Badge
              colorScheme={statusColorScheme[thread.status]}
              fontSize="xs"
              px={2}
              py={1}
            >
              {statusLabel[thread.status]}
            </Badge>

            {/* Show Accept/Decline buttons for modification requests */}
            {thread.status === 'modification_requested' && (onAcceptModification || onDeclineModification) && (
              <HStack spacing={2} mt={2}>
                {onAcceptModification && (
                  <Button
                    size="xs"
                    colorScheme="green"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAcceptModification(thread);
                    }}
                  >
                    Accept
                  </Button>
                )}
                {onDeclineModification && (
                  <Button
                    size="xs"
                    variant="outline"
                    colorScheme="red"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeclineModification(thread);
                    }}
                  >
                    Decline
                  </Button>
                )}
              </HStack>
            )}
          </VStack>
        </Flex>
      </CardBody>
    </Card>
  );
}

