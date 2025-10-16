import { describe, expect, test, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChakraProvider } from '@chakra-ui/react'
import { ChatPanel } from './ChatPanel'
import * as api from '../lib/api'

const renderWithChakra = (ui: React.ReactElement) => render(<ChakraProvider>{ui}</ChakraProvider>)

describe('ChatPanel - Share my location', () => {
    beforeEach(() => {
        sessionStorage.clear()
        localStorage.clear()
        vi.restoreAllMocks()
    })

    test('button shows pending then granted state and sends coords in payload', async () => {
        // Mock geolocation
        const getCurrentPosition = vi.fn().mockImplementation((success: PositionCallback) => {
            success({ coords: { latitude: 47.6062, longitude: -122.3321 } } as GeolocationPosition)
        })
        Object.defineProperty(globalThis.navigator as any, 'geolocation', {
            value: { getCurrentPosition },
            configurable: true,
        })

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
        Object.defineProperty(globalThis.navigator as any, 'geolocation', { value: undefined, configurable: true })
        renderWithChakra(<ChatPanel />)
        await waitFor(() => {
            const share = screen.getByRole('button', { name: /share location/i }) as HTMLButtonElement
            expect(share).toBeInTheDocument()
        })
        const btn = screen.getByRole('button', { name: /share location/i }) as HTMLButtonElement
        expect(btn.disabled).toBe(true)
    })
})


