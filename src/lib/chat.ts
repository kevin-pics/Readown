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
  { id: 'glm-5.1:cloud', name: 'glm-5.1:cloud' },
  { id: 'kimi-k2.6:cloud', name: 'kimi-k2.6:cloud' },
  { id: 'gemma4:31b-cloud', name: 'gemma4:31b-cloud' },
]

export const DEFAULT_MODEL = 'glm-5.1:cloud'

const OLLAMA_BASE_URL = 'http://localhost:11434'

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
    headers: { 'Content-Type': 'application/json' },
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

export interface WebSearchResult {
  title: string
  url: string
  content: string
}

export async function webSearch(query: string): Promise<WebSearchResult[]> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/web_search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, max_results: 5 }),
  })
  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`Web search error: ${res.status} ${err}`)
  }
  const data = await res.json()
  return data.results ?? []
}
