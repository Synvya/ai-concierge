import { useCallback } from 'react';
import { useNostrIdentity } from './useNostrIdentity';
import { useReservations, type ReservationThread } from '../contexts/ReservationContext';
import { buildReservationModificationResponse } from '../lib/nostr/reservationEvents';
import { wrapEvent, unwrapEvent } from '../lib/nostr/nip59';
import { publishToRelays } from '../lib/nostr/relayPool';
import { npubToHex } from '../lib/nostr/keys';
import type { ReservationModificationResponse } from '../types/reservation';
import type { ReservationMessage } from '../services/reservationMessenger';
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

      // Find the modification request message to extract the original 9901 rumor ID
      const modificationRequestMessage = thread.messages.find(
        (m) => m.type === 'modification_request'
      );

      if (!modificationRequestMessage) {
        throw new Error('Modification request message not found in thread');
      }

      // Extract the original 9901 request rumor ID from the modification request's e tag
      // Per NIP-RR: kind:9903 MUST include ["e", "<unsigned-9901-rumor-id>", "", "root"]
      const rootETag = modificationRequestMessage.rumor.tags.find(
        (tag) => Array.isArray(tag) && tag[0] === 'e' && tag[3] === 'root'
      );

      if (!rootETag || !Array.isArray(rootETag) || typeof rootETag[1] !== 'string') {
        throw new Error(
          'Modification request must include an e tag with the original 9901 request rumor ID'
        );
      }

      const originalRequestRumorId = rootETag[1];

      console.log('[useModificationResponse] Extracted original 9901 request rumor ID:', originalRequestRumorId);
      console.log('[useModificationResponse] Modification request rumor ID:', modificationRequestMessage.rumor.id);
      console.log('[useModificationResponse] Thread ID:', thread.threadId);

      // Per NIP-RR: kind:9904 MUST include ["e", "<unsigned-9901-rumor-id>", "", "root"]
      // We reference the original request rumor ID, not the modification request
      const additionalTags: string[][] = [
        ["e", originalRequestRumorId, "", "root"],  // Reference original 9901 request rumor ID
      ];

      // Create ONE rumor template with p tag pointing to the restaurant (the actual recipient)
      // The p tag represents who the message is intended for, not who can decrypt it
      const rumorTemplate = buildReservationModificationResponse(
        response,
        nostrIdentity.privateKeyHex,
        restaurantPubkeyHex,  // p tag points to restaurant (the recipient)
        additionalTags
      );

      // Wrap the SAME rumor in two gift wraps with different encryption targets
      const giftWrapToMerchant = wrapEvent(
        rumorTemplate,  // Same rumor template!
        nostrIdentity.privateKeyHex,
        restaurantPubkeyHex  // Encrypted for merchant to decrypt
      );

      const giftWrapToSelf = wrapEvent(
        rumorTemplate,  // Same rumor template!
        nostrIdentity.privateKeyHex,
        nostrIdentity.publicKeyHex  // Encrypted for self to decrypt
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

      // Unwrap the self-CC to get the rumor with its ID
      // Per NIP-17: The rumor ID is the same for both gift wraps (to merchant and to self)
      const selfCCRumor = unwrapEvent(giftWrapToSelf, nostrIdentity.privateKeyHex);

      // Add to reservation context for tracking
      const reservationMessage: ReservationMessage = {
        rumor: selfCCRumor,
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

