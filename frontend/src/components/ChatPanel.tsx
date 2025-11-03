import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  CardBody,
  Image,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Heading,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Link,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Stack,
  Tag,
  TagCloseButton,
  Text,
  Tooltip,
  Wrap,
  WrapItem,
  useToast,
  useDisclosure,
  Icon,
} from '@chakra-ui/react'
import { ArrowForwardIcon } from '@chakra-ui/icons'

import { useClientIds } from '../hooks/useClientIds'
import { useNostrIdentity } from '../hooks/useNostrIdentity'
import { useUserContactInfo } from '../hooks/useUserContactInfo'
import { useReservations, type ReservationThread } from '../contexts/ReservationContext'
import type {
  ChatMessage,
  ChatResponse,
  GeoPoint,
  ListingPrice,
  ProductListing,
  ActiveReservationContext,
  SellerResult,
} from '../lib/api'
import { chat } from '../lib/api'
import type { ReservationIntent } from '../lib/parseReservationIntent'
import { buildReservationRequest } from '../lib/nostr/reservationEvents'
import { wrapEvent } from '../lib/nostr/nip59'
import { publishToRelays } from '../lib/nostr/relayPool'
import { npubToHex } from '../lib/nostr/keys'
import { getRestaurantDisplayName } from '../lib/restaurantName'
import type { ReservationMessage } from '../services/reservationMessenger'
import type { Rumor } from '../lib/nostr/nip59'
import type { ReservationRequest } from '../types/reservation'

const ASSISTANT_NAME = 'Synvya Concierge'
const ASSISTANT_AVATAR_URL = '/assets/doorman.png'
const USER_AVATAR_URL = '/assets/user.png'
const LINK_REGEX = /(https?:\/\/[^\s]+)/g
const LOCATION_STORAGE_KEY = 'ai-concierge-shared-location'
const PROCESSED_RESPONSES_STORAGE_KEY = 'ai-concierge-processed-responses'

const ACCEPTANCE_PATTERNS = [
  /\byes\b/i,
  /\baccept\b/i,
  /\bconfirm\b/i,
  /\bgo ahead\b/i,
  /\bthat works\b/i,
  /\bsounds good\b/i,
  /\bsure\b/i,
  /\bok\b/i,
  /\bokay\b/i,
  /\blet'?s go\b/i,
  /\blet'?s do it\b/i,
] as const

const RESERVATION_KEYWORD_PATTERNS = [/\breservation\b/i, /\bbook\b/i, /\btable\b/i] as const
const PARTY_SIZE_PATTERN = /\bfor\s+(\d+)(?:\s+(?:people|person|guests?|pax))?\b/i

function extractTimesInMinutes(message: string): number[] {
  const times = new Set<number>()
  const normalized = message.toLowerCase()

  const timeWithMinutes = normalized.matchAll(/\b(\d{1,2})(?::|\.)(\d{2})\s*(am|pm)?\b/g)
  for (const match of timeWithMinutes) {
    const hours = parseInt(match[1] ?? '', 10)
    const minutes = parseInt(match[2] ?? '', 10)
    if (Number.isNaN(hours) || Number.isNaN(minutes) || hours > 23 || minutes > 59) {
      continue
    }
    const meridiem = match[3]?.toLowerCase()
    let hours24 = hours
    if (meridiem === 'pm' && hours24 !== 12) {
      hours24 += 12
    } else if (meridiem === 'am' && hours24 === 12) {
      hours24 = 0
    }
    times.add(hours24 * 60 + minutes)
  }

  const timeWithMeridiem = normalized.matchAll(/\b(\d{1,2})\s*(am|pm)\b/g)
  for (const match of timeWithMeridiem) {
    const hours = parseInt(match[1] ?? '', 10)
    if (Number.isNaN(hours) || hours > 12 || hours === 0) {
      continue
    }
    const meridiem = match[2]?.toLowerCase()
    let hours24 = hours
    if (meridiem === 'pm' && hours24 !== 12) {
      hours24 += 12
    } else if (meridiem === 'am' && hours24 === 12) {
      hours24 = 0
    }
    times.add(hours24 * 60)
  }

  return Array.from(times)
}

function getMinutesFromIsoTime(iso?: string): number | null {
  if (!iso) return null
  const match = iso.match(/T(\d{2}):(\d{2})/)
  if (!match) return null
  const hours = parseInt(match[1] ?? '', 10)
  const minutes = parseInt(match[2] ?? '', 10)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null
  }
  return hours * 60 + minutes
}

export function buildActiveContextForSuggestionAcceptance(
  message: string,
  thread: ReservationThread | undefined,
): ActiveReservationContext | undefined {
  if (!thread || thread.status !== 'suggested') {
    return undefined
  }
  if (thread.restaurantId === 'unknown' || !thread.suggestedTime) {
    return undefined
  }

  const trimmedMessage = message.trim()
  if (!trimmedMessage) {
    return undefined
  }

  const containsAcceptance = ACCEPTANCE_PATTERNS.some((pattern) => pattern.test(trimmedMessage))
  if (!containsAcceptance) {
    return undefined
  }

  const hasReservationKeyword = RESERVATION_KEYWORD_PATTERNS.some((pattern) => pattern.test(trimmedMessage))
  const hasPartySizeDetail = PARTY_SIZE_PATTERN.test(trimmedMessage)
  const timeMentions = extractTimesInMinutes(trimmedMessage)

  let hasConflictingTime = false
  if (timeMentions.length > 0) {
    const suggestedMinutes = getMinutesFromIsoTime(thread.suggestedTime ?? thread.request.isoTime)
    if (suggestedMinutes === null) {
      hasConflictingTime = true
    } else {
      hasConflictingTime = timeMentions.some((value) => value !== suggestedMinutes)
    }
  }

  if (hasReservationKeyword || hasPartySizeDetail || hasConflictingTime) {
    return undefined
  }

  return {
    restaurant_id: thread.restaurantId,
    restaurant_name: thread.restaurantName,
    npub: thread.restaurantNpub,
    party_size: thread.request.partySize,
    original_time: thread.request.isoTime,
    suggested_time: thread.suggestedTime,
    thread_id: thread.threadId,
  }
}

const SuggestedQuery = ({ label, onClick }: { label: string; onClick: (value: string) => void }) => (
  <Tag
    as="button"
    size="lg"
    variant="outline"
    justifyContent="flex-start"
    textAlign="left"
    whiteSpace="normal"
    onClick={() => onClick(label)}
  >
    {label}
  </Tag>
)

const renderMessageContent = (text: string) =>
  text.split(/\n\n+/).map((paragraph, paragraphIdx) => (
    <Stack key={`paragraph-${paragraphIdx}`} spacing={1}>
      {paragraph.split('\n').map((line, lineIdx) => {
        const parts = line.split(LINK_REGEX)
        return (
          <Text key={`line-${paragraphIdx}-${lineIdx}`} whiteSpace="pre-wrap">
            {parts.map((part, partIdx) => {
              const isLink = partIdx % 2 === 1
              if (isLink) {
                return (
                  <Link
                    key={`link-${paragraphIdx}-${lineIdx}-${partIdx}`}
                    href={part}
                    target="_blank"
                    rel="noreferrer"
                    color="purple.600"
                  >
                    {part}
                  </Link>
                )
              }
              return (
                <span key={`text-${paragraphIdx}-${lineIdx}-${partIdx}`}>{part}</span>
              )
            })}
          </Text>
        )
      })}
    </Stack>
  ))

const initialMessages: ChatMessage[] = [
  {
    role: 'assistant',
    content:
      'Hey there! I can help you discover local spots for dining, shopping, wellness, and more. What are you in the mood for today?',
  },
]

export const ChatPanel = () => {
  const { visitorId, sessionId, resetSession } = useClientIds()
  const nostrIdentity = useNostrIdentity()
  const { contactInfo, setContactInfo, hasContactInfo } = useUserContactInfo()
  const { addOutgoingMessage, threads: reservationThreads } = useReservations()
  const toast = useToast()
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [isLoading, setIsLoading] = useState(false)
  const [sharedLocation, setSharedLocation] = useState<{
    label?: string
    coords?: GeoPoint
    status: 'idle' | 'pending' | 'granted' | 'denied'
  }>({ status: 'idle' })
  
  // Initialize processedResponsesRef from localStorage using useMemo for lazy initialization
  const initialProcessedResponses = useMemo(() => {
    try {
      const cached = localStorage.getItem(PROCESSED_RESPONSES_STORAGE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached) as string[]
        return new Set(parsed)
      }
    } catch (error) {
      console.error('Failed to load processed responses from localStorage:', error)
    }
    return new Set<string>()
  }, [])
  
  const processedResponsesRef = useRef<Set<string>>(initialProcessedResponses)
  
  // Contact info modal state
  const { isOpen: isContactModalOpen, onOpen: onContactModalOpen, onClose: onContactModalClose } = useDisclosure()
  const [tempName, setTempName] = useState('')
  const [tempPhone, setTempPhone] = useState('')
  const [pendingReservation, setPendingReservation] = useState<{
    restaurant: SellerResult;
    intent: ReservationIntent;
  } | null>(null)

  // Read cached location from session storage if present
  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(LOCATION_STORAGE_KEY)
      if (cached) {
        const parsed = JSON.parse(cached) as { label?: string; coords?: GeoPoint }
        if (
          parsed?.coords &&
          typeof parsed.coords.latitude === 'number' &&
          typeof parsed.coords.longitude === 'number'
        ) {
          setSharedLocation({ label: parsed.label, coords: parsed.coords, status: 'granted' })
        }
      }
    } catch {
      // ignore malformed cache
    }
  }, [])

  // Clean up processed responses that are no longer in any thread
  useEffect(() => {
    if (!reservationThreads || reservationThreads.length === 0) return
    
    // Get all current response IDs from all threads
    const currentResponseIds = new Set<string>()
    reservationThreads.forEach((thread) => {
      thread.messages
        .filter((m) => m.type === 'response')
        .forEach((m) => currentResponseIds.add(m.giftWrap.id))
    })
    
    // Remove any processed IDs that are no longer in any thread
    const processedIds = Array.from(processedResponsesRef.current)
    const validIds = processedIds.filter((id) => currentResponseIds.has(id))
    
    // Only update if something was removed
    if (validIds.length < processedIds.length) {
      processedResponsesRef.current = new Set(validIds)
      try {
        localStorage.setItem(PROCESSED_RESPONSES_STORAGE_KEY, JSON.stringify(validIds))
      } catch (error) {
        console.error('Failed to save cleaned up processed responses:', error)
      }
    }
  }, [reservationThreads])

  // Watch for new reservation responses and notify user
  useEffect(() => {
    // Guard against undefined reservationThreads
    if (!reservationThreads) return
    
    reservationThreads.forEach((thread) => {
      // Get the latest response message
      const responseMessages = thread.messages.filter((m) => m.type === 'response')
      if (responseMessages.length === 0) return

      const latestResponse = responseMessages[responseMessages.length - 1]
      const responseId = latestResponse.giftWrap.id

      // Check if we've already processed this response
      if (processedResponsesRef.current.has(responseId)) return

      // Mark as processed immediately to prevent duplicate processing
      processedResponsesRef.current.add(responseId)
      
      // Persist to localStorage
      try {
        const processedArray = Array.from(processedResponsesRef.current)
        localStorage.setItem(PROCESSED_RESPONSES_STORAGE_KEY, JSON.stringify(processedArray))
      } catch (error) {
        console.error('Failed to save processed responses to localStorage:', error)
      }

      // Get response details
      const response = latestResponse.payload as any
      const status = response.status
      const restaurantName = thread.restaurantName

      // Format the chat notification message
      let notificationTitle = ''
      let notificationDescription = ''

      switch (status) {
        case 'confirmed':
          notificationTitle = '✅ Reservation Confirmed!'
          notificationDescription = `Your reservation at ${restaurantName} has been confirmed${
            response.iso_time ? ` for ${new Date(response.iso_time).toLocaleString()}` : ''
          }.${response.table ? ` Table: ${response.table}` : ''}${
            response.message ? `\n\n${response.message}` : ''
          }`
          break
        case 'suggested':
          notificationTitle = '💡 Alternative Time Suggested'
          notificationDescription = `${restaurantName} suggested ${
            response.iso_time ? new Date(response.iso_time).toLocaleString() : 'an alternative time'
          } instead.${response.message ? `\n\n${response.message}` : ''}`
          break
        case 'declined':
          notificationTitle = '❌ Reservation Declined'
          notificationDescription = `${restaurantName} could not accommodate your request.${
            response.message ? `\n\n${response.message}` : ''
          }`
          break
        case 'expired':
          notificationTitle = '⏰ Reservation Expired'
          notificationDescription = `Your hold at ${restaurantName} has expired.${
            response.message ? `\n\n${response.message}` : ''
          }`
          break
        case 'cancelled':
          notificationTitle = '🚫 Reservation Cancelled'
          notificationDescription = `Your reservation at ${restaurantName} was cancelled.${
            response.message ? `\n\n${response.message}` : ''
          }`
          break
        default:
          notificationTitle = '📬 Reservation Update'
          notificationDescription = `${restaurantName} sent a response about your reservation.${
            response.message ? `\n\n${response.message}` : ''
          }`
      }

      // Add message to chat
      const chatMessage: ChatMessage = {
        role: 'assistant',
        content: `${notificationTitle}\n\n${notificationDescription}`,
      }
      setMessages((prev) => [...prev, chatMessage])
    })
  }, [reservationThreads])

  const sendReservationRequest = useCallback(async (
    restaurant: SellerResult,
    intent: ReservationIntent,
    overrideContactInfo?: { name: string; phone: string },
    threadId?: string  // Optional thread ID to link this request to an original suggestion
  ) => {
    // Use override contact info if provided (from modal submission), otherwise check stored contact info
    const effectiveContactInfo = overrideContactInfo || contactInfo
    
    // Check if we have contact info - if not, show modal
    if (!effectiveContactInfo) {
      setPendingReservation({ restaurant, intent })
      onContactModalOpen()
      return
    }

    if (!nostrIdentity) {
      toast({
        title: 'Nostr keys not available',
        description: 'Please refresh the page and try again.',
        status: 'error',
      })
      return
    }

    if (!restaurant.npub) {
      toast({
        title: 'Restaurant not available',
        description: 'This restaurant does not support Nostr reservations.',
        status: 'error',
      })
      return
    }

    try {
      setIsLoading(true)

      const restaurantPubkeyHex = npubToHex(restaurant.npub)
      if (!restaurantPubkeyHex) {
        throw new Error('Invalid restaurant public key')
      }

      // Build reservation request with contact info
      const request: ReservationRequest = {
        party_size: intent.partySize!,
        iso_time: intent.time!,
        contact: {
          name: effectiveContactInfo.name,
          phone: effectiveContactInfo.phone,
        },
      }
      
      // Only include notes if it's a non-empty string
      if (intent.notes && intent.notes.trim()) {
        request.notes = intent.notes
      }

      // IMPORTANT: Implement "Self CC" per NIP-17 pattern
      // Create TWO separate request templates with DIFFERENT encryption:
      // 1. Request TO merchant (encrypted for merchant to read)
      // 2. Request TO self (encrypted for self to read - Self CC)
      
      // If threadId is provided, add e tag to link this to the original request (NIP-10 threading)
      const additionalTags: string[][] = []
      if (threadId) {
        // Link to the original request thread - this indicates we're accepting their suggestion
        additionalTags.push(["e", threadId, "", "root"])
      }
      
      const rumorToMerchant = buildReservationRequest(
        request,
        nostrIdentity.privateKeyHex,
        restaurantPubkeyHex,  // Encrypted TO merchant
        additionalTags
      )

      const rumorToSelf = buildReservationRequest(
        request,
        nostrIdentity.privateKeyHex,
        nostrIdentity.publicKeyHex,  // Encrypted TO self (Self CC)
        additionalTags
      )

      // Create TWO gift wraps
      const giftWrapToMerchant = wrapEvent(
        rumorToMerchant, 
        nostrIdentity.privateKeyHex, 
        restaurantPubkeyHex  // Addressed to merchant
      )

      const giftWrapToSelf = wrapEvent(
        rumorToSelf, 
        nostrIdentity.privateKeyHex, 
        nostrIdentity.publicKeyHex  // Addressed to self
      )
      
      console.log('📤 Sent reservation request - Thread ID:', giftWrapToMerchant.id)
      console.log('📤 Self CC - Thread ID:', giftWrapToSelf.id)

      // Publish to default relays
      const relays = [
        'wss://relay.damus.io',
        'wss://nos.lol',
        'wss://relay.nostr.band',
      ]

      // Publish BOTH gift wraps to relays (Self CC ensures persistence across devices)
      await Promise.all([
        publishToRelays(giftWrapToMerchant, relays),
        publishToRelays(giftWrapToSelf, relays),
      ])

      // Add to reservation context for tracking
      // Convert EventTemplate to Rumor by adding required id field
      // Use the Self CC rumor since that's the one we can decrypt
      const rumorWithId: Rumor = {
        ...rumorToSelf,
        id: giftWrapToMerchant.id, // Use merchant gift wrap ID as thread ID
        pubkey: nostrIdentity.publicKeyHex,
      };

      const reservationMessage: ReservationMessage = {
        rumor: rumorWithId,
        type: 'request',
        payload: request,
        senderPubkey: nostrIdentity.publicKeyHex,
        giftWrap: giftWrapToMerchant,
      }
      const restaurantDisplayName = getRestaurantDisplayName(restaurant);
      addOutgoingMessage(reservationMessage, restaurant.id, restaurantDisplayName, restaurant.npub)

      // Show success message
      const confirmationMessage: ChatMessage = {
        role: 'assistant',
        content: `Great! I've sent your reservation request to ${restaurantDisplayName} for ${intent.partySize} people at ${new Date(intent.time!).toLocaleString()}.${intent.notes ? ` Note: "${intent.notes}"` : ''}\n\nYou'll receive a response from the restaurant shortly.`,
      }
      setMessages((prev) => [...prev, confirmationMessage])

      toast({
        title: 'Reservation request sent',
        description: `Sent to ${restaurantDisplayName}`,
        status: 'success',
      })
    } catch (error) {
      console.error('Failed to send reservation:', error)
      toast({
        title: 'Failed to send reservation',
        description: error instanceof Error ? error.message : 'Please try again.',
        status: 'error',
      })
    } finally {
      setIsLoading(false)
    }
  }, [nostrIdentity, toast, addOutgoingMessage, contactInfo, onContactModalOpen, setPendingReservation])

  // Handler for saving contact info and proceeding with reservation
  const handleContactInfoSubmit = useCallback(() => {
    if (!tempName.trim() || !tempPhone.trim()) {
      toast({
        title: 'Required fields',
        description: 'Please enter both your name and phone number.',
        status: 'warning',
      })
      return
    }

    // Normalize phone number (remove all non-digit characters except leading +)
    const normalizedPhone = tempPhone.trim().replace(/^(\+)?(\d+)[\s\-\(\)]+/, '$1$2').replace(/[\s\-\(\)]/g, '')
    
    // Create contact info object
    const newContactInfo = {
      name: tempName.trim(),
      phone: normalizedPhone
    }
    
    // Save contact info to localStorage
    setContactInfo(newContactInfo)
    
    // Close modal
    onContactModalClose()
    
    // Clear temp values
    setTempName('')
    setTempPhone('')
    
    // Proceed with pending reservation if any, passing the new contact info directly
    if (pendingReservation) {
      // Pass the contact info directly to avoid race condition with state updates
      sendReservationRequest(pendingReservation.restaurant, pendingReservation.intent, newContactInfo)
      setPendingReservation(null)
    }
  }, [tempName, tempPhone, setContactInfo, onContactModalClose, pendingReservation, toast, sendReservationRequest])

  const handleChatResponse = useCallback(async (payload: ChatResponse) => {
    // Only add assistant message if there's actual content or no reservation action
    // (avoids showing empty/negative message when making a reservation)
    if (payload.answer && payload.answer.trim()) {
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: payload.answer,
        attachments: payload.results,
      }
      setMessages((prev) => [...prev, assistantMessage])
    }

    // Handle reservation action from backend
    if (payload.reservation_action) {
      const action = payload.reservation_action
      // Find the restaurant in the results
      const restaurant = payload.results.find(r => r.id === action.restaurant_id)
      
      if (restaurant && restaurant.npub) {
        // Automatically send the reservation request
        await sendReservationRequest(restaurant, {
          restaurantName: action.restaurant_name,
          partySize: action.party_size,
          time: action.iso_time,
          notes: action.notes,
        }, undefined, action.thread_id) // Pass thread_id to link to original request if accepting a suggestion
      } else {
        toast({
          title: 'Restaurant not found',
          description: 'Could not find the restaurant to complete the reservation.',
          status: 'error',
        })
      }
    }
  }, [sendReservationRequest, toast])

  const canSend = useMemo(
    () => Boolean(inputValue.trim()) && Boolean(sessionId) && Boolean(visitorId) && !isLoading,
    [inputValue, sessionId, visitorId, isLoading],
  )

  const handleSubmit = useCallback(async () => {
    if (!sessionId || !visitorId || !inputValue.trim()) {
      return
    }

    const userMessage: ChatMessage = { role: 'user', content: inputValue }
    const nextHistory = [...messages, userMessage]
    setMessages(nextHistory)
    setInputValue('')

    // Check if there's an active "suggested" reservation to include context
    // Only pass this if the user's message seems to be accepting the suggestion (not making a new request)
    let activeReservationContext: ActiveReservationContext | undefined
    if (reservationThreads && reservationThreads.length > 0) {
      const suggestedThread = reservationThreads.find((t) => t.status === 'suggested')
      activeReservationContext = buildActiveContextForSuggestionAcceptance(
        userMessage.content,
        suggestedThread,
      )
    }

    // Always send to backend - let OpenAI handle the intelligence
    setIsLoading(true)
    try {
      const payload = await chat({
        message: userMessage.content,
        session_id: sessionId,
        visitor_id: visitorId,
        history: nextHistory,
        user_location: sharedLocation.status === 'granted' ? sharedLocation.label : undefined,
        user_coordinates: sharedLocation.status === 'granted' ? sharedLocation.coords : undefined,
        active_reservation_context: activeReservationContext,
      })
      await handleChatResponse(payload)
    } catch (error) {
      toast({
        title: 'Something went wrong',
        description: 'Please try again in a moment.',
        status: 'error',
      })
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setIsLoading(false)
    }
  }, [sessionId, visitorId, inputValue, messages, toast, handleChatResponse, sharedLocation, reservationThreads])

  const handleSuggestedQuery = (query: string) => {
    setInputValue(query)
  }

  const startNewSession = () => {
    resetSession()
    setMessages(initialMessages)
  }

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (canSend) {
        handleSubmit()
      }
    }
  }

  const formatPrice = (price?: ListingPrice) => {
    if (!price) {
      return undefined
    }
    const { amount, currency, frequency } = price
    const parts: string[] = []

    if (typeof amount === 'number') {
      if (currency) {
        try {
          const fractionDigits = Number.isInteger(amount) ? 0 : 2
          parts.push(
            new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency,
              minimumFractionDigits: fractionDigits,
              maximumFractionDigits: fractionDigits,
            }).format(amount),
          )
        } catch {
          parts.push(`${amount}${currency ? ` ${currency}` : ''}`)
        }
      } else {
        const fractionDigits = Number.isInteger(amount) ? 0 : 2
        parts.push(amount.toFixed(fractionDigits))
      }
    } else if (currency) {
      parts.push(currency)
    }

    if (frequency) {
      parts.push(frequency)
    }

    return parts.join(' ')
  }

  const formatMiles = (value?: number) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return undefined
    const miles = Math.max(0, value) * 0.621371
    const fractionDigits = miles < 10 ? 1 : 0
    return `${miles.toFixed(fractionDigits)} mi`
  }

  const getMetaString = (meta: Record<string, unknown> | undefined, key: string) => {
    if (!meta) {
      return undefined
    }
    const value = meta[key]
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined
  }

  const extractSellerDescription = (seller: SellerResult, meta: Record<string, unknown>) => {
    const pickString = (value: unknown) =>
      typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined

    const metaAbout = pickString(meta['about'])
    if (metaAbout) {
      return metaAbout
    }

    const parseContentObject = (value: unknown): Record<string, unknown> | undefined => {
      if (!value) {
        return undefined
      }
      if (typeof value === 'object') {
        return value as Record<string, unknown>
      }
      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try {
            const parsed = JSON.parse(trimmed)
            if (parsed && typeof parsed === 'object') {
              return parsed as Record<string, unknown>
            }
          } catch {
            return undefined
          }
        }
      }
      return undefined
    }

    const contentObject = parseContentObject(seller.content)
    if (contentObject) {
      const fromObject =
        pickString(contentObject.about) ??
        pickString(contentObject['summary']) ??
        pickString(contentObject['description'])
      if (fromObject) {
        return fromObject
      }
    }

    if (typeof seller.content === 'string') {
      const trimmed = seller.content.trim()
      if (trimmed.length > 0 && !(trimmed.startsWith('{') && trimmed.endsWith('}'))) {
        return trimmed
      }
    }

    return undefined
  }

  const pickListingImage = (images?: ProductListing['images']) => {
    if (!Array.isArray(images)) {
      return undefined
    }
    for (const entry of images) {
      if (typeof entry === 'string' && entry.trim().length > 0) {
        return entry.trim()
      }
    }
    for (const entry of images) {
      if (entry && typeof entry === 'object') {
        const url = (entry as { url?: string | null }).url
        if (typeof url === 'string' && url.trim().length > 0) {
          return url.trim()
        }
      }
    }
    return undefined
  }

  const renderAttachments = (attachments?: SellerResult[]) => {
    if (!attachments?.length) {
      return null
    }

    const parseMetaData = (metaData: SellerResult['meta_data']) => {
      if (!metaData) {
        return {}
      }
      if (typeof metaData === 'object') {
        return metaData as Record<string, unknown>
      }
      if (typeof metaData === 'string') {
        try {
          const parsed = JSON.parse(metaData)
          if (parsed && typeof parsed === 'object') {
            return parsed as Record<string, unknown>
          }
        } catch {
          return {}
        }
      }
      return {}
    }

    const aggregateMap = new Map<
      string,
      { seller: SellerResult; meta: Record<string, unknown> }
    >()

    for (const seller of attachments) {
      const meta = parseMetaData(seller.meta_data)
      const canonical =
        (typeof meta.public_key === 'string' && meta.public_key) ||
        (typeof meta.seller === 'string' && meta.seller) ||
        (typeof seller.id === 'string' && seller.id) ||
        (typeof seller.name === 'string' && seller.name) ||
        undefined
      const key = canonical ? canonical.trim().toLowerCase() : `__fallback_${seller.id}`
      const existing = aggregateMap.get(key)
      const incomingListings = Array.isArray(seller.listings) ? seller.listings : []

      if (existing) {
        const mergedListings = Array.isArray(existing.seller.listings)
          ? [...existing.seller.listings]
          : []
        const seenIds = new Set(mergedListings.map((item) => item.id))
        for (const listing of incomingListings) {
          if (listing && listing.id && !seenIds.has(listing.id)) {
            mergedListings.push(listing)
            seenIds.add(listing.id)
          }
        }
        existing.seller = {
          ...existing.seller,
          listings: mergedListings,
        }
      } else {
        aggregateMap.set(key, {
          seller: {
            ...seller,
            listings: [...incomingListings],
          },
          meta,
        })
      }
    }

    const productAttachments = Array.from(aggregateMap.values()).filter(
      ({ seller }) => Array.isArray(seller.listings) && seller.listings.length > 0,
    )

    if (!productAttachments.length) {
      return null
    }

    return (
      <Stack spacing={4}>
        {productAttachments.map(({ seller, meta }) => {
          const displayName =
            getMetaString(meta, 'display_name') ?? seller.name ?? 'Local merchant'
          const city = getMetaString(meta, 'city')
          const state = getMetaString(meta, 'state')
          const phone = getMetaString(meta, 'phone')
          const website = getMetaString(meta, 'website')
          const location = [city, state].filter(Boolean).join(', ')
          const listingsToShow: ProductListing[] = seller.listings ?? []
          const description = extractSellerDescription(seller, meta)

          return (
            <Card key={seller.id} variant="outline" borderColor="purple.100" bg="white">
              <CardBody>
                <Stack spacing={3}>
                  <Flex
                    direction={{ base: 'column', md: 'row' }}
                    justify="space-between"
                    align={{ base: 'flex-start', md: 'center' }}
                    gap={2}
                  >
                    <Box>
                      <Flex align="center" gap={2} flexWrap="wrap">
                      <Heading size="sm">{displayName}</Heading>
                        {seller.supports_reservations === true && (
                          <Tooltip
                            label="Tell me when you'd like to dine, and I'll make the reservation"
                            fontSize="xs"
                            hasArrow
                          >
                            <Badge
                              bgGradient="linear(to-r, purple.400, purple.600)"
                              color="white"
                              fontSize="xs"
                              px={3}
                              py={1}
                              borderRadius="full"
                              display="inline-flex"
                              alignItems="center"
                              gap={1}
                              cursor="help"
                              tabIndex={0}
                              aria-label="Tell me when you'd like to dine, and I'll make the reservation"
                              _hover={{ transform: 'scale(1.05)' }}
                              transition="transform 0.2s"
                            >
                              <Text as="span" role="img" aria-label="magic wand">
                                🪄
                              </Text>
                              <Text>Book via Concierge</Text>
                            </Badge>
                          </Tooltip>
                        )}
                      </Flex>
                      {location ? (
                        <Text fontSize="sm" color="gray.600">
                          {location}
                        </Text>
                      ) : null}
                      {typeof seller.geo_distance_km === 'number' ? (
                        <Flex gap={1} align="center">
                          <Icon boxSize="3" color="gray.500" viewBox="0 0 24 24" aria-hidden>
                            <path
                              fill="currentColor"
                              d="M12 2c-3.87 0-7 3.13-7 7c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7m0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5"
                            />
                          </Icon>
                          <Text fontSize="xs" color="gray.500">≈ {formatMiles(seller.geo_distance_km)} away</Text>
                        </Flex>
                      ) : null}
                    </Box>
                    <Stack direction="row" spacing={3} align="center">
                      {phone ? (
                        <Text fontSize="sm" color="gray.600">
                          {phone}
                        </Text>
                      ) : null}
                      {website ? (
                        <Link fontSize="sm" color="purple.600" href={website} target="_blank" rel="noreferrer">
                          Visit website
                        </Link>
                      ) : null}
                      {seller.maps_url ? (
                        <Link fontSize="sm" color="purple.600" href={seller.maps_url} target="_blank" rel="noreferrer">
                          Open in Maps
                        </Link>
                      ) : null}
                    </Stack>
                  </Flex>

                  {description ? (
                    <Text fontSize="sm" color="gray.700">
                      {description}
                    </Text>
                  ) : null}

                  <Stack spacing={2}>
                    <Heading size="xs" color="purple.600" textTransform="uppercase" letterSpacing="0.08em">
                      Featured products
                    </Heading>
                    <Stack spacing={3}>
                      {listingsToShow.map((listing) => {
                        const detail = listing.summary || listing.content
                        const priceLabel = formatPrice(listing.price)
                        const tags = (listing.tags ?? []).filter(Boolean).slice(0, 3)
                        const image = pickListingImage(listing.images)
                        const distanceLabel = formatMiles(listing.geo_distance_km as number | undefined)
                        return (
                          <Box
                            key={`${seller.id}-${listing.id}`}
                            borderLeftWidth="2px"
                            borderColor="purple.100"
                            pl={3}
                          >
                            <Stack spacing={1}>
                              {image ? (
                                <Box mb={2}>
                                  <Image
                                    src={image}
                                    alt={listing.title}
                                    maxH="160px"
                                    borderRadius="md"
                                    objectFit="cover"
                                  />
                                </Box>
                              ) : null}
                              <Text fontWeight="semibold">
                                {listing.title}
                                {priceLabel ? (
                                  <Text as="span" color="purple.600">
                                    {' '}
                                    · {priceLabel}
                                  </Text>
                                ) : null}
                              </Text>
                              {detail ? (
                                <Text fontSize="sm" color="gray.600">
                                  {detail}
                                </Text>
                              ) : null}
                              {listing.location ? (
                                <Text fontSize="xs" color="gray.500">
                                  {listing.location}
                                </Text>
                              ) : null}
                              {distanceLabel || listing.maps_url ? (
                                <Flex gap={2} align="center">
                                  {distanceLabel ? (
                                    <Flex gap={1} align="center">
                                      <Icon boxSize="3" color="gray.500" viewBox="0 0 24 24" aria-hidden>
                                        <path
                                          fill="currentColor"
                                          d="M12 2c-3.87 0-7 3.13-7 7c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7m0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5"
                                        />
                                      </Icon>
                                      <Text fontSize="xs" color="gray.500">≈ {distanceLabel} away</Text>
                                    </Flex>
                                  ) : null}
                                  {listing.maps_url ? (
                                    <Link fontSize="xs" color="purple.600" href={listing.maps_url} target="_blank" rel="noreferrer">
                                      Open in Maps
                                    </Link>
                                  ) : null}
                                </Flex>
                              ) : null}
                              {listing.url ? (
                                <Link fontSize="sm" color="purple.600" href={listing.url} target="_blank" rel="noreferrer">
                                  View details
                                </Link>
                              ) : null}
                              {tags.length ? (
                                <Wrap spacing={2}>
                                  {tags.map((tag) => (
                                    <WrapItem key={`${listing.id}-${tag}`}>
                                      <Tag size="sm" variant="subtle" colorScheme="purple">
                                        #{tag}
                                      </Tag>
                                    </WrapItem>
                                  ))}
                                </Wrap>
                              ) : null}
                            </Stack>
                          </Box>
                        )
                      })}
                    </Stack>
                  </Stack>
                </Stack>
              </CardBody>
            </Card>
          )
        })}
      </Stack>
    )
  }

  const geoSupported =
    typeof navigator !== 'undefined' &&
    !!(navigator as any).geolocation &&
    typeof (navigator as any).geolocation.getCurrentPosition === 'function'

  const requestLocation = useCallback(() => {
    if (!geoSupported) return
    setSharedLocation((prev) => ({ ...prev, status: 'pending' }))
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const label = `Lat ${latitude.toFixed(4)}°, Lon ${longitude.toFixed(4)}°`
        const coords = { latitude, longitude }
        setSharedLocation({ label, coords, status: 'granted' })
        try {
          sessionStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify({ label, coords }))
        } catch {
          // ignore cache write errors
        }
        toast({ title: 'Location shared', description: label, status: 'success', duration: 3000 })
      },
      (err) => {
        const code = (err && (err as GeolocationPositionError).code) || 0
        if (code === 1) {
          setSharedLocation({ status: 'denied' })
          toast({
            title: 'Permission denied',
            description: 'Allow location access to personalize nearby results.',
            status: 'error',
          })
        } else if (code === 3) {
          setSharedLocation({ status: 'idle' })
          toast({ title: 'Location timeout', description: 'Please try again.', status: 'warning' })
        } else {
          setSharedLocation({ status: 'idle' })
          toast({ title: 'Location unavailable', description: 'Please try again later.', status: 'error' })
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [geoSupported, toast])

  const clearLocation = useCallback(() => {
    setSharedLocation({ status: 'idle' })
    try {
      sessionStorage.removeItem(LOCATION_STORAGE_KEY)
    } catch {
      // ignore
    }
    toast({ title: 'Stopped sharing location', status: 'info', duration: 2000 })
  }, [toast])

  return (
    <Flex direction="column" height="100%" gap={6}>
      <Stack spacing={6}>
        <Flex
          justify="space-between"
          align={{ base: 'stretch', md: 'center' }}
          direction={{ base: 'column', md: 'row' }}
          gap={4}
        >
          <Box>
            <Heading size="xl">Shop Snoqualmie Valley</Heading>
            <Text color="gray.500" maxW="2xl">
              Let our AI concierge surface businesses, products, and experiences tailored to you.
            </Text>
          </Box>
          <Button variant="outline" onClick={startNewSession} alignSelf="flex-start">
            Start new session
          </Button>
        </Flex>
        <Stack direction={{ base: 'column', md: 'row' }} spacing={4}>
          <SuggestedQuery
            label="Where should I grab coffee and breakfast in downtown Snoqualmie this weekend?"
            onClick={handleSuggestedQuery}
          />
          <SuggestedQuery label="Find me a family friendly Italian restaurant" onClick={handleSuggestedQuery} />
          <SuggestedQuery
            label="Are there any local wine rooms in Snoqualmie Valley for a casual night out?"
            onClick={handleSuggestedQuery}
          />
        </Stack>
      </Stack>

      <Flex direction="column" flex="1" gap={6} overflow="hidden">
        <Stack spacing={4} flex="1" overflowY="auto" pr={2}>
          {messages.map((message, index) => (
            <Flex key={index} gap={3} align="flex-start">
              <Avatar
                name={message.role === 'assistant' ? ASSISTANT_NAME : 'You'}
                src={message.role === 'assistant' ? ASSISTANT_AVATAR_URL : USER_AVATAR_URL}
                bg="transparent"
                color="transparent"
                borderWidth={0}
                size="sm"
              />
              <Card
                bg={message.role === 'assistant' ? 'purple.50' : 'white'}
                borderRadius="lg"
                shadow="sm"
                flex="1"
              >
                <CardBody>
                  <Stack spacing={4}>
                    <Stack spacing={3}>{renderMessageContent(message.content)}</Stack>
                    {message.role === 'assistant' ? renderAttachments(message.attachments) : null}
                  </Stack>
                </CardBody>
              </Card>
            </Flex>
          ))}
          {isLoading ? (
            <Flex gap={3} align="center">
              <Spinner size="sm" color="purple.400" />
              <Text color="purple.600">Looking up the best options...</Text>
            </Flex>
          ) : null}
        </Stack>

        <Box>
          <InputGroup size="lg">
            <Input
              placeholder="Ask for what you need..."
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={onKeyDown}
              disabled={!sessionId || !visitorId}
            />
            <InputRightElement width="15rem">
              <Flex gap={2} align="center">
                {sharedLocation.status === 'granted' && sharedLocation.label ? (
                  <Tooltip label={sharedLocation.label}>
                    <Tag size="md" colorScheme="purple" variant="subtle">
                      Location on
                      <TagCloseButton aria-label="Stop sharing location" onClick={clearLocation} />
                    </Tag>
                  </Tooltip>
                ) : (
                  <Tooltip
                    label={
                      !geoSupported
                        ? 'Geolocation not supported in this browser'
                        : sharedLocation.status === 'denied'
                          ? 'Permission denied. Click to retry.'
                          : 'Share your location to get nearby results'
                    }
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={requestLocation}
                      isDisabled={!geoSupported || sharedLocation.status === 'pending'}
                      leftIcon={sharedLocation.status === 'pending' ? <Spinner size="xs" /> : undefined}
                    >
                      {sharedLocation.status === 'pending' ? 'Sharing…' : 'Share location'}
                    </Button>
                  </Tooltip>
                )}
                <Tooltip label={!sessionId ? 'Initialising session...' : 'Send'}>
                  <IconButton
                    aria-label="Send"
                    icon={<ArrowForwardIcon />}
                    onClick={handleSubmit}
                    isDisabled={!canSend}
                    colorScheme="purple"
                    variant="solid"
                  />
                </Tooltip>
              </Flex>
            </InputRightElement>
          </InputGroup>
        </Box>

        {/* Powered by Synvya branding */}
        <Flex justify="center" align="center" pt={2} gap={2}>
          <Text fontSize="sm" color="gray.600" fontWeight="medium">
            Powered by
          </Text>
          <Link
            href="https://www.synvya.com"
            target="_blank"
            rel="noopener noreferrer"
            _hover={{ opacity: 0.7 }}
            transition="opacity 0.2s"
          >
            <Image
              src="/assets/powered-by-synvya.png"
              alt="Synvya"
              height="28px"
              objectFit="contain"
            />
          </Link>
        </Flex>
      </Flex>

      {/* Contact Info Modal */}
      <Modal isOpen={isContactModalOpen} onClose={onContactModalClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Contact Information</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={4}>
              <Text color="gray.600">
                Please provide your contact information for the reservation. This will be securely stored and included in future reservation requests.
              </Text>
              <FormControl isRequired>
                <FormLabel>Name</FormLabel>
                <Input
                  placeholder="Your full name"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && tempName.trim() && tempPhone.trim()) {
                      handleContactInfoSubmit()
                    }
                  }}
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Phone Number</FormLabel>
                <Input
                  type="tel"
                  placeholder="+1-555-1234"
                  value={tempPhone}
                  onChange={(e) => setTempPhone(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && tempName.trim() && tempPhone.trim()) {
                      handleContactInfoSubmit()
                    }
                  }}
                />
                <FormHelperText color="gray.500" fontSize="sm">
                  Any format accepted: +14253942379, 425-394-2379, (425) 394-2379
                </FormHelperText>
              </FormControl>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onContactModalClose}>
              Cancel
            </Button>
            <Button 
              colorScheme="purple" 
              onClick={handleContactInfoSubmit}
              isDisabled={!tempName.trim() || !tempPhone.trim()}
            >
              Continue
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Flex>
  )
}
