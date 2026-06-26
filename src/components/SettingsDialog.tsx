import { useCallback, useEffect, useRef, useState } from 'react'
import { fontOptions, type FontOption, type ScaleOption, scaleOptions, type WidthOption, widthOptions, themes, type Theme } from '@/lib/theme'
import { addChatModel, getStoredOllamaApiKey, moveChatModel, removeChatModel, storeOllamaApiKey, type ChatModel } from '@/lib/chat'
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
import { GripVertical, Plus, Trash2 } from 'lucide-react'

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
  frontmatterExpanded: boolean
  onFrontmatterExpandedChange: (value: boolean) => void
  models: ChatModel[]
  onModelsChange: (models: ChatModel[]) => void
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
  frontmatterExpanded,
  onFrontmatterExpandedChange,
  models,
  onModelsChange,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabId>('appearance')
  const [previewThemeId, setPreviewThemeId] = useState(currentTheme.id)
  const [newModelId, setNewModelId] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Find which chip the pointer is inside. We hit-test by pointer-in-rect
  // (not by dragover on the chip itself, which fires inconsistently). Since
  // chips never move during the drag, geometry stays stable and there is no
  // jitter.
  const computeOverId = useCallback((clientX: number, clientY: number): string | null => {
    const container = containerRef.current
    if (!container) return null
    const children = Array.from(container.children) as HTMLElement[]
    for (const child of children) {
      const rect = child.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return child.dataset.modelId ?? null
      }
    }
    return null
  }, [])
  const [pendingDelete, setPendingDelete] = useState<ChatModel | null>(null)

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
    <>
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

                <div className="mt-5 flex items-center justify-between">
                  <label className="text-sm font-medium">Expand frontmatter by default</label>
                  <button
                    tabIndex={-1}
                    onClick={() => onFrontmatterExpandedChange(!frontmatterExpanded)}
                    className={cn(
                      'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                      frontmatterExpanded ? 'bg-primary' : 'bg-input'
                    )}
                  >
                    <span className={cn(
                      'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                      frontmatterExpanded ? 'translate-x-4' : 'translate-x-0.5'
                    )} />
                  </button>
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
              <div className="space-y-6">
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

                <div>
                  <label className="mb-2 block text-sm font-medium">Models</label>
                  <div
                    ref={containerRef}
                    className="flex flex-wrap gap-1.5"
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (!dragId) return
                      setOverId(computeOverId(e.clientX, e.clientY))
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (dragId && overId && dragId !== overId) onModelsChange(moveChatModel(dragId, overId))
                      setDragId(null)
                      setOverId(null)
                    }}
                  >
                    {models.map((m) => (
                      <span
                        key={m.id}
                        data-model-id={m.id}
                        draggable
                        onDragStart={() => { setDragId(m.id); setOverId(null) }}
                        onDragEnd={() => { setDragId(null); setOverId(null) }}
                        className={cn(
                          'group inline-flex items-center gap-1 rounded-full border border-border bg-background py-1 pl-1.5 pr-2 text-xs transition-colors',
                          dragId === m.id && 'opacity-40',
                          overId === m.id && dragId !== m.id && 'border-primary bg-primary/10 ring-1 ring-primary'
                        )}
                      >
                        <GripVertical className="h-3 w-3 cursor-grab text-muted-foreground" />
                        <span className="truncate max-w-[140px]">{m.name}</span>
                        <button
                          onClick={() => setPendingDelete(m)}
                          disabled={models.length <= 1}
                          className="ml-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                          title="Remove model"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      tabIndex={-1}
                      placeholder="Model id, e.g. llama3.2:latest"
                      value={newModelId}
                      onChange={(e) => setNewModelId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const id = newModelId.trim()
                          if (!id) return
                          onModelsChange(addChatModel(id))
                          setNewModelId('')
                        }
                      }}
                      className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-0"
                    />
                    <button
                      onClick={() => {
                        const id = newModelId.trim()
                        if (!id) return
                        onModelsChange(addChatModel(id))
                        setNewModelId('')
                      }}
                      className="flex h-9 items-center gap-1 rounded-md border border-border bg-background px-3 text-sm hover:bg-accent"
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">Drag tags to reorder. Click the trash icon to remove.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={pendingDelete !== null} onOpenChange={(v) => { if (!v) setPendingDelete(null) }}>
      <DialogContent className="sm:max-w-[400px]" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Remove Model</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove "{pendingDelete?.name}" from the model list? This only removes it from the selector and does not uninstall anything.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (pendingDelete) onModelsChange(removeChatModel(pendingDelete.id))
              setPendingDelete(null)
            }}
          >
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
