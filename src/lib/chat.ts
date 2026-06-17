export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  thinking?: string
}

export interface StreamChunk {
  type: 'content' | 'thinking'
  text: string
}

export interface ChatModel {
  id: string
  name: string
}

export const CHAT_MODELS: ChatModel[] = [
  { id: 'glm-5.2:cloud', name: 'glm-5.2:cloud' },
  { id: 'glm-5.1:cloud', name: 'glm-5.1:cloud' },
  { id: 'kimi-k2.6:cloud', name: 'kimi-k2.6:cloud' },
  { id: 'gemma4:31b-cloud', name: 'gemma4:31b-cloud' },
]

export const DEFAULT_MODEL = 'glm-5.2:cloud'

const CUSTOM_MODELS_KEY = 'readown.customModels'

export function getStoredChatModels(): ChatModel[] {
  try {
    const raw = localStorage.getItem(CUSTOM_MODELS_KEY)
    if (!raw) return CHAT_MODELS
    const parsed = JSON.parse(raw) as ChatModel[]
    if (!Array.isArray(parsed) || parsed.length === 0) return CHAT_MODELS
    return parsed
  } catch {
    return CHAT_MODELS
  }
}

export function storeChatModels(models: ChatModel[]): void {
  try {
    localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(models))
  } catch {
    // ignore
  }
}

export function addChatModel(id: string): ChatModel[] {
  const trimmed = id.trim()
  if (!trimmed) return getStoredChatModels()
  const current = getStoredChatModels()
  if (current.some((m) => m.id === trimmed)) return current
  const next = [...current, { id: trimmed, name: trimmed }]
  storeChatModels(next)
  return next
}

export function removeChatModel(id: string): ChatModel[] {
  const current = getStoredChatModels()
  const next = current.filter((m) => m.id !== id)
  if (next.length === 0) return current
  storeChatModels(next)
  return next
}

export function moveChatModel(fromId: string, toId: string): ChatModel[] {
  const current = getStoredChatModels()
  const fromIdx = current.findIndex((m) => m.id === fromId)
  const toIdx = current.findIndex((m) => m.id === toId)
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return current
  const next = [...current]
  const [moved] = next.splice(fromIdx, 1)
  next.splice(toIdx, 0, moved)
  storeChatModels(next)
  return next
}

const OLLAMA_BASE_URL = 'http://localhost:11434'

const OLLAMA_API_KEY_KEY = 'readown.ollamaApiKey'

export function getStoredOllamaApiKey(): string {
  try {
    return localStorage.getItem(OLLAMA_API_KEY_KEY) ?? ''
  } catch {
    return ''
  }
}

export function storeOllamaApiKey(key: string): void {
  try {
    localStorage.setItem(OLLAMA_API_KEY_KEY, key)
  } catch {
    // ignore
  }
}

function authHeaders(): Record<string, string> {
  const apiKey = getStoredOllamaApiKey()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
  return headers
}

export async function generateSearchQuery(context: string, question: string, model: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a search query generator. Given the context and user question, generate a concise web search query (in the same language as the question) that will find relevant information to answer the question. Output ONLY the search query, nothing else.' },
        { role: 'user', content: `Context:\n${context}\n\nQuestion: ${question}` },
      ],
      stream: false,
    }),
    signal,
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Search query generation failed: ${res.status} ${err}`)
  }
  const data = await res.json()
  return (data.message?.content ?? '').trim()
}

export async function* streamChat(
  messages: ChatMessage[],
  model: string,
  options?: { think?: boolean; signal?: AbortSignal }
): AsyncGenerator<StreamChunk, void, unknown> {
  const { think, signal } = options ?? {}
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
  }
  if (think !== undefined) body.think = think

  const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Ollama error: ${res.status} ${err}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const obj = JSON.parse(trimmed)
        if (obj.message?.thinking) {
          yield { type: 'thinking', text: obj.message.thinking }
        }
        if (obj.message?.content) {
          yield { type: 'content', text: obj.message.content }
        }
        if (obj.done) return
      } catch {
        // skip malformed lines
      }
    }
  }
}

const CHAT_MODEL_KEY = 'readown.chatModel'
const WEB_SEARCH_KEY = 'readown.webSearch'
const THINKING_LEVEL_KEY = 'readown.thinkingLevel'

export function getStoredChatModel(): string {
  try {
    return localStorage.getItem(CHAT_MODEL_KEY) ?? DEFAULT_MODEL
  } catch {
    return DEFAULT_MODEL
  }
}

export function storeChatModel(model: string): void {
  try {
    localStorage.setItem(CHAT_MODEL_KEY, model)
  } catch {
    // ignore
  }
}

export function getStoredWebSearch(): boolean {
  try {
    return localStorage.getItem(WEB_SEARCH_KEY) === 'true'
  } catch {
    return false
  }
}

export function storeWebSearch(enabled: boolean): void {
  try {
    localStorage.setItem(WEB_SEARCH_KEY, String(enabled))
  } catch {
    // ignore
  }
}

export function getStoredThinkingLevel(): 'none' | 'low' | 'medium' | 'high' {
  try {
    const v = localStorage.getItem(THINKING_LEVEL_KEY)
    if (v === 'none' || v === 'low' || v === 'medium' || v === 'high') return v
    return 'medium'
  } catch {
    return 'medium'
  }
}

export function storeThinkingLevel(level: 'none' | 'low' | 'medium' | 'high'): void {
  try {
    localStorage.setItem(THINKING_LEVEL_KEY, level)
  } catch {
    // ignore
  }
}

export interface WebSearchResult {
  title: string
  url: string
  content: string
}

export async function webSearch(query: string, signal?: AbortSignal): Promise<WebSearchResult[]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const apiKey = getStoredOllamaApiKey()
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
  const res = await fetch('https://ollama.com/api/web_search', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, max_results: 5 }),
    signal,
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Web search error: ${res.status} ${err}`)
  }
  const data = await res.json()
  return data.results ?? []
}
