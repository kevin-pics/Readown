import { useEffect, useState } from 'react'
import { fontOptions, type FontOption, themes, type Theme } from '@/lib/theme'
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
  currentFont: FontOption
  onFontChange: (font: FontOption) => void
}

export function SettingsDialog({
  open,
  onOpenChange,
  currentTheme,
  onThemeChange,
  currentFont,
  onFontChange,
}: SettingsDialogProps) {
  const [previewThemeId, setPreviewThemeId] = useState(currentTheme.id)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

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
            Choose a theme and font for the reader interface.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <label className="mb-2 block text-sm font-medium">Font</label>
          <div className="grid grid-cols-3 gap-2">
            {fontOptions.map((font) => (
              <button
                key={font.id}
                tabIndex={-1}
                onClick={() => onFontChange(font)}
                className={cn(
                  'rounded-md border px-3 py-2 text-sm transition-colors hover:border-primary focus:outline-none focus:ring-0',
                  currentFont.id === font.id && 'border-primary bg-primary/10 text-primary'
                )}
                style={{ fontFamily: font.value }}
              >
                {font.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-sm font-medium">Theme</label>
          <div className="grid grid-cols-2 gap-3">
            {themes.map((theme) => (
            <button
              key={theme.id}
              tabIndex={-1}
              onClick={() => handleSelect(theme)}
              className={cn(
                'relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-all hover:border-primary focus:outline-none focus:ring-0',
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
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
