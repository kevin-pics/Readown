import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FileText, Sparkles } from 'lucide-react'
import { cn, isExternalHref } from '@/lib/utils'

interface MarkdownPreviewProps {
  content: string
  filePath: string | null
  contentWidth: string
  onOpenRelative: (href: string) => void
  onFocus?: () => void
  onAskAI?: (text: string) => void
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

interface SelectionMenu {
  text: string
  x: number
  y: number
}

export function MarkdownPreview({ content, filePath, contentWidth, onOpenRelative, onFocus, onAskAI }: MarkdownPreviewProps) {
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

  const [selectionMenu, setSelectionMenu] = useState<SelectionMenu | null>(null)
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
      setSelectionMenu(null)
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

  const handleMouseUp = useCallback(() => {
    if (menuTimer.current) {
      clearTimeout(menuTimer.current)
      menuTimer.current = null
    }
    const sel = window.getSelection()
    const text = sel?.toString().trim() ?? ''
    if (!text || !onAskAI) {
      setSelectionMenu(null)
      return
    }
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top
      menuTimer.current = setTimeout(() => {
        setSelectionMenu({ text, x, y })
      }, 200)
    }
  }, [onAskAI])

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectionMenu?.text) {
      onAskAI?.(selectionMenu.text)
    }
    setSelectionMenu(null)
    window.getSelection()?.removeAllRanges()
  }

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-ask-ai-menu]')) return
      if (menuTimer.current) {
        clearTimeout(menuTimer.current)
        menuTimer.current = null
      }
      setSelectionMenu(null)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  if (!filePath) {
    return null
  }

  return (
    <>
      <ScrollArea ref={scrollRef} className="h-full">
        <article className={cn('prose px-8 py-8', contentWidth === '100%' && 'max-w-none')} style={{ maxWidth: contentWidth !== '100%' ? contentWidth : undefined }}>
          <div className="mb-6 flex items-center gap-2 border-b pb-4 text-xs text-muted-foreground">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{filePath}</span>
          </div>
          {html ? (
            <div onClick={handleClick} onMouseUp={handleMouseUp} dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="text-muted-foreground">Empty file.</p>
          )}
        </article>
      </ScrollArea>
      {selectionMenu && (
        <button
          data-ask-ai-menu
          onClick={handleMenuClick}
          style={{
            position: 'fixed',
            left: `${selectionMenu.x}px`,
            top: `${selectionMenu.y - 36}px`,
            transform: 'translateX(-50%)',
            zIndex: 50,
          }}
          className="flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-md hover:bg-accent"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Ask AI
        </button>
      )}
    </>
  )
}
