import { useEffect, useState } from 'react'
import { fontOptions, type FontOption, type ScaleOption, scaleOptions, type WidthOption, widthOptions, themes, type Theme } from '@/lib/theme'
import { getStoredOllamaApiKey, storeOllamaApiKey } from '@/lib/chat'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentTheme: Theme
  onThemeChange: (theme: Theme) => void
  currentFont: FontOption
  onFontChange: (font: FontOption) => void
  currentWidth: WidthOption
  onWidthChange: (width: WidthOption) => void
  currentScale: ScaleOption
  onScaleChange: (scale: ScaleOption) => void
}

const TABS = [
  { id: 'appearance' as const, label: 'Appearance' },
  { id: 'chat' as const, label: 'Chat' },
] as const

type TabId = (typeof TABS)[number]['id']

export function SettingsDialog({
  open,
  onOpenChange,
  currentTheme,
  onThemeChange,
  currentFont,
  onFontChange,
  currentWidth,
  onWidthChange,
  currentScale,
  onScaleChange,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>('appearance')
  const [previewThemeId, setPreviewThemeId] = useState(currentTheme.id)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.startsWith('Arrow')) {
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  const handleSelect = (theme: Theme) => {
    setPreviewThemeId(theme.id)
    onThemeChange(theme)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[520px] grid grid-rows-[auto_1fr] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 mt-4 -mx-6 -mb-6">
          <div className="w-32 shrink-0 border-r px-2 py-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                  activeTab === tab.id
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-2">
            {activeTab === 'appearance' && (
              <>
                <div>
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
                  <label className="mb-2 block text-sm font-medium">Markdown font size</label>
                  <select
                    tabIndex={-1}
                    value={currentScale.id}
                    onChange={(e) => {
                      const selected = scaleOptions.find((s) => s.id === e.target.value)
                      if (selected) onScaleChange(selected)
                    }}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-0"
                  >
                    {scaleOptions.map((scale) => (
                      <option key={scale.id} value={scale.id}>
                        {scale.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="block text-sm font-medium">Content width</label>
                    <span className="text-xs text-muted-foreground">{currentWidth.name}</span>
                  </div>
                  <select
                    tabIndex={-1}
                    value={currentWidth.id}
                    onChange={(e) => {
                      const selected = widthOptions.find((w) => w.id === e.target.value)
                      if (selected) onWidthChange(selected)
                    }}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-0"
                  >
                    {widthOptions.map((width) => (
                      <option key={width.id} value={width.id}>
                        {width.name}
                      </option>
                    ))}
                  </select>
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
              </>
            )}

            {activeTab === 'chat' && (
              <div>
                <label className="mb-2 block text-sm font-medium">Ollama API Key</label>
                <input
                  type="password"
                  tabIndex={-1}
                  placeholder="Leave empty for local Ollama"
                  defaultValue={getStoredOllamaApiKey()}
                  onChange={(e) => storeOllamaApiKey(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-0"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">Used for cloud models and web search. Stored locally on your device.</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
