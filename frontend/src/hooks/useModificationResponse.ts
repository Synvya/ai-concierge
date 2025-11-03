import { useCallback } from 'react';
import { useNostrIdentity } from './useNostrIdentity';
import { useReservations, type ReservationThread } from '../contexts/ReservationContext';
import { buildReservationModificationResponse } from '../lib/nostr/reservationEvents';
import { wrapEvent } from '../lib/nostr/nip59';
import { publishToRelays } from '../lib/nostr/relayPool';
import { npubToHex } from '../lib/nostr/keys';
import type { ReservationModificationResponse } from '../types/reservation';
import type { ReservationMessage } from '../services/reservationMessenger';
import type { Rumor } from '../lib/nostr/nip59';
import { useToast } from '@chakra-ui/react';

/**
 * Hook for sending modification responses
 * @param setIsLoading Optional callback to set loading state
 */
export function useModificationResponse(setIsLoading?: (loading: boolean) => void) {
  const nostrIdentity = useNostrIdentity();
  const { addOutgoingMessage } = useReservations();
  const toast = useToast();

  const sendModificationResponse = useCallback(async (
    thread: ReservationThread,
    status: 'accepted' | 'declined',
    message?: string
  ) => {
    if (!nostrIdentity) {
      toast({
        title: 'Nostr keys not available',
        description: 'Please refresh the page and try again.',
        status: 'error',
      });
      return;
    }

    if (!thread.modificationRequest) {
      toast({
        title: 'Modification request not found',
        description: 'Unable to find the modification request to respond to.',
        status: 'error',
      });
      return;
    }

    try {
      setIsLoading?.(true);

      const restaurantPubkeyHex = npubToHex(thread.restaurantNpub);
      if (!restaurantPubkeyHex) {
        throw new Error('Invalid restaurant public key');
      }

      // Build modification response payload
      const response: ReservationModificationResponse = {
        status,
        iso_time: status === 'accepted' ? thread.modificationRequest.iso_time : undefined,
        message,
      };

      // Find the modification request message to get its event ID for threading
      const modificationRequestMessage = thread.messages.find(
        (m) => m.type === 'modification_request'
      );

      if (!modificationRequestMessage) {
        throw new Error('Modification request message not found in thread');
      }

      // Build NIP-10 thread tags:
      // - root: original request (thread.threadId)
      // - reply: modification request (modificationRequestMessage.giftWrap.id)
      const additionalTags: string[][] = [
        ["e", thread.threadId, "", "root"],  // Link to original request
        ["e", modificationRequestMessage.giftWrap.id, "", "reply"],  // Reply to modification request
      ];

      const rumorToMerchant = buildReservationModificationResponse(
        response,
        nostrIdentity.privateKeyHex,
        restaurantPubkeyHex,
        additionalTags
      );

      const rumorToSelf = buildReservationModificationResponse(
        response,
        nostrIdentity.privateKeyHex,
        nostrIdentity.publicKeyHex,
        additionalTags
      );

      // Create gift wraps
      const giftWrapToMerchant = wrapEvent(
        rumorToMerchant,
        nostrIdentity.privateKeyHex,
        restaurantPubkeyHex
      );

      const giftWrapToSelf = wrapEvent(
        rumorToSelf,
        nostrIdentity.privateKeyHex,
        nostrIdentity.publicKeyHex
      );

      console.log('📤 Sent modification response - Thread ID:', giftWrapToMerchant.id);
      console.log('📤 Self CC - Thread ID:', giftWrapToSelf.id);

      // Publish to default relays
      const relays = [
        'wss://relay.damus.io',
        'wss://nos.lol',
        'wss://relay.nostr.band',
      ];

      // Publish BOTH gift wraps to relays
      await Promise.all([
        publishToRelays(giftWrapToMerchant, relays),
        publishToRelays(giftWrapToSelf, relays),
      ]);

      // Add to reservation context for tracking
      const rumorWithId: Rumor = {
        ...rumorToSelf,
        id: giftWrapToMerchant.id,
        pubkey: nostrIdentity.publicKeyHex,
      };

      const reservationMessage: ReservationMessage = {
        rumor: rumorWithId,
        type: 'modification_response',
        payload: response,
        senderPubkey: nostrIdentity.publicKeyHex,
        giftWrap: giftWrapToMerchant,
      };

      addOutgoingMessage(reservationMessage, thread.restaurantId, thread.restaurantName, thread.restaurantNpub);

      toast({
        title: `Modification ${status === 'accepted' ? 'accepted' : 'declined'}`,
        description: `Sent to ${thread.restaurantName}`,
        status: 'success',
      });
    } catch (error) {
      console.error('Failed to send modification response:', error);
      toast({
        title: 'Failed to send modification response',
        description: error instanceof Error ? error.message : 'Please try again.',
        status: 'error',
      });
      throw error;
    } finally {
      setIsLoading?.(false);
    }
  }, [nostrIdentity, toast, addOutgoingMessage, setIsLoading]);

  return { sendModificationResponse };
}

