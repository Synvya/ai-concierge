import { useCallback, useMemo, useState } from 'react'
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
  Text,
  Tooltip,
  Wrap,
  WrapItem,
  useToast,
} from '@chakra-ui/react'
import { ArrowForwardIcon } from '@chakra-ui/icons'

import { useClientIds } from '../hooks/useClientIds'
import type {
  ChatMessage,
  ChatResponse,
  ListingPrice,
  ProductListing,
  SellerResult,
} from '../lib/api'
import { chat } from '../lib/api'

const ASSISTANT_NAME = 'Synvya Concierge'
const ASSISTANT_AVATAR_URL = '/assets/doorman.png'
const USER_AVATAR_URL = '/assets/user.png'
const LINK_REGEX = /(https?:\/\/[^\s]+)/g

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
  const toast = useToast()
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [isLoading, setIsLoading] = useState(false)

  const handleChatResponse = useCallback((payload: ChatResponse) => {
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: payload.answer,
      attachments: payload.results,
    }
    setMessages((prev) => [...prev, assistantMessage])
  }, [])

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
    setIsLoading(true)

    try {
      const payload = await chat({
        message: userMessage.content,
        session_id: sessionId,
        visitor_id: visitorId,
        history: nextHistory,
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
  }, [sessionId, visitorId, inputValue, messages, toast, handleChatResponse])

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
            <InputRightElement width="4.5rem">
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
            </InputRightElement>
          </InputGroup>
        </Box>
      </Flex>

    </Flex>
  )
}
