import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileNode } from '@/types/electron'
import { ChatPanel } from '@/components/ChatPanel'
import { FileTree } from '@/components/FileTree'
import { MarkdownPreview } from '@/components/MarkdownPreview'
import { TabBar } from '@/components/TabBar'
import { SettingsDialog } from '@/components/SettingsDialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { hashString, resolveRelativePath } from '@/lib/utils'
import { BookOpen, FileText, Folder, FolderOpen, MessageSquare } from 'lucide-react'
import { applyFont, applyScale, applyTheme, getStoredFont, getStoredScale, getStoredTheme, getStoredWidth, storeFont, storeScale, storeTheme, storeWidth, type FontOption, type ScaleOption, type Theme, type WidthOption } from '@/lib/theme'
import { Button } from '@/components/ui/button'

interface DirectoryAPI {
  openDirectory: () => Promise<FileNode[] | null>
  loadDirectory: (source: string | FileSystemDirectoryHandle) => Promise<FileNode[]>
  readFile: (path: string) => Promise<string>
  onDragDrop: (callback: (source: string | FileSystemDirectoryHandle) => void) => () => void
  onDirectoryChange?: (callback: (dirPath: string) => void) => () => void
  watchDirectory?: (dirPath: string | null) => Promise<void>
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
    onDirectoryChange: (callback) =>
      electronAPI.onDirectoryChange((dirPath) => callback(dirPath)),
    watchDirectory: (dirPath) => electronAPI.watchDirectory(dirPath),
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

function collectFilePaths(nodes: FileNode[]): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    if (node.type === 'file') {
      paths.push(node.path)
    } else if (node.children) {
      paths.push(...collectFilePaths(node.children))
    }
  }
  return paths
}

export default function App() {
  const [api] = useState<DirectoryAPI>(() => {
    if (window.readownAPI) return adaptElectronAPI(window.readownAPI)
    return createBrowserAPI()
  })
  const [tree, setTree] = useState<FileNode[]>([])
  const [dirPath, setDirPath] = useState<string | null>(null)
  const [tabs, setTabs] = useState<string[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [contents, setContents] = useState<Record<string, string>>({})
  const [snapshots, setSnapshots] = useState<Record<string, string>>({})
  const [modifiedTabs, setModifiedTabs] = useState<Set<string>>(new Set())

  const [isDragging, setIsDragging] = useState(false)
  const [rootName, setRootName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())
  const [font, setFont] = useState<FontOption>(() => getStoredFont())
  const [contentWidth, setContentWidth] = useState<WidthOption>(() => getStoredWidth())
  const [scale, setScale] = useState<ScaleOption>(() => getStoredScale())
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [chatWidth, setChatWidth] = useState(() => {
    try { return Number(localStorage.getItem('readown.chatWidth')) || 380 } catch { return 380 }
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatDraft, setChatDraft] = useState<string | null>(null)
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
  }, [])

  const handlePreviewFocus = useCallback(() => {}, [])

  const openFile = useCallback(
    (path: string) => {
      setError(null)
      setActivePath(path)
      setTabs((prev) => (prev.includes(path) ? prev : [...prev, path]))
    },
    []
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
      if (nodes.length === 0) {
        setError('No Markdown files found in this directory. Please select another one.')
        return
      }
      setTree(nodes)
      setRootName(nodes[0]?.relativePath.split('/')[0] ?? 'Directory')
      setTabs([])
      setActivePath(null)
      setContents({})
      setError(null)

      const rootPath = nodes[0]?.path.slice(0, nodes[0].path.length - nodes[0].relativePath.length).replace(/[/\\]$/, '')
      setDirPath(rootPath || null)
      if (rootPath && api.watchDirectory) {
        void api.watchDirectory(rootPath)
      }

      const filePaths = collectFilePaths(nodes)
      if (filePaths.length === 1) {
        openFile(filePaths[0])
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setOpeningDir(false)
    }
  }, [api, openFile])

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

      if (e.key.toLowerCase() === 'r') {
        e.preventDefault()
        if (e.shiftKey) {
          for (const path of tabs) reloadTab(path)
        } else {
          if (activePath) reloadTab(activePath)
        }
        return
      }

      if (e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void handleOpen()
        return
      }

      if (e.shiftKey) return

      if (e.key.toLowerCase() === 'w') {
        e.preventDefault()
        closeActiveTabRef.current()
        return
      }
      if (e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
        return
      }
      if (e.key === '.') {
        e.preventDefault()
        setChatOpen((prev) => !prev)
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
  }, [tabs, handleOpen, activePath, setActivePathAndCheckModified, reloadTab])

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
        if (nodes.length === 0) {
          const isDropped = typeof source === 'string' && selectPath === undefined
          setError(
            isDropped
              ? 'No Markdown files found in this directory. Please drop another one.'
              : 'No Markdown files found in this directory. Please select another one.'
          )
          return
        }
        setTree(nodes)
        const rootDir = typeof source === 'string'
          ? source
          : (nodes[0]?.path.slice(0, nodes[0].path.length - nodes[0].relativePath.length).replace(/[/\\]$/, '') || null)
        setDirPath(rootDir)
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
        if (typeof source === 'string' && api.watchDirectory) {
          void api.watchDirectory(source)
        }
        if (selectPath) {
          openFile(selectPath)
        } else {
          const filePaths = collectFilePaths(nodes)
          if (filePaths.length === 1) {
            openFile(filePaths[0])
          }
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

  useEffect(() => {
    if (!api.onDirectoryChange) return
    const unsubscribe = api.onDirectoryChange((changedPath) => {
      if (changedPath === dirPath) {
        void (async () => {
          try {
            const nodes = await api.loadDirectory(changedPath)
            setTree(nodes)
            setRootName(nodes[0]?.relativePath.split('/')[0] ?? changedPath.split('/').pop() ?? 'Directory')
          } catch {
            // ignore reload errors
          }
        })()
      }
    })
    return () => unsubscribe()
  }, [api, dirPath])

  useEffect(() => {
    return () => {
      if (api.watchDirectory) {
        void api.watchDirectory(null)
      }
    }
  }, [api])

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

  const dragCountRef = useRef(0)

  const isFileDrag = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isFileDrag(e)) return
    if (dragCountRef.current === 0) setIsDragging(true)
    dragCountRef.current++
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (dragCountRef.current === 0) return
    dragCountRef.current--
    if (dragCountRef.current <= 0) {
      dragCountRef.current = 0
      setIsDragging(false)
    }
  }

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCountRef.current = 0
    setIsDragging(false)
    if (!isFileDrag(e)) return
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
      onDragEnter={onDragEnter}
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
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setChatOpen((v) => !v)} title="Toggle chat (⌘.)" className="shrink-0">
              <MessageSquare className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleOpen} disabled={openingDir} title="Open directory" className="shrink-0">
              <FolderOpen className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {error && (
          <div className="mx-3 mt-3 flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <span className="flex-1">{error}</span>
            <button
              onClick={() => setError(null)}
              className="-my-1 -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md leading-none hover:bg-destructive/10 hover:text-destructive/80 focus:outline-none"
              aria-label="Dismiss error"
              title="Dismiss"
            >
              ×
            </button>
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
                <p className="text-sm font-medium">No directory open</p>
                <p className="max-w-[220px] text-xs text-muted-foreground">Drop a directory here to start.</p>
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
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <MarkdownPreview
              content={activePath ? contents[activePath] ?? '' : ''}
              filePath={activePath}
              contentWidth={contentWidth.value}
              onOpenRelative={handleOpenRelative}
              onFocus={handlePreviewFocus}
              onAskAI={(text) => { setChatOpen(true); setChatDraft(text) }}
            />
          </div>
          <ChatPanel
            open={chatOpen}
            onClose={() => setChatOpen(false)}
            filePath={activePath}
            fileContent={activePath ? contents[activePath] ?? '' : ''}
            width={chatWidth}
            onResize={(w) => {
              setChatWidth(w)
              try { localStorage.setItem('readown.chatWidth', String(w)) } catch { /* ignore */ }
            }}
            draftInput={chatDraft}
            onDraftConsumed={() => setChatDraft(null)}
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

    </div>
  )
}
