import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ChakraProvider } from '@chakra-ui/react'
import { ChatPanel } from './ChatPanel'
import { ReservationProvider } from '../contexts/ReservationContext'
import * as api from '../lib/api'

const renderWithChakra = (ui: React.ReactElement) => render(
    <ChakraProvider>
        <ReservationProvider>
            {ui}
        </ReservationProvider>
    </ChakraProvider>
)

// Ensure storage exists even if the test environment omits it (e.g., forks pool)
const ensureMemoryStorage = () => {
    const createMemoryStorage = () => {
        const store = new Map<string, string>()
        return {
            get length() {
                return store.size
            },
            clear: () => store.clear(),
            getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
            key: (index: number) => Array.from(store.keys())[index] ?? null,
            removeItem: (key: string) => void store.delete(key),
            setItem: (key: string, value: string) => void store.set(key, String(value)),
        } as Storage
    }
    if (typeof (globalThis as any).sessionStorage === 'undefined') {
        Object.defineProperty(globalThis, 'sessionStorage', { value: createMemoryStorage(), configurable: true })
    }
    if (typeof (globalThis as any).localStorage === 'undefined') {
        Object.defineProperty(globalThis, 'localStorage', { value: createMemoryStorage(), configurable: true })
    }
}

describe('ChatPanel - Share my location', () => {
    beforeEach(() => {
        ensureMemoryStorage()
            ; (sessionStorage as Storage).clear()
            ; (localStorage as Storage).clear()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    test('button shows pending then granted state and sends coords in payload', async () => {
        // Mock geolocation
        const getCurrentPosition = vi.fn().mockImplementation((success: PositionCallback) => {
            success({ coords: { latitude: 47.6062, longitude: -122.3321 } } as GeolocationPosition)
        })
        vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } } as any)

        // Mock chat API to capture payload
        const chatSpy = vi.spyOn(api, 'chat').mockResolvedValue({
            session_id: 's-1',
            answer: 'ok',
            results: [],
            query: 'q',
            top_k: 10,
        })

        renderWithChakra(<ChatPanel />)

        // wait for session/visitor ids to initialize and input enabled
        await waitFor(() => {
            const sends = screen.getAllByRole('button', { name: /send/i }) as HTMLButtonElement[]
            expect(sends.length).toBeGreaterThan(0)
        })

        // share location
        const shareBtn = screen.getByRole('button', { name: /share location/i })
        fireEvent.click(shareBtn)

        await screen.findByText(/location on/i)

        const input = screen.getAllByPlaceholderText('Ask for what you need...')[0] as HTMLInputElement
        fireEvent.change(input, { target: { value: 'coffee' } })
        const sendBtn = screen.getByRole('button', { name: /send/i })
        fireEvent.click(sendBtn)

        await waitFor(() => expect(chatSpy).toHaveBeenCalled())
        const lastCall = chatSpy.mock.calls[chatSpy.mock.calls.length - 1]
        const calledWith = (lastCall?.[0] ?? {}) as api.ChatRequestPayload
        expect(calledWith.user_coordinates).toEqual({ latitude: 47.6062, longitude: -122.3321 })
        expect(typeof calledWith.user_location).toBe('string')
    })

    test('disables share button when geolocation unsupported', async () => {
        // Remove geolocation
        vi.stubGlobal('navigator', {} as any)
        renderWithChakra(<ChatPanel />)
        await waitFor(() => {
            const share = screen.getByRole('button', { name: /share location/i }) as HTMLButtonElement
            expect(share).toBeInTheDocument()
        })
        const btn = screen.getByRole('button', { name: /share location/i }) as HTMLButtonElement
        expect(btn.disabled).toBe(true)
    })
})

describe('ChatPanel - Reservation Badge', () => {
    beforeEach(() => {
        ensureMemoryStorage()
            ; (sessionStorage as Storage).clear()
            ; (localStorage as Storage).clear()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    afterEach(() => {
        cleanup()
    })

    test('displays badge when restaurant supports reservations', async () => {
        const mockResponse = {
            session_id: 'test-session',
            answer: 'Here are some restaurants',
            results: [
                {
                    id: '1',
                    name: "Mario's Pizza",
                    npub: 'npub1test123',
                    supports_reservations: true,
                    score: 0.9,
                    listings: [
                        {
                            id: 'listing-1',
                            title: 'Margherita Pizza',
                            summary: 'Classic pizza with fresh mozzarella',
                        },
                    ],
                },
            ],
            query: 'pizza',
            top_k: 5,
        }
        const mockChat = vi.spyOn(api, 'chat').mockResolvedValue(mockResponse)

        renderWithChakra(<ChatPanel />)

        // Wait for initialization
        await waitFor(() => {
            const sends = screen.getAllByRole('button', { name: /send/i })
            expect(sends.length).toBeGreaterThan(0)
        })

        const input = screen.getAllByPlaceholderText('Ask for what you need...')[0] as HTMLInputElement
        fireEvent.change(input, { target: { value: 'find pizza' } })
        const sendBtns = screen.getAllByRole('button', { name: /send/i })
        fireEvent.click(sendBtns[0])

        await waitFor(() => {
            expect(mockChat).toHaveBeenCalled()
        })

        await waitFor(() => {
            expect(screen.getByText("Mario's Pizza")).toBeInTheDocument()
        })

        const badge = screen.getByText(/book via concierge/i)
        expect(badge).toBeInTheDocument()
        
        // Check that the emoji is present with proper aria-label
        const emoji = screen.getByLabelText('magic wand')
        expect(emoji).toBeInTheDocument()
    })

    test('hides badge when supports_reservations is false', async () => {
        const mockChat = vi.spyOn(api, 'chat').mockResolvedValue({
            session_id: 'test-session',
            answer: 'Here are some restaurants',
            results: [
                {
                    id: '1',
                    name: "Joe's Burgers",
                    npub: 'npub1test456',
                    supports_reservations: false,
                    score: 0.9,
                    listings: [
                        {
                            id: 'listing-1',
                            title: 'Classic Burger',
                            summary: 'Juicy beef burger with all the fixings',
                        },
                    ],
                },
            ],
            query: 'burgers',
            top_k: 5,
        })

        renderWithChakra(<ChatPanel />)

        await waitFor(() => {
            const sends = screen.getAllByRole('button', { name: /send/i })
            expect(sends.length).toBeGreaterThan(0)
        })

        const input = screen.getAllByPlaceholderText('Ask for what you need...')[0] as HTMLInputElement
        fireEvent.change(input, { target: { value: 'find burgers' } })
        const sendBtns = screen.getAllByRole('button', { name: /send/i })
        fireEvent.click(sendBtns[0])

        await waitFor(() => {
            expect(mockChat).toHaveBeenCalled()
        })

        await waitFor(() => {
            expect(screen.getByText("Joe's Burgers")).toBeInTheDocument()
        })

        expect(screen.queryByText(/book via concierge/i)).not.toBeInTheDocument()
    })

})


