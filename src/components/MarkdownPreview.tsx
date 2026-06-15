import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileText, MessageSquare, Pencil, Sparkles } from 'lucide-react'
import { cn, isExternalHref } from '@/lib/utils'

interface MarkdownPreviewProps {
  content: string
  filePath: string | null
  contentWidth: string
  onOpenRelative: (href: string) => void
  onFocus?: () => void
  onAskAI?: (text: string) => void
  onToggleEdit?: () => void
  onToggleChat?: () => void
  isEditing?: boolean
}

marked.setOptions({
  gfm: true,
  breaks: true,
  async: false,
})

marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang || 'plaintext'
      const highlighted = hljs.getLanguage(language)
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value
      return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
    },
  },
})

const codeThemeCss: Record<string, () => Promise<unknown>> = {
  'atom-one-light': () => import('highlight.js/styles/atom-one-light.css'),
  'github-dark': () => import('highlight.js/styles/github-dark.css'),
}

export function MarkdownPreview({ content, filePath, contentWidth, onOpenRelative, onFocus, onAskAI, onToggleEdit, onToggleChat, isEditing }: MarkdownPreviewProps) {
  const html = useMemo(() => {
    if (!content) return ''
    const raw = marked.parse(content) as string
    return DOMPurify.sanitize(raw)
  }, [content])

  useEffect(() => {
    const codeTheme = document.documentElement.style.getPropertyValue('--code-theme').trim() || 'atom-one-light'
    const load = codeThemeCss[codeTheme] ?? codeThemeCss['atom-one-light']
    load().catch(() => {
      // ignore failed css load
    })
  }, [filePath])

  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollPositions = useRef<Record<string, number>>({})
  const currentPathRef = useRef<string | null>(null)
  const articleRef = useRef<HTMLElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuTextRef = useRef('')
  const menuTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const getViewport = () =>
    scrollRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]') ?? null

  useEffect(() => {
    const viewport = getViewport()
    if (!viewport) return
    const onScroll = () => {
      if (currentPathRef.current) {
        scrollPositions.current[currentPathRef.current] = viewport.scrollTop
      }
      hideMenu()
    }
    viewport.addEventListener('scroll', onScroll, { passive: true })
    return () => viewport.removeEventListener('scroll', onScroll)
  }, [filePath])

  useLayoutEffect(() => {
    const viewport = getViewport()
    if (!viewport) return
    currentPathRef.current = filePath
    viewport.scrollTop = filePath ? scrollPositions.current[filePath] ?? 0 : 0
  }, [filePath, html])

  useEffect(() => {
    document.querySelectorAll<HTMLElement>('.prose pre code').forEach((block) => {
      hljs.highlightElement(block)
    })
  }, [html])

  // Hide menu on clicks outside the Ask AI button
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-ask-ai-btn]')) return
      if (menuTimer.current) {
        clearTimeout(menuTimer.current)
        menuTimer.current = null
      }
      hideMenu()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  function showMenu(text: string, top: number, left: number) {
    menuTextRef.current = text
    const el = menuRef.current
    if (!el) return
    el.style.top = `${top}px`
    el.style.left = `${left}px`
    el.style.opacity = '1'
    el.style.pointerEvents = 'auto'
    el.tabIndex = 0
  }

  function hideMenu() {
    const el = menuRef.current
    if (!el) return
    el.style.top = '-9999px'
    el.style.left = '0px'
    el.style.opacity = '0'
    el.style.pointerEvents = 'none'
    el.tabIndex = -1
    menuTextRef.current = ''
  }

  const handleClick = (e: React.MouseEvent<HTMLElement>) => {
    onFocus?.()
    const anchor = (e.target as HTMLElement).closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href || href.startsWith('#')) return
    if (isExternalHref(href)) return
    e.preventDefault()
    onOpenRelative(href)
  }

  const handleMouseUp = () => {
    if (menuTimer.current) {
      clearTimeout(menuTimer.current)
      menuTimer.current = null
    }
    const sel = window.getSelection()
    const text = sel?.toString().trim() ?? ''
    if (!text || !onAskAI) {
      hideMenu()
      return
    }
    if (sel && sel.rangeCount > 0) {
      const selRect = sel.getRangeAt(0).getBoundingClientRect()
      menuTimer.current = setTimeout(() => {
        showMenu(text, selRect.top - 40, selRect.left + selRect.width / 2)
      }, 200)
    }
  }

  const handleMenuClick = () => {
    if (menuTimer.current) {
      clearTimeout(menuTimer.current)
      menuTimer.current = null
    }
    const text = menuTextRef.current
    if (text) {
      onAskAI?.(text)
    }
    hideMenu()
    window.getSelection()?.removeAllRanges()
  }

  if (!filePath) {
    return null
  }

  return (
    <ScrollArea ref={scrollRef} className="h-full">
      <article
        ref={articleRef}
        className={cn('prose relative px-8 py-8', contentWidth === '100%' && 'max-w-none')}
        style={{ maxWidth: contentWidth !== '100%' ? contentWidth : undefined }}
        onMouseUp={handleMouseUp}
      >
        <div className="mb-6 flex items-center gap-2 border-b pb-4 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{filePath?.startsWith('__untitled__') ? 'Untitled' : filePath}</span>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {onToggleChat && (
              <button
                onClick={onToggleChat}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Toggle chat (⌘.)"
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
            )}
            {onToggleEdit && (
              <button
                onClick={onToggleEdit}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
                title={isEditing ? 'Switch to preview (⌘E)' : 'Switch to edit (⌘E)'}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
            )}
          </div>
        </div>
        {html ? (
          <div onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="text-muted-foreground">Empty file.</p>
        )}
      </article>
      {createPortal(
        <div
          ref={menuRef}
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleMenuClick}
          role="button"
          data-ask-ai-btn
          tabIndex={-1}
          className="fixed flex -translate-x-1/2 items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-md hover:bg-accent"
          style={{
            top: '-9999px',
            left: '0px',
            opacity: 0,
            pointerEvents: 'none',
            cursor: 'pointer',
            userSelect: 'none',
            zIndex: 9999,
          }}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Ask AI
        </div>,
        document.body
      )}
    </ScrollArea>
  )
}