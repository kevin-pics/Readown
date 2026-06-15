import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

interface SaveDialogProps {
  open: boolean
  defaultName: string
  fileExists?: (name: string) => boolean
  onSave: (name: string) => void
  onCancel: () => void
}

function SaveDialogInner({ defaultName, fileExists, onSave, onCancel }: Omit<SaveDialogProps, 'open'>) {
  const [name, setName] = useState(defaultName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = inputRef.current
    if (input) {
      input.focus()
      const dotIndex = input.value.lastIndexOf('.')
      input.setSelectionRange(0, dotIndex > 0 ? dotIndex : input.value.length)
    }
  }, [])

  const resolvedName = useMemo(() => {
    const trimmed = name.trim()
    if (!trimmed) return ''
    return trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`
  }, [name])

  const exists = useMemo(() => {
    if (!resolvedName || !fileExists) return false
    return fileExists(resolvedName)
  }, [resolvedName, fileExists])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSave(trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`)
  }, [name, onSave])

  const isValid = name.trim().length > 0 && !name.trim().includes('/') && !exists

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Save File</DialogTitle>
        <DialogDescription>
          Enter a name for the new file.
        </DialogDescription>
      </DialogHeader>
      <div className="py-4">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={cn(
            'flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            exists ? 'border-destructive' : 'border-input',
          )}
          placeholder="untitled.md"
          autoFocus
        />
        {exists && (
          <p className="mt-2 text-xs text-destructive">
            A file with this name already exists. Please choose a different name.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={!isValid}>Save</Button>
      </DialogFooter>
    </form>
  )
}

export function SaveDialog({ open, defaultName, fileExists, onSave, onCancel }: SaveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel() }}>
      <DialogContent className="sm:max-w-[400px]">
        {open && <SaveDialogInner key={defaultName} defaultName={defaultName} fileExists={fileExists} onSave={onSave} onCancel={onCancel} />}
      </DialogContent>
    </Dialog>
  )
}
