import axios from 'axios'

export interface GeoPoint {
  latitude: number
  longitude: number
}

export interface ListingPrice {
  amount?: number
  currency?: string
  frequency?: string
}

export interface ProductListingImageObject {
  url?: string | null
}

export interface ProductListing {
  id: string
  title: string
  summary?: string
  content?: string
  status?: string
  location?: string
  latitude?: number
  longitude?: number
  geo_distance_km?: number
  maps_url?: string
  price?: ListingPrice
  published_at?: string
  images?: string[] | ProductListingImageObject[]
  tags?: string[]
  url?: string
  identifier?: string
  raw_tags?: string[][]
}

export interface SellerResult {
  id: string
  name?: string
  npub?: string
  supports_reservations?: boolean | null
  supports_modifications?: boolean | null
  meta_data?: Record<string, unknown>
  filters?: Record<string, unknown>
  content?: string
  latitude?: number
  longitude?: number
  vector_distance?: number
  geo_distance_km?: number
  maps_url?: string
  score: number
  listings?: ProductListing[]
  user_location?: string
  user_coordinates?: GeoPoint
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  attachments?: SellerResult[]
}

export interface ModificationResponseAction {
  action: string
  restaurant_id: string
  restaurant_name: string
  npub: string
  status: 'accepted' | 'confirmed' | 'declined' // Backend returns "accepted", frontend uses "confirmed"
  iso_time: string
  thread_id: string
  message?: string
}

export interface ReservationAction {
  action: string
  restaurant_id: string
  restaurant_name: string
  npub: string
  party_size: number
  iso_time: string
  notes?: string
  thread_id?: string
}

export interface ActiveReservationContext {
  restaurant_id: string
  restaurant_name: string
  npub: string
  party_size: number
  original_time: string
  suggested_time?: string
  thread_id?: string
}

export interface ChatRequestPayload {
  message: string
  session_id?: string
  visitor_id?: string
  history: ChatMessage[]
  top_k?: number
  debug?: boolean
  user_location?: string
  user_coordinates?: GeoPoint
  active_reservation_context?: ActiveReservationContext
}

export interface ChatResponse {
  session_id: string
  answer: string
  results: SellerResult[]
  query: string
  top_k: number
  debug_payload?: Record<string, unknown>
  user_location?: string
  user_coordinates?: GeoPoint
  reservation_action?: ReservationAction | null
  modification_response_action?: ModificationResponseAction | null
}

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

export const LOCATION_STORAGE_KEY = 'ai-concierge-shared-location'

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

type CachedLocation = { label?: string; coords?: GeoPoint }

export const getCachedLocation = (): CachedLocation | null => {
  try {
    if (typeof sessionStorage === 'undefined') return null
    const raw = sessionStorage.getItem(LOCATION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedLocation
    if (
      parsed?.coords &&
      typeof parsed.coords.latitude === 'number' &&
      typeof parsed.coords.longitude === 'number'
    ) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

export const chat = async (payload: ChatRequestPayload) => {
  let finalPayload = payload
  if (payload.user_location === undefined && payload.user_coordinates === undefined) {
    const cached = getCachedLocation()
    if (cached?.coords) {
      finalPayload = {
        ...payload,
        user_location: cached.label ?? payload.user_location,
        user_coordinates: cached.coords ?? payload.user_coordinates,
      }
    }
  }
  const { data } = await api.post<ChatResponse>('/chat', finalPayload)
  return data
}

export interface SearchRequestPayload {
  query: string
  top_k?: number
  debug?: boolean
  user_location?: string
  user_coordinates?: GeoPoint
}

export interface SearchResponsePayload {
  results: SellerResult[]
  query: string
  top_k: number
  debug_payload?: Record<string, unknown>
  user_location?: string
  user_coordinates?: GeoPoint
}

export const search = async (payload: SearchRequestPayload) => {
  let finalPayload = payload
  if (payload.user_location === undefined && payload.user_coordinates === undefined) {
    const cached = getCachedLocation()
    if (cached?.coords) {
      finalPayload = {
        ...payload,
        user_location: cached.label ?? payload.user_location,
        user_coordinates: cached.coords ?? payload.user_coordinates,
      }
    }
  }
  const { data } = await api.post<SearchResponsePayload>('/search', finalPayload)
  return data
}
