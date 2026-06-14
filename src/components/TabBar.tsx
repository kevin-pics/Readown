import { FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TabBarProps {
  tabs: string[]
  activePath: string | null
  onActivate: (path: string) => void
  onClose: (path: string) => void
}

function fileNameWithoutExt(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx > 0 ? name.slice(0, idx) : name
}

function computeLabels(tabs: string[]): Record<string, string> {
  const counts = new Map<string, number>()
  for (const path of tabs) {
    const rawName = path.split(/[\\/]/).pop() ?? path
    counts.set(fileNameWithoutExt(rawName), (counts.get(fileNameWithoutExt(rawName)) ?? 0) + 1)
  }

  const labels: Record<string, string> = {}
  for (const path of tabs) {
    const parts = path.split(/[\\/]/)
    const rawName = parts[parts.length - 1] ?? path
    const name = fileNameWithoutExt(rawName)
    labels[path] =
      (counts.get(name) ?? 0) > 1 && parts.length >= 2
        ? `${parts[parts.length - 2]}/${name}`
        : name
  }
  return labels
}

export function TabBar({ tabs, activePath, onActivate, onClose }: TabBarProps) {
  if (tabs.length === 0) return null

  const labels = computeLabels(tabs)

  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto bg-muted/40">
      {tabs.map((path) => {
        const name = labels[path]
        const active = path === activePath
        return (
          <div
            key={path}
            onClick={() => onActivate(path)}
            className={cn(
              'group flex max-w-[220px] shrink-0 cursor-pointer items-center gap-1.5 border-r px-3 text-xs transition-colors',
              active
                ? 'border-t-2 border-t-primary bg-background font-semibold text-foreground'
                : 'border-b text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            )}
            title={path}
          >
            <FileText className={cn('h-3.5 w-3.5 shrink-0', active && 'text-primary')} />
            <span className="truncate-start min-w-0">{name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClose(path)
              }}
              className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted-foreground/20 hover:text-foreground"
              title="Close tab"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
