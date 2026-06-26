import type { FileNode } from '@/types/electron'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { ChevronRight, FileText, Folder, FolderOpen, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useState } from 'react'

interface FileTreeProps {
  nodes: FileNode[]
  selectedPath: string | null
  onSelect: (path: string) => void
  onLoadChildren?: (node: FileNode) => void
  onRename?: (node: FileNode) => void
  onDelete?: (node: FileNode) => void
}

export function FileTree({ nodes, selectedPath, onSelect, onLoadChildren, onRename, onDelete }: FileTreeProps) {
  return (
    <div className="select-none py-2">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onLoadChildren={onLoadChildren}
          depth={0}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

interface TreeNodeProps {
  node: FileNode
  selectedPath: string | null
  onSelect: (path: string) => void
  onLoadChildren?: (node: FileNode) => void
  depth: number
  onRename?: (node: FileNode) => void
  onDelete?: (node: FileNode) => void
}

function TreeNode({ node, selectedPath, onSelect, onLoadChildren, depth, onRename, onDelete }: TreeNodeProps) {
  const [open, setOpen] = useState(false)
  const INDENT = 16
  const folderPad = depth * INDENT + 8
  const filePad = folderPad + 20

  const handleRename = useCallback(() => {
    if (onRename) setTimeout(() => onRename(node), 0)
  }, [onRename, node])

  const handleDelete = useCallback(() => {
    if (onDelete) setTimeout(() => onDelete(node), 0)
  }, [onDelete, node])

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (next && node.children === undefined && onLoadChildren) {
      onLoadChildren(node)
    }
  }, [node, onLoadChildren])

  if (node.type === 'file') {
    const fileButton = (
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

    if (!onRename && !onDelete) {
      return fileButton
    }

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {fileButton}
        </ContextMenuTrigger>
        <ContextMenuContent>
          {onRename && (
            <ContextMenuItem onClick={handleRename}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Rename
            </ContextMenuItem>
          )}
          {onRename && onDelete && <ContextMenuSeparator />}
          {onDelete && (
            <ContextMenuItem destructive onClick={handleDelete}>
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>
    )
  }

  const folderButton = (
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
  )

  const contextMenuItems = onRename || onDelete

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      {contextMenuItems ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div>
              <CollapsibleTrigger asChild>
                {folderButton}
              </CollapsibleTrigger>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {onRename && (
              <ContextMenuItem onClick={handleRename}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Rename
              </ContextMenuItem>
            )}
            {onRename && onDelete && <ContextMenuSeparator />}
            {onDelete && (
              <ContextMenuItem destructive onClick={handleDelete}>
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </ContextMenuItem>
            )}
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        <CollapsibleTrigger asChild>
          {folderButton}
        </CollapsibleTrigger>
      )}
      <CollapsibleContent>
        <div>
          {(node.children ?? []).map((child: FileNode) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onLoadChildren={onLoadChildren}
              depth={depth + 1}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
