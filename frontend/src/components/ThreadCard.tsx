/**
 * Thread Card Component
 * 
 * Displays a summary card for a reservation thread with restaurant info,
 * party size, datetime, and current status.
 */

import {
  Badge,
  Box,
  Card,
  CardBody,
  Flex,
  Heading,
  Text,
  VStack,
} from '@chakra-ui/react';
import type { ReservationThread } from '../contexts/ReservationContext';

interface ThreadCardProps {
  thread: ReservationThread;
  onClick: () => void;
}

export function ThreadCard({ thread, onClick }: ThreadCardProps) {
  const statusColorScheme = {
    sent: 'blue',
    confirmed: 'green',
    declined: 'red',
    suggested: 'orange',
    modification_requested: 'orange',
    expired: 'gray',
    cancelled: 'gray',
  };

  const statusLabel = {
    sent: 'Sent',
    confirmed: 'Confirmed',
    declined: 'Declined',
    suggested: 'Alternative Suggested',
    modification_requested: 'Modification Requested',
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

            <Text fontSize="xs" color="gray.400">
              {formatLastUpdated(thread.lastUpdated)}
            </Text>
          </VStack>

          <Badge
            colorScheme={statusColorScheme[thread.status]}
            fontSize="xs"
            px={2}
            py={1}
          >
            {statusLabel[thread.status]}
          </Badge>
        </Flex>
      </CardBody>
    </Card>
  );
}

