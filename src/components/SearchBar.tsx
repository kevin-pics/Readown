import { useEffect, useRef, useState, useCallback } from 'react'
import { X, ChevronDown, ChevronUp, CaseSensitive } from 'lucide-react'

interface SearchBarProps {
  visible: boolean
  onClose: () => void
  onSearch: (query: string, direction: 'next' | 'prev') => void
  onClear: () => void
  onCaseSensitiveChange?: (val: boolean) => void
  matchCount?: number
  currentMatch?: number
  focusTrigger?: number
}

export function SearchBar({ visible, onClose, onSearch, onClear, onCaseSensitiveChange, matchCount, currentMatch, focusTrigger }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [opened, setOpened] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [caseSensitive, setCaseSensitive] = useState(false)

  // Track visibility transitions for pre-fill and reset
  useEffect(() => { /* eslint-disable react-hooks/set-state-in-effect */
    if (visible && !opened) {
      // Just opened: pre-fill from selection
      const sel = window.getSelection()?.toString() ?? ''
      if (sel) setQuery(sel)
      setOpened(true)
    } else if (!visible && opened) {
      // Just closed: reset
      setQuery('')
      setOpened(false)
      onClear()
    }
  }, [visible, opened, onClear]) /* eslint-enable react-hooks/set-state-in-effect */

  // Trigger search when query is pre-filled from selection on first open
  useEffect(() => {
    if (visible && opened && query) {
      onSearch(query, 'next')
    }
    // Only run when opened changes (i.e., search bar first opens)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened])
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(timer)
    }
  }, [visible, opened, focusTrigger])

  // Notify parent about case sensitivity changes
  useEffect(() => {
    onCaseSensitiveChange?.(caseSensitive)
  }, [caseSensitive, onCaseSensitiveChange])

  // Handle Enter/Escape keys
  useEffect(() => {
    if (!visible) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      } else if (e.key === 'Enter' && query) {
        e.preventDefault()
        e.stopPropagation()
        onSearch(query, e.shiftKey ? 'prev' : 'next')
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [visible, query, onSearch, onClose])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (val) {
      onSearch(val, 'next')
    } else {
      onClear()
    }
  }, [onSearch, onClear])

  const matchText = matchCount !== undefined
    ? currentMatch !== undefined && matchCount > 0
      ? `${currentMatch}/${matchCount}`
      : matchCount === 0 ? '0/0' : ''
    : ''

  if (!visible) return null

  return (
    <div className="flex items-center gap-2 border-b bg-background px-3 py-1.5 text-sm shadow-sm">
      <button
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${caseSensitive ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}
        onClick={() => setCaseSensitive((v) => !v)}
        title={caseSensitive ? 'Match case: on' : 'Match case: off'}
      >
        <CaseSensitive className="h-3.5 w-3.5" />
      </button>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleChange}
        placeholder="Find in page…"
        className="h-7 flex-1 rounded-md border bg-transparent px-2 text-sm outline-none focus:border-primary placeholder:text-muted-foreground"
        spellCheck={false}
      />
      <span className="min-w-[3rem] shrink-0 text-center text-xs text-muted-foreground">{matchText}</span>
      <button
        onClick={() => onSearch(query, 'prev')}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40"
        disabled={!query}
        title="Previous match (Shift+Enter)"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => onSearch(query, 'next')}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40"
        disabled={!query}
        title="Next match (Enter)"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={onClose}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        title="Close (Escape)"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
