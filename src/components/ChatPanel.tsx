import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { cn } from '@/lib/utils'
import { CHAT_MODELS, type ChatMessage, getStoredChatModel, streamChat, storeChatModel, webSearch } from '@/lib/chat'
import { ArrowUp, Bot, ChevronDown, Copy, FileText, Globe, MessageSquarePlus, RefreshCw, Square, X } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

interface ChatPanelProps {
  open: boolean
  onClose: () => void
  filePath: string | null
  fileContent: string
  width: number
  onResize: (width: number) => void
}

const SYSTEM_PROMPT_MAX = 8000

function buildSystemPrompt(filePath: string | null, fileContent: string): string {
  const fileName = filePath ? filePath.split(/[\\/]/).pop() : 'unknown'
  let prompt = `You are a helpful assistant embedded in a Markdown reader called Readown. The user currently has the file "${fileName}" open.\n`
  if (fileContent) {
    const truncated = fileContent.length > SYSTEM_PROMPT_MAX
      ? fileContent.slice(0, SYSTEM_PROMPT_MAX) + '\n... (truncated)'
      : fileContent
    prompt += `\nHere is the content of "${fileName}":\n\n${truncated}\n`
  }
  prompt += '\nAnswer questions about this document or help the user with anything related to it. Use markdown formatting in your responses.'
  return prompt
}

export function ChatPanel({ open, onClose, filePath, fileContent, width, onResize }: ChatPanelProps) {
  const [sessions, setSessions] = useState<Record<string, ChatMessage[]>>({})
  const [input, setInput] = useState('')
  const [model, setModel] = useState(() => getStoredChatModel())
  const [thinkingLevel, setThinkingLevel] = useState<'none' | 'low' | 'medium' | 'high'>('medium')
  const [useWebSearch, setUseWebSearch] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)

  const sessionKey = filePath ?? '__no_file__'
  const messages = useMemo(() => sessions[sessionKey] ?? [], [sessions, sessionKey])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const viewport = scrollRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]')
      if (viewport) viewport.scrollTop = viewport.scrollHeight
    })
  }, [])

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streaming, scrollToBottom])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && streaming) {
        abortRef.current?.abort()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [streaming])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return

    let systemContent = buildSystemPrompt(filePath, fileContent)

    if (useWebSearch) {
      try {
        const results = await webSearch(text)
        if (results.length > 0) {
          const searchCtx = results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.content}`).join('\n\n')
          systemContent += `\n\nThe following web search results are relevant to the user's question. Use them to provide an accurate, up-to-date answer:\n\n${searchCtx}`
        }
      } catch {
        // search failed, continue without results
      }
    }

    const systemMsg: ChatMessage = { role: 'system', content: systemContent }
    const userMsg: ChatMessage = { role: 'user', content: text }
    const prevMessages = sessions[sessionKey] ?? []
    const newMessages = [...prevMessages, userMsg]

    setSessions((prev) => ({ ...prev, [sessionKey]: newMessages }))
    setInput('')
    setStreaming(true)

    const abort = new AbortController()
    abortRef.current = abort

    let accumulated = ''
    let accumulatedThinking = ''
    const key = sessionKey
    setSessions((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), { role: 'assistant' as const, content: '', thinking: '' }] }))

    try {
      const apiMessages = [systemMsg, ...newMessages]
      for await (const chunk of streamChat(apiMessages, model, { think: thinkingLevel !== 'none', signal: abort.signal })) {
        if (chunk.type === 'thinking') {
          accumulatedThinking += chunk.text
          const capturedThinking = accumulatedThinking
          setSessions((prev) => {
            const msgs = prev[key] ?? []
            return { ...prev, [key]: [...msgs.slice(0, -1), { role: 'assistant' as const, content: accumulated, thinking: capturedThinking }] }
          })
        } else {
          accumulated += chunk.text
          const captured = accumulated
          const capturedThinking = accumulatedThinking
          setSessions((prev) => {
            const msgs = prev[key] ?? []
            return { ...prev, [key]: [...msgs.slice(0, -1), { role: 'assistant' as const, content: captured, thinking: capturedThinking }] }
          })
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Remove the empty assistant message if aborted before any content arrived
        setSessions((prev) => {
          const msgs = prev[key] ?? []
          const last = msgs[msgs.length - 1]
          if (msgs.length > 0 && last.role === 'assistant' && !last.content && !last.thinking) {
            return { ...prev, [key]: msgs.slice(0, -1) }
          }
          return prev
        })
      } else {
        setSessions((prev) => {
          const msgs = prev[key] ?? []
          return { ...prev, [key]: [...msgs.slice(0, -1), { role: 'assistant' as const, content: accumulated || `Error: ${(err as Error).message}`, thinking: accumulatedThinking }] }
        })
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [input, sessions, streaming, model, thinkingLevel, useWebSearch, filePath, fileContent, sessionKey])

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text)
  }, [])

  const handleRegenerate = useCallback((msgIdx: number) => {
    const key = sessionKey
    const msgs = sessions[key] ?? []
    if (msgs[msgIdx]?.role !== 'assistant' || msgIdx === 0) return
    const userMsg = msgs[msgIdx - 1]
    if (userMsg?.role !== 'user') return
    // Remove user + assistant message, then re-send
    setSessions((prev) => {
      const m = prev[key] ?? []
      return { ...prev, [key]: m.slice(0, msgIdx - 1) }
    })
    // Re-send with original user content
    const originalInput = userMsg.content
    setInput('')
    setStreaming(true)
    const abort = new AbortController()
    abortRef.current = abort

    const systemContent = buildSystemPrompt(filePath, fileContent)
    const prevMsgs = (sessions[key] ?? []).slice(0, msgIdx - 1)
    const newUserMsg: ChatMessage = { role: 'user', content: originalInput }
    const systemMsg: ChatMessage = { role: 'system', content: systemContent }
    setSessions((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), newUserMsg] }))

    let accumulated = ''
    let accumulatedThinking = ''
    setSessions((prev) => {
      const m = prev[key] ?? []
      return { ...prev, [key]: [...m, { role: 'assistant' as const, content: '', thinking: '' }] }
    })

    void (async () => {
      try {
        for await (const chunk of streamChat([systemMsg, ...prevMsgs, newUserMsg], model, { think: thinkingLevel !== 'none', signal: abort.signal })) {
          if (chunk.type === 'thinking') {
            accumulatedThinking += chunk.text
            const ct = accumulatedThinking
            setSessions((prev) => {
              const m = prev[key] ?? []
              return { ...prev, [key]: [...m.slice(0, -1), { role: 'assistant' as const, content: accumulated, thinking: ct }] }
            })
          } else {
            accumulated += chunk.text
            const cc = accumulated
            const ct = accumulatedThinking
            setSessions((prev) => {
              const m = prev[key] ?? []
              return { ...prev, [key]: [...m.slice(0, -1), { role: 'assistant' as const, content: cc, thinking: ct }] }
            })
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          setSessions((prev) => {
            const m = prev[key] ?? []
            const last = m[m.length - 1]
            if (m.length > 0 && last.role === 'assistant' && !last.content && !last.thinking) {
              return { ...prev, [key]: m.slice(0, -1) }
            }
            return prev
          })
        } else {
          setSessions((prev) => {
            const m = prev[key] ?? []
            return { ...prev, [key]: [...m.slice(0, -1), { role: 'assistant' as const, content: accumulated || `Error: ${(err as Error).message}`, thinking: accumulatedThinking }] }
          })
        }
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    })()
  }, [sessions, sessionKey, model, thinkingLevel, filePath, fileContent])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !composingRef.current) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handleCompositionStart = () => {
    composingRef.current = true
  }

  const handleCompositionEnd = () => {
    composingRef.current = false
  }

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value
    setModel(v)
    storeChatModel(v)
  }

  const handleThinkingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setThinkingLevel(e.target.value as 'none' | 'low' | 'medium' | 'high')
  }

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width
    const MIN_W = 280
    const MAX_W = Math.max(MIN_W, window.innerWidth * 0.6)

    const onMove = (ev: MouseEvent) => {
      const next = Math.min(MAX_W, Math.max(MIN_W, startWidth - (ev.clientX - startX)))
      onResize(next)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [width, onResize])

  if (!open) return null

  return (
    <div className="flex h-full shrink-0">
      <div
        onMouseDown={startResize}
        className="group relative w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/40"
        role="separator"
        aria-orientation="vertical"
      >
        <div className="absolute inset-y-0 -left-1 -right-1" />
      </div>
      <div className="flex h-full shrink-0 flex-col border-l bg-card" style={{ width: `${width}px`, minWidth: '280px' }}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Chat</h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (streaming) abortRef.current?.abort()
                setSessions((prev) => ({ ...prev, [sessionKey]: [] }))
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              title="New chat"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <ScrollArea ref={scrollRef} className="min-h-0 flex-1 overflow-hidden">
          <div className="space-y-3 p-4">
            {messages.length === 0 && (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Ask anything about the current document.
              </p>
            )}
            {messages.map((msg, i) => {
              const isAssistantFullWidth = msg.role === 'assistant' && !!(msg.thinking || msg.content)
              return (
              <div
                key={i}
                className={cn(
                  'flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground max-w-[85%]'
                      : isAssistantFullWidth
                        ? 'bg-muted text-foreground w-full'
                        : 'bg-muted text-foreground w-fit'
                  )}
                >
                  {msg.role === 'assistant' ? (
                    <>
                      {msg.thinking && (
                        <details className="mb-2" open={streaming && !msg.content}>
                          <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">
                            {streaming && !msg.content ? 'Thinking…' : 'Show Thinking'}
                          </summary>
                          <div className="mt-1 max-h-32 overflow-y-auto rounded border border-border/50 bg-background/50 px-2 py-1 text-xs text-muted-foreground">
                            <div className="whitespace-pre-wrap break-words">{msg.thinking}</div>
                          </div>
                        </details>
                      )}
                      {msg.content ? (
                        <div
                          className="prose-chat prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(marked.parse(msg.content) as string),
                          }}
                        />
                      ) : !msg.thinking ? (
                        <div className="typing-indicator flex items-center gap-1.5 py-1">
                          <span /><span /><span />
                        </div>
                      ) : null}
                      {msg.content && !streaming && (
                        <div className="mt-1.5 flex items-center gap-1 border-t border-border/40 pt-1.5">
                          <button
                            onClick={() => handleRegenerate(i)}
                            className="flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="Regenerate"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleCopy(msg.content)}
                            className="flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                            title="Copy"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}
                </div>
              </div>
            )})}
          </div>
        </ScrollArea>

        <div className="shrink-0 border-t px-3 py-2">
          <div className="flex items-center gap-2 mb-2">
            {filePath && (
              <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground" title={filePath}>
                <FileText className="h-3 w-3 shrink-0" />
                <span className="truncate">{filePath.split(/[\\/]/).pop()}</span>
              </div>
            )}
            <button
              onClick={() => setUseWebSearch((v) => !v)}
              className={`flex items-center rounded border px-1.5 text-[11px] leading-none font-medium cursor-pointer transition-colors box-border overflow-hidden select-none ${useWebSearch ? 'h-[23px] border-primary bg-primary text-primary-foreground gap-1' : 'h-6 border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'}`}
              title={useWebSearch ? 'Web search enabled' : 'Enable web search'}
            >
              <Globe className="h-3 w-3 shrink-0" />
              {useWebSearch && <span className="shrink-0">ON</span>}
            </button>
            <div className="relative shrink-0">
              <select
                value={model}
                onChange={handleModelChange}
                className="flex h-6 items-center rounded border bg-background px-1.5 pr-5 text-[11px] leading-none text-foreground appearance-none cursor-pointer box-border"
              >
                {CHAT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="relative shrink-0">
              <select
                value={thinkingLevel}
                onChange={handleThinkingChange}
                className="flex h-6 items-center rounded border bg-background px-1.5 pr-5 text-[11px] leading-none text-foreground appearance-none cursor-pointer box-border"
              >
                <option value="none">Non-thinking</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
          <div className="relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
              placeholder="Ask about this document..."
              rows={3}
              className="w-full resize-none rounded-md border bg-background px-3 py-2 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {streaming ? (
              <button
                onClick={handleStop}
                className="absolute right-3 bottom-4 flex h-6 w-6 items-center justify-center rounded-md bg-muted text-foreground hover:bg-accent"
                title="Stop (Esc)"
              >
                <Square className="h-3 w-3" />
              </button>
            ) : (
              <button
                onClick={() => void handleSend()}
                disabled={!input.trim()}
                className="absolute right-3 bottom-4 flex h-6 w-6 items-center justify-center rounded-md bg-muted text-foreground hover:bg-accent disabled:opacity-40"
                title="Send"
              >
                <ArrowUp className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
