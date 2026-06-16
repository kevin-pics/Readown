import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface RenameDialogProps {
  open: boolean
  currentName: string
  isFile?: boolean
  onRename: (newName: string) => void
  onCancel: () => void
}

function RenameDialogInner({ currentName, isFile, onRename, onCancel }: Omit<RenameDialogProps, 'open'>) {
  const [name, setName] = useState(currentName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      const input = inputRef.current
      if (input) {
        input.focus()
        if (isFile) {
          const dotIndex = input.value.lastIndexOf('.')
          input.setSelectionRange(0, dotIndex > 0 ? dotIndex : input.value.length)
        } else {
          input.setSelectionRange(0, input.value.length)
        }
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [isFile])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onRename(trimmed)
  }, [name, onRename])

  const isValid = name.trim().length > 0 && name.trim() !== currentName && !name.trim().includes('/')

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Rename</DialogTitle>
        <DialogDescription>
          Enter a new name for "{currentName}".
        </DialogDescription>
      </DialogHeader>
      <div className="py-4">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          )}
          placeholder={currentName}
          autoFocus
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={!isValid}>Rename</Button>
      </DialogFooter>
    </form>
  )
}

export function RenameDialog({ open, currentName, isFile, onRename, onCancel }: RenameDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel() }}>
      <DialogContent className="sm:max-w-[400px]" onCloseAutoFocus={(e) => e.preventDefault()}>
        {open && <RenameDialogInner key={currentName} currentName={currentName} isFile={isFile} onRename={onRename} onCancel={onCancel} />}
      </DialogContent>
    </Dialog>
  )
}
