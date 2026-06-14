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
    <div className="py-2">
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
  const [open, setOpen] = useState(true)
  const hasChildren = node.children && node.children.length > 0
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
            ? 'bg-accent text-accent-foreground'
            : 'text-foreground hover:bg-accent/60 hover:text-accent-foreground'
        )}
        style={{ paddingLeft: `${filePad}px` }}
      >
        <FileText
          className={cn(
            'h-4 w-4 shrink-0 transition-colors',
            selectedPath === node.path
              ? 'text-accent-foreground'
              : 'text-muted-foreground group-hover:text-accent-foreground'
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
          className="group flex w-full items-center gap-1 py-1 pr-2 text-sm font-medium text-foreground transition-colors hover:bg-accent/60 hover:text-accent-foreground"
          style={{ paddingLeft: `${folderPad}px` }}
        >
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-accent-foreground',
              open && 'rotate-90'
            )}
          />
          {open ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent-foreground" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent-foreground" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div>
          {hasChildren ? (
            node.children!.map((child: FileNode) => (
              <TreeNode
                key={child.path}
                node={child}
                selectedPath={selectedPath}
                onSelect={onSelect}
                depth={depth + 1}
              />
            ))
          ) : (
            <span
              className="block py-1 text-xs text-muted-foreground"
              style={{ paddingLeft: `${(depth + 1) * INDENT + 28}px` }}
            >
              Empty folder
            </span>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
