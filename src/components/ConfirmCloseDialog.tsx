import { useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ConfirmCloseDialogProps {
  open: boolean
  fileName: string
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

export function ConfirmCloseDialog({ open, fileName, onSave, onDiscard, onCancel }: ConfirmCloseDialogProps) {
  const handleDiscard = useCallback(() => {
    onDiscard()
  }, [onDiscard])

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel() }}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Unsaved Changes</DialogTitle>
          <DialogDescription>
            Do you want to save changes to "{fileName}" before closing?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={handleDiscard}>Discard</Button>
          <Button type="button" onClick={onSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
