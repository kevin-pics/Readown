import { useEffect, useRef } from 'react'
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, rectangularSelection, crosshairCursor } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Eye, FileText, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MarkdownEditorProps {
  content: string
  filePath: string | null
  contentWidth: string
  onChange: (value: string) => void
  onSave: () => void
  onToggleEdit?: () => void
  onToggleChat?: () => void
}

function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark') ||
    document.documentElement.getAttribute('data-theme') === 'dark' ||
    window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function MarkdownEditor({ content, filePath, contentWidth, onChange, onSave, onToggleEdit, onToggleChat }: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const isDarkRef = useRef(isDarkMode())
  const skipNextChangeRef = useRef(false)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  useEffect(() => {
    if (!containerRef.current) return

    const dark = isDarkRef.current

    const saveKeymap = keymap.of([{
      key: 'Mod-s',
      run: () => {
        onSaveRef.current()
        return true
      },
    }])

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !skipNextChangeRef.current) {
        onChangeRef.current(update.state.doc.toString())
      }
      skipNextChangeRef.current = false
    })

    const extensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      history(),
      drawSelection(),
      EditorState.allowMultipleSelections.of(true),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      bracketMatching(),
      closeBrackets(),
      highlightActiveLine(),
      rectangularSelection(),
      crosshairCursor(),
      highlightSelectionMatches(),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        indentWithTab,
      ]),
      saveKeymap,
      updateListener,
      EditorView.lineWrapping,
      EditorView.theme({
        '&': {
          height: '100%',
          fontSize: '14px',
        },
        '.cm-content': {
          fontFamily: 'var(--font-family, "JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace)',
          lineHeight: '1.6',
          padding: '0 16px',
        },
        '.cm-gutters': {
          backgroundColor: 'transparent',
          borderRight: 'none',
          color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
        },
        '.cm-activeLineGutter': {
          backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
        },
        '.cm-activeLine': {
          backgroundColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
        },
        '&.cm-focused .cm-cursor': {
          borderLeftColor: dark ? '#fff' : '#000',
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
          backgroundColor: dark ? 'rgba(66,133,244,0.4)' : 'rgba(66,133,244,0.25) !important',
        },
        '.cm-scroller': {
          overflow: 'auto',
        },
      }),
      ...(dark ? [oneDark] : []),
    ]

    const state = EditorState.create({
      doc: content,
      extensions,
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view
    // Focus after the editor is fully mounted in the DOM
    requestAnimationFrame(() => {
      view.focus()
    })

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Only recreate when filePath changes (new tab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath])

  // Sync external content changes (e.g., file reload from disk)
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentContent = view.state.doc.toString()
    if (currentContent !== content) {
      skipNextChangeRef.current = true
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: content },
      })
    }
  }, [content])

  // Re-create editor when theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dark = isDarkMode()
      if (dark !== isDarkRef.current) {
        isDarkRef.current = dark
        // Re-create editor with new theme
        if (containerRef.current && viewRef.current) {
          const currentContent = viewRef.current.state.doc.toString()
          viewRef.current.destroy()
          viewRef.current = null

          const updateListener = EditorView.updateListener.of((update) => {
            if (update.docChanged && !skipNextChangeRef.current) {
              onChangeRef.current(update.state.doc.toString())
            }
            skipNextChangeRef.current = false
          })

          const saveKeymap = keymap.of([{
            key: 'Mod-s',
            run: () => {
              onSaveRef.current()
              return true
            },
          }])

          const extensions = [
            lineNumbers(),
            highlightActiveLineGutter(),
            history(),
            drawSelection(),
            EditorState.allowMultipleSelections.of(true),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            bracketMatching(),
            closeBrackets(),
            highlightActiveLine(),
            rectangularSelection(),
            crosshairCursor(),
            highlightSelectionMatches(),
            markdown({ base: markdownLanguage, codeLanguages: languages }),
            keymap.of([
              ...closeBracketsKeymap,
              ...defaultKeymap,
              ...searchKeymap,
              ...historyKeymap,
              indentWithTab,
            ]),
            saveKeymap,
            updateListener,
            EditorView.lineWrapping,
            EditorView.theme({
              '&': {
                height: '100%',
                fontSize: '14px',
              },
              '.cm-content': {
                fontFamily: 'var(--font-family, "JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace)',
                lineHeight: '1.6',
                padding: '0 16px',
              },
              '.cm-gutters': {
                backgroundColor: 'transparent',
                borderRight: 'none',
                color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.25)',
              },
              '.cm-activeLineGutter': {
                backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              },
              '.cm-activeLine': {
                backgroundColor: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
              },
              '&.cm-focused .cm-cursor': {
                borderLeftColor: dark ? '#fff' : '#000',
              },
              '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
                backgroundColor: dark ? 'rgba(66,133,244,0.4)' : 'rgba(66,133,244,0.25) !important',
              },
              '.cm-scroller': {
                overflow: 'auto',
              },
            }),
            ...(dark ? [oneDark] : []),
          ]

          const state = EditorState.create({
            doc: currentContent,
            extensions,
          })

          const view = new EditorView({
            state,
            parent: containerRef.current,
          })
          viewRef.current = view
        }
      }
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })

    return () => observer.disconnect()
  }, [])

  return (
    <ScrollArea className="h-full">
      <div
        className={cn('px-8 py-8', contentWidth === '100%' && 'max-w-none')}
        style={{ maxWidth: contentWidth !== '100%' ? contentWidth : undefined }}
      >
        <div className="mb-6 flex items-center gap-2 border-b pb-4 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{filePath}</span>
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
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors bg-primary/10 text-primary hover:bg-primary/20"
                title="Switch to preview (⌘E)"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
            )}
          </div>
        </div>
        <div ref={containerRef} />
      </div>
    </ScrollArea>
  )
}
