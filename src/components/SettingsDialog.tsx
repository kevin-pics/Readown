import { useState } from 'react'
import { themes, type Theme } from '@/lib/theme'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentTheme: Theme
  onThemeChange: (theme: Theme) => void
}

export function SettingsDialog({
  open,
  onOpenChange,
  currentTheme,
  onThemeChange,
}: SettingsDialogProps) {
  const [previewThemeId, setPreviewThemeId] = useState(currentTheme.id)

  const handleSelect = (theme: Theme) => {
    setPreviewThemeId(theme.id)
    onThemeChange(theme)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Appearance</DialogTitle>
          <DialogDescription>
            Choose a theme for the reader interface.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {themes.map((theme) => (
            <button
              key={theme.id}
              onClick={() => handleSelect(theme)}
              className={cn(
                'relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-all hover:border-primary',
                previewThemeId === theme.id && 'border-primary ring-1 ring-primary'
              )}
            >
              <div className="flex h-20 overflow-hidden rounded-md border">
                <div
                  className="w-1/3 border-r"
                  style={{ backgroundColor: theme.preview.sidebar }}
                />
                <div className="w-2/3" style={{ backgroundColor: theme.preview.content }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{theme.name}</span>
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: theme.preview.accent }}
                />
              </div>
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
