import { useEffect, useLayoutEffect, useMemo, useRef, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import mermaid from 'mermaid'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SearchBar } from '@/components/SearchBar'
import { FileText, MessageSquare, Pencil, Sparkles } from 'lucide-react'
import { cn, isExternalHref, resolveRelativePath } from '@/lib/utils'
import { memo } from 'react'

// Initialize mermaid once at module level
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
})

function ContentDiv({ html, onClick }: { html: string; onClick: (e: React.MouseEvent<HTMLElement>) => void }) {
  return <div onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}

const MemoizedContentDiv = memo(ContentDiv, (prev, next) => prev.html === next.html)

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
  searchVisible?: boolean
  onSearchClose?: () => void
  searchFocusTrigger?: number
}


marked.setOptions({
  gfm: true,
  breaks: true,
  async: false,
})

marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      if (lang === 'mermaid') {
        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`
        const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        return `<div class="mermaid-wrapper" data-mermaid-id="${id}" data-mermaid-source="${encodeURIComponent(text)}"><div class="mermaid-preview"></div><pre><code class="hljs language-mermaid" style="display:none">${escaped}</code></pre></div>`
      }
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

export function MarkdownPreview({ content, filePath, contentWidth, onOpenRelative, onFocus, onAskAI, onToggleEdit, onToggleChat, isEditing, searchVisible, onSearchClose, searchFocusTrigger }: MarkdownPreviewProps) {
  const [matchCount, setMatchCount] = useState(0)
  const [currentMatch, setCurrentMatch] = useState(0)
  const matchesRef = useRef<number[]>([])
  const currentMatchRef = useRef(0)
  const searchQueryRef = useRef('')
  const searchCaseRef = useRef(false)
  const html = useMemo(() => {
    if (!content) return ''
    const raw = marked.parse(content) as string
    const sanitized = DOMPurify.sanitize(raw, {
      ADD_ATTR: ['src', 'data-mermaid-id', 'data-mermaid-source'],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|ftp|mailto|tel|file|data):|[^a-z]|[a-z+.-]+(?:[^a-z:]|$))/i,
    })
    if (!filePath) return sanitized
    const container = document.createElement('div')
    container.innerHTML = sanitized
    container.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src')
      if (!src || isExternalHref(src) || src.startsWith('data:')) return
      const resolved = resolveRelativePath(filePath, src)
      if (resolved) {
        const fileUrl = resolved.replace(/\\/g, '/')
        img.setAttribute('src', `file://${fileUrl.startsWith('/') ? '' : '//'}${fileUrl}`)
      }
    })
    return container.innerHTML
  }, [content, filePath])

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
  const [mermaidModes, setMermaidModes] = useState<Record<string, 'preview' | 'code'>>({})
  const handleMermaidToggle = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mermaid-toggle]')
    if (!btn) return
    e.stopPropagation()
    const id = btn.getAttribute('data-mermaid-toggle')!
    setMermaidModes((prev) => {
      const current = prev[id] || 'preview'
      const next = current === 'preview' ? 'code' : 'preview'
      return { ...prev, [id]: next }
    })
  }, [])

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

  useEffect(() => {
    const wrappers = articleRef.current?.querySelectorAll<HTMLElement>('.mermaid-wrapper')
    if (!wrappers || wrappers.length === 0) return

    // Update theme based on current mode
    const isDark = document.documentElement.classList.contains('dark')
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      securityLevel: 'loose',
    })

    let cancelled = false
    const renderAll = async () => {
      for (const wrapper of wrappers) {
        if (cancelled) return
        const previewEl = wrapper.querySelector<HTMLElement>('.mermaid-preview')
        const source = decodeURIComponent(wrapper.getAttribute('data-mermaid-source') || '')
        if (!previewEl || !source) continue
        // Skip if already rendered
        if (previewEl.querySelector('svg')) continue
        try {
          const renderId = `mermaid-render-${Math.random().toString(36).slice(2, 10)}`
          const { svg } = await mermaid.render(renderId, source)
          if (!cancelled) previewEl.innerHTML = svg
        } catch (e) {
          console.error('Mermaid render error:', e)
          if (!cancelled) previewEl.innerHTML = '<p style="color:var(--destructive);font-size:0.8rem;padding:0.5rem">Mermaid syntax error</p>'
        }
      }
    }
    renderAll()
    return () => { cancelled = true }
  }, [html])

  useEffect(() => {
    const wrappers = articleRef.current?.querySelectorAll<HTMLElement>('.mermaid-wrapper')
    if (!wrappers || wrappers.length === 0) return

    for (const wrapper of wrappers) {
      const id = wrapper.getAttribute('data-mermaid-id') || ''
      const preview = wrapper.querySelector<HTMLElement>('.mermaid-preview')
      const codeEl = wrapper.querySelector('pre')
      const mode = mermaidModes[id] || 'preview'

      if (preview) preview.style.display = mode === 'preview' ? '' : 'none'
      if (codeEl) codeEl.style.display = mode === 'code' ? '' : 'none'

      // Add or update toggle button
      let btn = wrapper.querySelector<HTMLButtonElement>('[data-mermaid-toggle]')
      if (!btn) {
        btn = document.createElement('button')
        btn.setAttribute('data-mermaid-toggle', id)
        btn.className = 'mermaid-toggle-btn'
        btn.textContent = mode === 'preview' ? 'Code' : 'Preview'
        wrapper.prepend(btn)
      } else {
        btn.textContent = mode === 'preview' ? 'Code' : 'Preview'
      }
    }
  }, [html, mermaidModes])

  // --- Search / find-in-page ---
  const clearHighlights = useCallback(() => {
    const article = articleRef.current
    if (!article) return
    try {
      article.querySelectorAll('mark[data-search-highlight]').forEach((mark) => {
        const parent = mark.parentNode
        if (parent) {
          parent.replaceChild(document.createTextNode(mark.textContent ?? ''), mark)
          parent.normalize()
        }
      })
    } catch {
      // If DOM is in inconsistent state, just remove the marks
      article.querySelectorAll('mark[data-search-highlight]').forEach((mark) => mark.remove())
    }
    matchesRef.current = []
    currentMatchRef.current = 0
    setMatchCount(0)
    setCurrentMatch(0)
  }, [])

  const highlightMatches = useCallback((query: string) => {
    try {
    clearHighlights()
    if (!query) return

    const article = articleRef.current
    if (!article) return

    const lowerQuery = searchCaseRef.current ? query : query.toLowerCase()

    const textNodes: Text[] = []
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement
        if (!parent) return NodeFilter.FILTER_REJECT
        if (parent.tagName === 'MARK' && parent.hasAttribute('data-search-highlight')) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })
    let n: Text | null
    while ((n = walker.nextNode() as Text | null)) {
      textNodes.push(n)
    }

    let globalMatchIndex = 0

    for (let i = textNodes.length - 1; i >= 0; i--) {
      const textNode = textNodes[i]
      const text = textNode.textContent ?? ''
      const searchText = searchCaseRef.current ? text : text.toLowerCase()
      const parent = textNode.parentNode
      if (!parent) continue

      const localMatches: { start: number; end: number }[] = []
      let pos = 0
      while (pos <= searchText.length - lowerQuery.length) {
        const idx = searchText.indexOf(lowerQuery, pos)
        if (idx === -1) break
        localMatches.push({ start: idx, end: idx + query.length })
        pos = idx + 1
      }

      if (localMatches.length === 0) continue

      const matchStartIndex = globalMatchIndex
      for (let j = localMatches.length - 1; j >= 0; j--) {
        const match = localMatches[j]
        try {
          const range = document.createRange()
          range.setStart(textNode, match.start)
          range.setEnd(textNode, match.end)
          const mark = document.createElement('mark')
          mark.setAttribute('data-search-highlight', '')
          mark.setAttribute('data-match-index', String(matchStartIndex + j))
          mark.className = 'search-highlight'
          range.surroundContents(mark)
        } catch {
          try {
            const range = document.createRange()
            range.setStart(textNode, match.start)
            range.setEnd(textNode, match.end)
            const mark = document.createElement('mark')
            mark.setAttribute('data-search-highlight', '')
            mark.setAttribute('data-match-index', String(matchStartIndex + j))
            mark.className = 'search-highlight'
            const contents = range.extractContents()
            mark.appendChild(contents)
            range.insertNode(mark)
          } catch {
            // Skip if we can't highlight this segment
          }
        }
      }
      globalMatchIndex += localMatches.length
    }

    const markElements = article.querySelectorAll<HTMLElement>('mark[data-search-highlight]')
    const uniqueIndices = new Set<number>()
    markElements.forEach((el) => {
      uniqueIndices.add(Number(el.getAttribute('data-match-index')))
    })

    matchesRef.current = Array.from(uniqueIndices)
    setMatchCount(uniqueIndices.size)
    setCurrentMatch(0)
    currentMatchRef.current = 0
    } catch {
      matchesRef.current = []
      setMatchCount(0)
      setCurrentMatch(0)
    }
  }, [clearHighlights])

  const scrollToMatch = useCallback((index: number) => {
    const article = articleRef.current
    if (!article) return
    const marks = article.querySelectorAll<HTMLElement>('mark[data-search-highlight]')
    if (index < 0 || index >= marks.length) return

    // Remove active class from all
    marks.forEach((m) => m.classList.remove('search-highlight-active'))
    // Add to all marks with the same match index
    const targetIdx = marks[index].getAttribute('data-match-index')
    if (targetIdx !== null) {
      marks.forEach((m) => {
        if (m.getAttribute('data-match-index') === targetIdx) {
          m.classList.add('search-highlight-active')
        }
      })
    }
    marks[index].scrollIntoView({ block: 'center', behavior: 'smooth' })
    setCurrentMatch(index + 1)
    currentMatchRef.current = index
  }, [])

  const runSearch = useCallback((query: string) => {
    searchQueryRef.current = query
    highlightMatches(query)
    // After highlighting, navigate to the first match
    if (matchesRef.current.length > 0) {
      scrollToMatch(0)
    }
  }, [highlightMatches, scrollToMatch])

  const navigateSearch = useCallback((direction: 'next' | 'prev') => {
    if (matchesRef.current.length === 0) return
    if (direction === 'prev') {
      const prev = currentMatchRef.current <= 0 ? matchesRef.current.length - 1 : currentMatchRef.current - 1
      scrollToMatch(prev)
    } else {
      const next = currentMatchRef.current >= matchesRef.current.length - 1 ? 0 : currentMatchRef.current + 1
      scrollToMatch(next)
    }
  }, [scrollToMatch])

  const handleSearch = useCallback((query: string, direction: 'next' | 'prev') => {
    const queryChanged = query !== searchQueryRef.current
    if (queryChanged) {
      // New query: run full search and navigate to first match
      runSearch(query)
    } else {
      // Same query: just navigate
      navigateSearch(direction)
    }
  }, [runSearch, navigateSearch])

  const handleSearchClear = useCallback(() => {
    clearHighlights()
    searchQueryRef.current = ''
  }, [clearHighlights])

  // Re-highlight when content changes and search is active
  useEffect(() => {
    if (searchVisible && searchQueryRef.current) {
      highlightMatches(searchQueryRef.current)
      if (matchesRef.current.length > 0 && currentMatchRef.current < matchesRef.current.length) {
        scrollToMatch(currentMatchRef.current)
      } else if (matchesRef.current.length > 0) {
        scrollToMatch(0)
      }
    }
  }, [html, searchVisible, highlightMatches, scrollToMatch])

  // Set case sensitivity from SearchBar (via a custom event or prop)
  // We use a ref that SearchBar can update
  const setSearchCaseSensitive = useCallback((val: boolean) => {
    searchCaseRef.current = val
    if (searchQueryRef.current) {
      highlightMatches(searchQueryRef.current)
      // Restore navigation position after re-highlighting
      if (matchesRef.current.length > 0 && currentMatchRef.current < matchesRef.current.length) {
        scrollToMatch(currentMatchRef.current)
      } else if (matchesRef.current.length > 0) {
        scrollToMatch(0)
      }
    }
  }, [highlightMatches, scrollToMatch])

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
    // Handle mermaid toggle button
    const mermaidBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mermaid-toggle]')
    if (mermaidBtn) {
      handleMermaidToggle(e)
      return
    }
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
    <div className="relative flex min-w-0 h-full flex-col">
      <SearchBar
        visible={!!searchVisible}
        onClose={() => onSearchClose?.()}
        onSearch={handleSearch}
        onClear={handleSearchClear}
        onCaseSensitiveChange={setSearchCaseSensitive}
        matchCount={matchCount}
        currentMatch={currentMatch}
        focusTrigger={searchFocusTrigger}
      />
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
            <MemoizedContentDiv html={html} onClick={handleClick} />
          ) : null}
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
    </div>
  )
}