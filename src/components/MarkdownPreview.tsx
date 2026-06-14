import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BookOpen, FileText } from 'lucide-react'
import { cn, isExternalHref } from '@/lib/utils'

interface MarkdownPreviewProps {
  content: string
  filePath: string | null
  contentWidth: string
  onOpenRelative: (href: string) => void
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

export function MarkdownPreview({ content, filePath, contentWidth, onOpenRelative }: MarkdownPreviewProps) {
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

  const getViewport = () =>
    scrollRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]') ?? null

  useEffect(() => {
    const viewport = getViewport()
    if (!viewport) return
    const onScroll = () => {
      if (currentPathRef.current) {
        scrollPositions.current[currentPathRef.current] = viewport.scrollTop
      }
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
    const anchor = (e.target as HTMLElement).closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href || href.startsWith('#')) return
    if (isExternalHref(href)) return
    e.preventDefault()
    onOpenRelative(href)
  }

  if (!filePath) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center text-muted-foreground">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <BookOpen className="h-8 w-8" />
        </div>
        <p className="text-lg font-medium">No file selected</p>
        <p className="mt-1 max-w-sm text-sm">
          Open or drop a directory to start reading Markdown files.
        </p>
      </div>
    )
  }

  return (
    <ScrollArea ref={scrollRef} className="h-full">
      <article className={cn('prose px-8 py-8', contentWidth === '100%' && 'max-w-none')} style={{ maxWidth: contentWidth !== '100%' ? contentWidth : undefined }}>
        <div className="mb-6 flex items-center gap-2 border-b pb-4 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{filePath}</span>
        </div>
        {html ? (
          <div onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="text-muted-foreground">Empty file.</p>
        )}
      </article>
    </ScrollArea>
  )
}
