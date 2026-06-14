import type { FileNode } from '@/types/electron'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react'
import { useState } from 'react'

interface FileTreeProps {
  nodes: FileNode[]
  selectedPath: string | null
  onSelect: (path: string) => void
}

export function FileTree({ nodes, selectedPath, onSelect }: FileTreeProps) {
  return (
    <div className="select-none py-2">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </div>
  )
}

interface TreeNodeProps {
  node: FileNode
  selectedPath: string | null
  onSelect: (path: string) => void
  depth: number
}

function TreeNode({ node, selectedPath, onSelect, depth }: TreeNodeProps) {
  const [open, setOpen] = useState(false)
  const INDENT = 16
  const folderPad = depth * INDENT + 8
  const filePad = folderPad + 20

  if (node.type === 'file') {
    return (
      <button
        onClick={() => onSelect(node.path)}
        className={cn(
          'group flex w-full items-center gap-2 py-1 pr-2 text-sm transition-colors',
          selectedPath === node.path
            ? 'bg-primary/10 font-medium text-primary shadow-[inset_2px_0_0_hsl(var(--primary))]'
            : 'text-foreground/80 hover:bg-accent/60 hover:text-foreground'
        )}
        style={{ paddingLeft: `${filePad}px` }}
      >
        <FileText
          className={cn(
            'h-4 w-4 shrink-0 transition-colors',
            selectedPath === node.path
              ? 'text-primary'
              : 'text-muted-foreground/70 group-hover:text-foreground'
          )}
        />
        <span className="truncate">{node.name}</span>
      </button>
    )
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          className="group flex w-full items-center gap-1.5 py-1 pr-2 text-sm font-medium text-foreground/90 transition-colors hover:bg-accent/60 hover:text-foreground"
          style={{ paddingLeft: `${folderPad}px` }}
        >
          <ChevronRight
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform duration-200 group-hover:text-foreground',
              open && 'rotate-90'
            )}
          />
          {open ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground transition-colors" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-muted-foreground transition-colors" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div>
          {node.children!.map((child: FileNode) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
