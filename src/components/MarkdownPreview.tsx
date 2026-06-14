import { useEffect, useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'
import { ScrollArea } from '@/components/ui/scroll-area'
import { BookOpen, FileText } from 'lucide-react'

interface MarkdownPreviewProps {
  content: string
  filePath: string | null
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

export function MarkdownPreview({ content, filePath }: MarkdownPreviewProps) {
  const html = useMemo(() => {
    if (!content) return ''
    const raw = marked.parse(content) as string
    return DOMPurify.sanitize(raw)
  }, [content])

  useEffect(() => {
    document.querySelectorAll<HTMLElement>('.prose pre code').forEach((block) => {
      hljs.highlightElement(block)
    })
  }, [html])

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
    <ScrollArea className="h-full">
      <article className="prose max-w-none px-8 py-8">
        <div className="mb-6 flex items-center gap-2 border-b pb-4 text-xs text-muted-foreground">
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{filePath}</span>
        </div>
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="text-muted-foreground">Empty file.</p>
        )}
      </article>
    </ScrollArea>
  )
}
