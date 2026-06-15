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

interface SaveDialogProps {
  open: boolean
  defaultName: string
  onSave: (name: string) => void
  onCancel: () => void
}

export function SaveDialog({ open, defaultName, onSave, onCancel }: SaveDialogProps) {
  const [name, setName] = useState(defaultName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName(defaultName)
    }
  }, [open, defaultName])

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        const input = inputRef.current
        if (input) {
          input.focus()
          const dotIndex = input.value.lastIndexOf('.')
          input.setSelectionRange(0, dotIndex > 0 ? dotIndex : input.value.length)
        }
      }, 0)
    }
  }, [open])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onSave(trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`)
  }, [name, onSave])

  const isValid = name.trim().length > 0 && !name.trim().includes('/')

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel() }}>
      <DialogContent className="sm:max-w-[400px]">
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
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="untitled.md"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={!isValid}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
