import { useState } from 'react'
import { Container, Flex, Text, Tabs, TabList, TabPanels, Tab, TabPanel } from '@chakra-ui/react'

import { ChatPanel } from './components/ChatPanel'
import { ReservationsPanel } from './components/ReservationsPanel'
import { ReservationProvider } from './contexts/ReservationContext'

const App = () => {
  return (
    <ReservationProvider>
      <Container maxW="6xl" py={12} px={{ base: 4, md: 8 }}>
        <Flex direction="column" minH="100vh" gap={12}>
          <Tabs colorScheme="purple" variant="enclosed">
            <TabList>
              <Tab>Chat</Tab>
              <Tab>Reservations</Tab>
            </TabList>

            <TabPanels>
              <TabPanel px={0}>
                <ChatPanel />
              </TabPanel>
              <TabPanel px={0}>
                <ReservationsPanel />
              </TabPanel>
            </TabPanels>
          </Tabs>

          <Text fontSize="xs" color="gray.400" textAlign="center">
            <a href="https://www.flaticon.com/free-icons/concierge" target="_blank" rel="noreferrer" title="concierge icons">Concierge icons created by Wichai.wi - Flaticon</a> ·{' '}
            <a href="https://www.flaticon.com/free-icons/user" target="_blank" rel="noreferrer" title="user icons">User icons created by Freepik - Flaticon</a>
          </Text>
        </Flex>
      </Container>
    </ReservationProvider>
  )
}

export default App
