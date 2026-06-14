import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileNode } from '@/types/electron'
import { FileTree } from '@/components/FileTree'
import { MarkdownPreview } from '@/components/MarkdownPreview'
import { TabBar } from '@/components/TabBar'
import { SettingsDialog } from '@/components/SettingsDialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { hashString, resolveRelativePath } from '@/lib/utils'
import { BookOpen, FileText, Folder, FolderOpen } from 'lucide-react'
import { applyFont, applyScale, applyTheme, getStoredFont, getStoredScale, getStoredTheme, getStoredWidth, storeFont, storeScale, storeTheme, storeWidth, type FontOption, type ScaleOption, type Theme, type WidthOption } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface DirectoryAPI {
  openDirectory: () => Promise<FileNode[] | null>
  loadDirectory: (source: string | FileSystemDirectoryHandle) => Promise<FileNode[]>
  readFile: (path: string) => Promise<string>
  onDragDrop: (callback: (source: string | FileSystemDirectoryHandle) => void) => () => void
}

function adaptElectronAPI(electronAPI: Window['readownAPI']): DirectoryAPI {
  return {
    openDirectory: () => electronAPI.openDirectory(),
    loadDirectory: async (source) => {
      if (typeof source !== 'string') {
        throw new Error('Electron only supports directory paths as strings')
      }
      return electronAPI.scanDirectory(source)
    },
    readFile: (path) => electronAPI.readFile(path),
    onDragDrop: (callback) =>
      electronAPI.onDragDrop((dirPath) => callback(dirPath)),
  }
}

function createBrowserAPI(): DirectoryAPI {
  const fileHandles = new Map<string, FileSystemFileHandle>()
  const EXCLUDED = new Set(['.git', 'node_modules', '.DS_Store'])
  const MAX_FILES = 500

  async function scanHandle(handle: FileSystemDirectoryHandle): Promise<FileNode[]> {
    const rootNodes: FileNode[] = []
    let visitedFiles = 0

    interface DirWithHandle {
      handle: FileSystemDirectoryHandle
      basePath: string
      targetNodes: FileNode[]
    }

    const processDir = async (item: DirWithHandle) => {
      const entries: FileSystemHandle[] = []
      for await (const entry of item.handle.values()) {
        entries.push(entry)
      }

      const childDirs: FileSystemDirectoryHandle[] = []

      for (const entry of entries) {
        if (EXCLUDED.has(entry.name)) continue
        const rel = item.basePath ? `${item.basePath}/${entry.name}` : entry.name

        if (entry.kind === 'directory') {
          childDirs.push(entry as FileSystemDirectoryHandle)
        } else if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.md')) {
          if (visitedFiles < MAX_FILES) {
            visitedFiles++
            fileHandles.set(rel, entry as FileSystemFileHandle)
            item.targetNodes.push({
              name: entry.name,
              path: rel,
              relativePath: rel,
              type: 'file',
            })
          }
        }
      }

      return childDirs
    }

    const queue: DirWithHandle[] = [{ handle, basePath: '', targetNodes: rootNodes }]
    while (queue.length > 0) {
      const batch = queue.splice(0, queue.length)
      const nextChildren = await Promise.all(batch.map(processDir))
      for (let i = 0; i < batch.length; i++) {
        const { basePath, targetNodes } = batch[i]
        for (const childHandle of nextChildren[i]) {
          const rel = basePath ? `${basePath}/${childHandle.name}` : childHandle.name
          const children: FileNode[] = []
          const dirNode: FileNode & { children: FileNode[] } = {
            name: childHandle.name,
            path: rel,
            relativePath: rel,
            type: 'directory',
            children,
          }
          targetNodes.push(dirNode)
          queue.push({ handle: childHandle, basePath: rel, targetNodes: children })
        }
      }
    }

    const pruneEmpty = (nodes: FileNode[]): FileNode[] => {
      const kept: FileNode[] = []
      for (const node of nodes) {
        if (node.type === 'file') {
          kept.push(node)
          continue
        }
        node.children = pruneEmpty(node.children || [])
        if (node.children.length > 0) {
          kept.push(node)
        }
      }
      return kept
    }

    const pruned = pruneEmpty(rootNodes)
    if (pruned.length === 0) {
      return []
    }
    rootNodes.splice(0, rootNodes.length, ...pruned)

    const sortNodes = (nodes: FileNode[]) => {
      nodes.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name)
        return a.type === 'directory' ? -1 : 1
      })
      for (const node of nodes) {
        if (node.children) sortNodes(node.children)
      }
    }
    sortNodes(rootNodes)

    return rootNodes
  }

  return {
    openDirectory: async () => {
      try {
        if (!window.showDirectoryPicker) {
          throw new Error(
            'Your browser does not support directory selection. Please run Readown in Electron or use a compatible browser.'
          )
        }
        const handle = await window.showDirectoryPicker()
        return await scanHandle(handle)
      } catch (err) {
        const name = (err as Error).name
        if (name === 'AbortError') return null
        if (name === 'InvalidStateError' || (err as Error).message?.includes('File picker already active')) {
          return null
        }
        throw err
      }
    },
    loadDirectory: async (source) => {
      if (source instanceof FileSystemDirectoryHandle) {
        return scanHandle(source)
      }
      throw new Error('Browser directory API requires a FileSystemDirectoryHandle')
    },
    readFile: async (path) => {
      const handle = fileHandles.get(path)
      if (!handle) throw new Error(`File not found: ${path}`)
      const file = await handle.getFile()
      return file.text()
    },
    onDragDrop: () => () => {},
  }
}

export default function App() {
  const [api] = useState<DirectoryAPI>(() => {
    if (window.readownAPI) return adaptElectronAPI(window.readownAPI)
    return createBrowserAPI()
  })
  const [tree, setTree] = useState<FileNode[]>([])
  const [tabs, setTabs] = useState<string[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [contents, setContents] = useState<Record<string, string>>({})
  const [snapshots, setSnapshots] = useState<Record<string, string>>({})
  const [modifiedTabs, setModifiedTabs] = useState<Set<string>>(new Set())
  const [pendingReload, setPendingReload] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [rootName, setRootName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())
  const [font, setFont] = useState<FontOption>(() => getStoredFont())
  const [contentWidth, setContentWidth] = useState<WidthOption>(() => getStoredWidth())
  const [scale, setScale] = useState<ScaleOption>(() => getStoredScale())
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [openingDir, _setOpeningDir] = useState(false)

  useEffect(() => {
    applyTheme(theme)
    applyFont(font)
    applyScale(scale)
  }, [theme, font, scale])

  const handleFontChange = useCallback((newFont: FontOption) => {
    setFont(newFont)
    applyFont(newFont)
    storeFont(newFont)
  }, [])

  const handleWidthChange = useCallback((newWidth: WidthOption) => {
    setContentWidth(newWidth)
    storeWidth(newWidth)
  }, [])



  const handleScaleChange = useCallback((newScale: ScaleOption) => {
    setScale(newScale)
    applyScale(newScale)
    storeScale(newScale)
  }, [])

  const setActivePathAndCheckModified = useCallback((path: string | null) => {
    setActivePath(path)
    if (path && modifiedTabs.has(path)) {
      setPendingReload(path)
    }
  }, [modifiedTabs])

  const handlePreviewFocus = useCallback(() => {
    if (activePath && modifiedTabs.has(activePath)) {
      setPendingReload(activePath)
    }
  }, [activePath, modifiedTabs])

  const openFile = useCallback(
    (path: string) => {
      setError(null)
      setActivePath(path)
      setTabs((prev) => (prev.includes(path) ? prev : [...prev, path]))

      if (modifiedTabs.has(path)) {
        setPendingReload(path)
      }
    },
    [modifiedTabs]
  )

  const closeTab = useCallback(
    (path: string) => {
      const idx = tabs.indexOf(path)
      const next = tabs.filter((p) => p !== path)
      setTabs(next)
      setContents((prev) => {
        const rest: Record<string, string> = {}
        for (const key of Object.keys(prev)) {
          if (key !== path) rest[key] = prev[key]
        }
        return rest
      })
      setSnapshots((prev) => {
        const rest: Record<string, string> = {}
        for (const key of Object.keys(prev)) {
          if (key !== path) rest[key] = prev[key]
        }
        return rest
      })
      setModifiedTabs((prev) => {
        const nextSet = new Set(prev)
        nextSet.delete(path)
        return nextSet
      })
      if (activePath === path) {
        setActivePathAndCheckModified(next.length ? next[Math.min(idx, next.length - 1)] : null)
      }
    },
    [tabs, activePath, setActivePathAndCheckModified]
  )

  const reloadTab = useCallback(
    (path: string) => {
      setError(null)
      let cancelled = false
      api
        .readFile(path)
        .then((text) => {
          if (cancelled) return
          setContents((prev) => ({ ...prev, [path]: text }))
          setSnapshots((prev) => ({ ...prev, [path]: hashString(text) }))
          setModifiedTabs((prev) => {
            const next = new Set(prev)
            next.delete(path)
            return next
          })
        })
        .catch((err) => {
          if (!cancelled) setError((err as Error).message)
        })
      return () => {
        cancelled = true
      }
    },
    [api]
  )

  useEffect(() => {
    if (!activePath || contents[activePath] !== undefined) return
    let cancelled = false
    void (async () => {
      try {
        const text = await api.readFile(activePath)
        if (cancelled) return
        setContents((prev) => ({ ...prev, [activePath]: text }))
        setSnapshots((prev) => ({ ...prev, [activePath]: hashString(text) }))
        setModifiedTabs((prev) => {
          const next = new Set(prev)
          next.delete(activePath)
          return next
        })
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [activePath, contents, api])

  useEffect(() => {
    const interval = setInterval(() => {
      for (const path of tabs) {
        api
          .readFile(path)
          .then((text) => {
            const latest = hashString(text)
            const saved = snapshots[path]
            if (saved !== undefined && saved !== latest) {
              setModifiedTabs((prev) => new Set(prev).add(path))
            }
          })
          .catch(() => {
            // ignore polling errors
          })
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [tabs, snapshots, api])

  const handleOpenRelative = useCallback(
    (href: string) => {
      if (!activePath) return
      const resolved = resolveRelativePath(activePath, href)
      if (resolved) openFile(resolved)
    },
    [activePath, openFile]
  )

  const closeActiveTab = useCallback(() => {
    if (activePath) closeTab(activePath)
    else window.readownAPI?.closeWindow()
  }, [activePath, closeTab])

  const closeActiveTabRef = useRef(closeActiveTab)
  useEffect(() => {
    closeActiveTabRef.current = closeActiveTab
  }, [closeActiveTab])

  const openingDirRef = useRef(false)
  const setOpeningDir = (v: boolean) => {
    openingDirRef.current = v
    _setOpeningDir(v)
  }

  const handleOpen = useCallback(async () => {
    if (openingDirRef.current) return
    setOpeningDir(true)
    setError(null)
    try {
      const nodes = await api.openDirectory()
      if (!nodes) return
      setTree(nodes)
      setRootName(nodes[0]?.relativePath.split('/')[0] ?? 'Directory')
      setTabs([])
      setActivePath(null)
      setContents({})
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setOpeningDir(false)
    }
  }, [api])

  useEffect(() => {
    const electron = window.readownAPI
    if (!electron?.onCloseTab) return
    return electron.onCloseTab(() => closeActiveTabRef.current())
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return

      if (e.shiftKey && (e.key === '[' || e.key === ']')) {
        if (tabs.length === 0) return
        e.preventDefault()
        const currentIdx = activePath ? tabs.indexOf(activePath) : -1
        if (e.key === '[') {
          const idx = currentIdx <= 0 ? tabs.length - 1 : currentIdx - 1
          setActivePathAndCheckModified(tabs[idx])
        } else {
          const idx = currentIdx >= tabs.length - 1 ? 0 : currentIdx + 1
          setActivePathAndCheckModified(tabs[idx])
        }
        return
      }

      if (e.shiftKey) return

      if (e.key.toLowerCase() === 'w') {
        e.preventDefault()
        closeActiveTabRef.current()
        return
      }
      if (e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void handleOpen()
        return
      }
      if (e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
        return
      }
      if (e.key < '1' || e.key > '9' || tabs.length === 0) return
      e.preventDefault()
      const n = Number(e.key)
      const idx = n === 9 ? tabs.length - 1 : n - 1
      if (idx < tabs.length) setActivePathAndCheckModified(tabs[idx])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tabs, handleOpen, activePath, setActivePathAndCheckModified])

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidth
    const MIN_W = 260
    const MAX_W = Math.max(MIN_W, window.innerWidth * 0.6)

    const onMove = (ev: MouseEvent) => {
      const next = Math.min(MAX_W, Math.max(MIN_W, startWidth + ev.clientX - startX))
      setSidebarWidth(next)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  const loadDirectory = useCallback(
    async (source: string | FileSystemDirectoryHandle, selectPath?: string) => {
      setError(null)
      try {
        const nodes = await api.loadDirectory(source)
        setTree(nodes)
        setRootName(
          nodes[0]?.relativePath.split('/')[0] ??
            (typeof source === 'string'
              ? source.split('/').pop()
              : source.name) ??
            'Directory'
        )
        setTabs([])
        setActivePath(null)
        setContents({})
        if (selectPath) {
          openFile(selectPath)
        }
      } catch (err) {
        setError((err as Error).message)
      }
    },
    [api, openFile]
  )

  useEffect(() => {
    const unsubscribe = api.onDragDrop((source) => {
      loadDirectory(source)
    })
    return () => unsubscribe()
  }, [api, loadDirectory])

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme)
    applyTheme(newTheme)
    storeTheme(newTheme)
  }

  useEffect(() => {
    const electron = window.readownAPI
    if (!electron) return
    const unsubs = [
      electron.onOpenDirectory?.(() => {
        void handleOpen()
      }),
      electron.onOpenSettings?.(() => setSettingsOpen(true)),
    ]
    return () => unsubs.forEach((unsub) => unsub?.())
  }, [handleOpen])

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const item = e.dataTransfer.items[0]
    if (!item) return

    if (window.readownAPI) {
      const files = e.dataTransfer.files
      const file = files.length > 0 ? files[0] : item.getAsFile?.()
      if (!file) {
        setError('Please drop a directory or Markdown file.')
        return
      }
      const droppedPath = window.readownAPI.getPathForFile(file)
      const isDir = await window.readownAPI.isDirectory(droppedPath)
      if (isDir) {
        await loadDirectory(droppedPath)
        return
      }
      if (droppedPath.toLowerCase().endsWith('.md')) {
        const dirPath = droppedPath.substring(0, droppedPath.lastIndexOf('/')) || droppedPath.substring(0, droppedPath.lastIndexOf('\\'))
        if (dirPath) {
          await loadDirectory(dirPath, droppedPath)
          return
        }
      }
      setError('Please drop a directory or Markdown file.')
      return
    }

    try {
      const handle = await item.getAsFileSystemHandle?.()
      if (handle && handle.kind === 'directory') {
        await loadDirectory(handle as FileSystemDirectoryHandle)
        return
      }
    } catch (err) {
      setError((err as Error).message)
      return
    }

    const entry = item.webkitGetAsEntry?.()
    if (entry && entry.isDirectory) {
      setError('Drag and drop in the browser requires a File System Access API compatible drop.')
    }
  }

  const isEmpty = tree.length === 0

  return (
    <div
      className="relative flex h-full w-full overflow-hidden bg-background text-foreground"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center bg-primary/10 backdrop-blur-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-background shadow-lg">
            <Folder className="h-8 w-8 text-primary" />
          </div>
          <p className="mt-4 text-lg font-medium text-primary">Drop a directory here to start.</p>
        </div>
      )}
      <aside
        className="flex shrink-0 flex-col border-r bg-card"
        style={{ width: `${sidebarWidth}px`, minWidth: '260px' }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
              <BookOpen className="h-4 w-4" />
            </div>
            <div className="flex flex-col overflow-hidden">
              <h1 className="text-sm font-semibold leading-tight">Readown</h1>
              <span className="max-w-[100px] truncate text-xs text-muted-foreground">
                Markdown reader
              </span>
            </div>
          </div>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={handleOpen} disabled={openingDir} title="Open directory" className="shrink-0">
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {error && (
          <div className="mx-3 mt-3 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <ScrollArea className="flex-1">
          {!isEmpty ? (
            <FileTree nodes={tree} selectedPath={activePath} onSelect={openFile} />
          ) : (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-4 px-6 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                {rootName ? (
                  <FileText className="h-8 w-8 text-muted-foreground" />
                ) : (
                  <FolderOpen className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {rootName ? 'No Markdown files found' : 'No directory open'}
                </p>
                <p className="max-w-[220px] text-xs text-muted-foreground">
                  {rootName
                    ? `No .md files were found in ${rootName}.`
                    : 'Drop a directory here to start.'}
                </p>
                {rootName && (
                  <Button size="sm" variant="secondary" onClick={handleOpen} disabled={openingDir}>
                    <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                    Open another directory
                  </Button>
                )}
              </div>
            </div>
          )}
        </ScrollArea>
      </aside>

      <div
        onMouseDown={startResize}
        className="group relative w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/40"
        role="separator"
        aria-orientation="vertical"
      >
        <div className="absolute inset-y-0 -left-1 -right-1" />
      </div>

      <main className="relative flex flex-1 flex-col overflow-hidden bg-background">
        <TabBar tabs={tabs} activePath={activePath} modifiedPaths={modifiedTabs} onActivate={setActivePathAndCheckModified} onClose={closeTab} />
        <div className="flex-1 overflow-hidden">
          <MarkdownPreview
            content={activePath ? contents[activePath] ?? '' : ''}
            filePath={activePath}
            contentWidth={contentWidth.value}
            onOpenRelative={handleOpenRelative}
            onFocus={handlePreviewFocus}
          />
        </div>
      </main>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        currentTheme={theme}
        onThemeChange={handleThemeChange}
        currentFont={font}
        onFontChange={handleFontChange}
        currentWidth={contentWidth}
        onWidthChange={handleWidthChange}
        currentScale={scale}
        onScaleChange={handleScaleChange}
      />

      <Dialog open={!!pendingReload} onOpenChange={(open) => {
        if (!open) setPendingReload(null)
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>File changed</DialogTitle>
            <DialogDescription>
              The file for this tab has changed on disk. Reload the latest content?
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setPendingReload(null)}>
              Keep current
            </Button>
            <Button size="sm" onClick={() => {
              if (pendingReload) reloadTab(pendingReload)
              setPendingReload(null)
            }}>
              Reload
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
