import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Avatar,
  Box,
  Button,
  Card,
  CardBody,
  Image,
  Flex,
  Heading,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Link,
  Spinner,
  Stack,
  Tag,
  TagCloseButton,
  Text,
  Tooltip,
  Wrap,
  WrapItem,
  useToast,
  Icon,
} from '@chakra-ui/react'
import { ArrowForwardIcon } from '@chakra-ui/icons'

import { useClientIds } from '../hooks/useClientIds'
import { useNostrIdentity } from '../hooks/useNostrIdentity'
import { useReservations } from '../contexts/ReservationContext'
import type {
  ChatMessage,
  ChatResponse,
  GeoPoint,
  ListingPrice,
  ProductListing,
  SellerResult,
} from '../lib/api'
import { chat } from '../lib/api'
import {
  parseReservationIntent,
  isReservationComplete,
  getMissingDetailPrompt,
  type ReservationIntent,
} from '../lib/parseReservationIntent'
import { buildReservationRequest } from '../lib/nostr/reservationEvents'
import { wrapEvent } from '../lib/nostr/nip59'
import { publishToRelays } from '../lib/nostr/relayPool'
import { npubToHex } from '../lib/nostr/keys'
import type { ReservationMessage } from '../services/reservationMessenger'
import type { Rumor } from '../lib/nostr/nip59'

const ASSISTANT_NAME = 'Synvya Concierge'
const ASSISTANT_AVATAR_URL = '/assets/doorman.png'
const USER_AVATAR_URL = '/assets/user.png'
const LINK_REGEX = /(https?:\/\/[^\s]+)/g
const LOCATION_STORAGE_KEY = 'ai-concierge-shared-location'

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
  const { addOutgoingMessage } = useReservations()
  const toast = useToast()
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [isLoading, setIsLoading] = useState(false)
  const [currentSearchResults, setCurrentSearchResults] = useState<SellerResult[]>([])
  const [pendingIntent, setPendingIntent] = useState<ReservationIntent | null>(null)
  const [sharedLocation, setSharedLocation] = useState<{
    label?: string
    coords?: GeoPoint
    status: 'idle' | 'pending' | 'granted' | 'denied'
  }>({ status: 'idle' })

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

  const handleChatResponse = useCallback((payload: ChatResponse) => {
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: payload.answer,
      attachments: payload.results,
    }
    setMessages((prev) => [...prev, assistantMessage])
    // Track search results for reservation intent matching
    if (payload.results && payload.results.length > 0) {
      setCurrentSearchResults(payload.results)
    }
  }, [])

  const canSend = useMemo(
    () => Boolean(inputValue.trim()) && Boolean(sessionId) && Boolean(visitorId) && !isLoading,
    [inputValue, sessionId, visitorId, isLoading],
  )

  const sendReservationRequest = useCallback(async (
    restaurant: SellerResult,
    intent: ReservationIntent
  ) => {
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

      // Build reservation request
      const request = {
        party_size: intent.partySize!,
        iso_time: intent.time!,
        notes: intent.notes,
      }

      const rumor = buildReservationRequest(
        request,
        nostrIdentity.privateKeyHex,
        restaurantPubkeyHex
      )

      const giftWrap = wrapEvent(rumor, nostrIdentity.privateKeyHex, restaurantPubkeyHex)

      // Publish to default relays
      const relays = [
        'wss://relay.damus.io',
        'wss://nos.lol',
        'wss://relay.nostr.band',
      ]

      await publishToRelays(giftWrap, relays)

      // Add to reservation context for tracking
      // Convert EventTemplate to Rumor by adding required id field
      const rumorWithId: Rumor = {
        ...rumor,
        id: giftWrap.id, // Use gift wrap ID as rumor ID
        pubkey: nostrIdentity.publicKeyHex,
      };
      
      const reservationMessage: ReservationMessage = {
        rumor: rumorWithId,
        type: 'request',
        payload: request,
        senderPubkey: nostrIdentity.publicKeyHex,
        giftWrap,
      }
      addOutgoingMessage(reservationMessage, restaurant.name || 'Unknown Restaurant', restaurant.npub)

      // Show success message
      const confirmationMessage: ChatMessage = {
        role: 'assistant',
        content: `Great! I've sent your reservation request to ${restaurant.name} for ${intent.partySize} people at ${new Date(intent.time!).toLocaleString()}.${intent.notes ? ` Note: "${intent.notes}"` : ''}\n\nYou'll receive a response from the restaurant shortly.`,
      }
      setMessages((prev) => [...prev, confirmationMessage])
      setPendingIntent(null)

      toast({
        title: 'Reservation request sent',
        description: `Sent to ${restaurant.name}`,
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
  }, [nostrIdentity, toast, addOutgoingMessage])

  const handleSubmit = useCallback(async () => {
    if (!sessionId || !visitorId || !inputValue.trim()) {
      return
    }

    const userMessage: ChatMessage = { role: 'user', content: inputValue }
    const nextHistory = [...messages, userMessage]
    setMessages(nextHistory)
    setInputValue('')

    // Check for reservation intent
    const intent = parseReservationIntent(inputValue, currentSearchResults)

    if (intent) {
      // Merge with pending intent if exists
      const mergedIntent: ReservationIntent = {
        ...pendingIntent,
        ...intent,
      }

      // Check if complete
      if (isReservationComplete(mergedIntent)) {
        // Find restaurant with npub
        const restaurant = currentSearchResults.find(
          (r) => r.name === mergedIntent.restaurantName && r.npub
        )

        if (!restaurant) {
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: "I couldn't find that restaurant in the current search results. Could you search for the restaurant first, then request a reservation?",
          }
          setMessages((prev) => [...prev, assistantMessage])
          setPendingIntent(null)
          return
        }

        // Send reservation request
        await sendReservationRequest(restaurant, mergedIntent)
        return
      } else {
        // Prompt for missing details
        const prompt = getMissingDetailPrompt(mergedIntent)
        if (prompt) {
          const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: prompt,
          }
          setMessages((prev) => [...prev, assistantMessage])
          setPendingIntent(mergedIntent)
          return
        }
      }
    }

    // Normal chat flow
    setIsLoading(true)
    try {
      const payload = await chat({
        message: userMessage.content,
        session_id: sessionId,
        visitor_id: visitorId,
        history: nextHistory,
        user_location: sharedLocation.status === 'granted' ? sharedLocation.label : undefined,
        user_coordinates: sharedLocation.status === 'granted' ? sharedLocation.coords : undefined,
      })
      handleChatResponse(payload)
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
  }, [sessionId, visitorId, inputValue, messages, currentSearchResults, pendingIntent, toast, handleChatResponse, sendReservationRequest, sharedLocation])

  const handleSuggestedQuery = (query: string) => {
    setInputValue(query)
  }

  const startNewSession = () => {
    resetSession()
    setMessages(initialMessages)
    setCurrentSearchResults([])
    setPendingIntent(null)
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
                      <Heading size="sm">{displayName}</Heading>
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
      </Flex>

    </Flex>
  )
}
