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

// Polyfill storage if not present (some CI environments with forks may lack it)
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
    Object.defineProperty(globalThis, 'sessionStorage', {
        value: createMemoryStorage(),
        configurable: true,
    })
}

if (typeof (globalThis as any).localStorage === 'undefined') {
    Object.defineProperty(globalThis, 'localStorage', {
        value: createMemoryStorage(),
        configurable: true,
    })
}

