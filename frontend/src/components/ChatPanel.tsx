import { useCallback, useMemo, useState } from 'react'
import {
  Avatar,
  Box,
  Button,
  Card,
  CardBody,
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
  useToast,
} from '@chakra-ui/react'
import { ArrowForwardIcon } from '@chakra-ui/icons'

import { useClientIds } from '../hooks/useClientIds'
import type { ChatMessage, ChatResponse } from '../lib/api'
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
              <Card bg={message.role === 'assistant' ? 'purple.50' : 'white'} borderRadius="lg" shadow="sm" flex="1">
                <CardBody display="flex" flexDirection="column" gap={4}>
                  {renderMessageContent(message.content)}
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
