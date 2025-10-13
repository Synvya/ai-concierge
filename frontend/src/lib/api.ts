import axios from 'axios'

export interface ListingPrice {
  amount?: number
  currency?: string
  frequency?: string
}

export interface ProductListing {
  id: string
  title: string
  summary?: string
  content?: string
  status?: string
  location?: string
  price?: ListingPrice
  published_at?: string
  images?: string[]
  tags?: string[]
  url?: string
  identifier?: string
  raw_tags?: string[][]
}

export interface SellerResult {
  id: string
  name?: string
  meta_data?: Record<string, unknown>
  filters?: Record<string, unknown>
  content?: string
  distance?: number
  score: number
  listings?: ProductListing[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  attachments?: SellerResult[]
}

export interface ChatRequestPayload {
  message: string
  session_id?: string
  visitor_id?: string
  history: ChatMessage[]
  top_k?: number
  debug?: boolean
}

export interface ChatResponse {
  session_id: string
  answer: string
  results: SellerResult[]
  query: string
  top_k: number
  debug_payload?: Record<string, unknown>
}

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const chat = async (payload: ChatRequestPayload) => {
  const { data } = await api.post<ChatResponse>('/chat', payload)
  return data
}
