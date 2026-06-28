import { useMemo } from 'react'
import { FileText, MessageSquare, Pencil } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { parseCsv } from '@/lib/utils'

interface TableViewerProps {
  content: string
  filePath: string
  contentWidth: string
  onToggleEdit?: () => void
  onToggleChat?: () => void
}

export function TableViewer({ content, filePath, contentWidth, onToggleEdit, onToggleChat }: TableViewerProps) {
  const rows = useMemo(() => parseCsv(content), [content])
  const headers = rows[0] ?? []
  const body = rows.slice(1)

  return (
    <div className="relative flex min-w-0 h-full flex-col">
      <ScrollArea className="h-full">
        <article
          className="prose relative px-8 py-8"
          style={{ maxWidth: contentWidth !== '100%' ? contentWidth : undefined, ...(contentWidth === '100%' ? { maxWidth: 'none' } : {}) }}
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
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="Switch to edit (⌘E)"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
              )}
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">Empty file</p>
          ) : (
            <div className="overflow-x-auto">
              <table>
                {headers.length > 0 && (
                  <thead>
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {body.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>{cell}</td>
                      ))}
                      {row.length < headers.length &&
                        Array.from({ length: headers.length - row.length }).map((_, ci) => (
                          <td key={`empty-${ci}`} />
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </ScrollArea>
    </div>
  )
}
