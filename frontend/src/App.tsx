import { Container, Flex, Text } from '@chakra-ui/react'

import { ChatPanel } from './components/ChatPanel'

const App = () => {
  return (
    <Container maxW="6xl" py={12} px={{ base: 4, md: 8 }}>
      <Flex direction="column" minH="100vh" gap={12}>
        <ChatPanel />
        <Text fontSize="xs" color="gray.400" textAlign="center">
          <a href="https://www.flaticon.com/free-icons/concierge" target="_blank" rel="noreferrer" title="concierge icons">Concierge icons created by Wichai.wi - Flaticon</a> ·{' '}
          <a href="https://www.flaticon.com/free-icons/user" target="_blank" rel="noreferrer" title="user icons">User icons created by Freepik - Flaticon</a>
        </Text>
      </Flex>
    </Container>
  )
}

export default App
