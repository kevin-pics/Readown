import { FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TabBarProps {
  tabs: string[]
  activePath: string | null
  onActivate: (path: string) => void
  onClose: (path: string) => void
}

export function TabBar({ tabs, activePath, onActivate, onClose }: TabBarProps) {
  if (tabs.length === 0) return null

  return (
    <div className="flex h-9 shrink-0 items-stretch overflow-x-auto bg-muted/40">
      {tabs.map((path) => {
        const name = path.split(/[\\/]/).pop() ?? path
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
            <span className="truncate">{name}</span>
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
