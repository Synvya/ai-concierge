import '@testing-library/jest-dom/vitest'

// Basic mock for Chakra UI portal warnings in tests
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({ matches: false, media: query, onchange: null, addListener: () => { }, removeListener: () => { }, addEventListener: () => { }, removeEventListener: () => { }, dispatchEvent: () => false }),
})

// Provide a simple crypto.randomUUID for tests
if (!(global as any).crypto) {
    Object.defineProperty(global, 'crypto', {
        value: { randomUUID: () => `test-uuid-${Math.random().toString(16).slice(2)}` },
        configurable: true,
    })
} else if (!(global as any).crypto.randomUUID) {
    ; (global as any).crypto.randomUUID = () => `test-uuid-${Math.random().toString(16).slice(2)}`
}

