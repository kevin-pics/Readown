import { useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface DeleteDialogProps {
  open: boolean
  itemName: string
  isDirectory: boolean
  onDelete: () => void
  onCancel: () => void
}

export function DeleteDialog({ open, itemName, isDirectory, onDelete, onCancel }: DeleteDialogProps) {
  const deleteRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        deleteRef.current?.focus()
      }, 0)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel() }}>
      <DialogContent className="sm:max-w-[400px]" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Delete {isDirectory ? 'Folder' : 'File'}</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{itemName}"?{isDirectory ? ' This will also delete all files inside.' : ''} This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="button" variant="destructive" ref={deleteRef} onClick={onDelete}>Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
