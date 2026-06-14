import { useCallback, useEffect, useState } from 'react'
import type { FileNode } from '@/types/electron'
import { FileTree } from '@/components/FileTree'
import { MarkdownPreview } from '@/components/MarkdownPreview'
import { SettingsDialog } from '@/components/SettingsDialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { BookOpen, FileText, Folder, FolderOpen } from 'lucide-react'
import { applyTheme, getThemeById, defaultThemeId, type Theme } from '@/lib/theme'

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

  async function scanHandle(
    handle: FileSystemDirectoryHandle,
    basePath: string = ''
  ): Promise<FileNode[]> {
    const nodes: FileNode[] = []
    const entries: FileSystemHandle[] = []
    for await (const entry of handle.values()) {
      entries.push(entry)
    }

    for (const entry of entries) {
      if (EXCLUDED.has(entry.name)) continue

      const rel = basePath ? `${basePath}/${entry.name}` : entry.name

      if (entry.kind === 'directory') {
        const children = await scanHandle(entry as FileSystemDirectoryHandle, rel)
        nodes.push({
          name: entry.name,
          path: rel,
          relativePath: rel,
          type: 'directory',
          children,
        })
      } else if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.md')) {
        fileHandles.set(rel, entry as FileSystemFileHandle)
        nodes.push({
          name: entry.name,
          path: rel,
          relativePath: rel,
          type: 'file',
        })
      }
    }

    return nodes.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name)
      return a.type === 'directory' ? -1 : 1
    })
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
        if ((err as Error).name === 'AbortError') return null
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
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [rootName, setRootName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(() => getThemeById(defaultThemeId))
  const [sidebarWidth, setSidebarWidth] = useState(229)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidth
    const MIN_W = 160
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
    async (source: string | FileSystemDirectoryHandle) => {
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
        setSelectedPath(null)
        setContent('')
      } catch (err) {
        setError((err as Error).message)
      }
    },
    [api]
  )

  useEffect(() => {
    const unsubscribe = api.onDragDrop((source) => {
      loadDirectory(source)
    })
    return () => unsubscribe()
  }, [api, loadDirectory])

  const handleOpen = async () => {
    try {
      const nodes = await api.openDirectory()
      if (!nodes) return
      setTree(nodes)
      setRootName(nodes[0]?.relativePath.split('/')[0] ?? 'Directory')
      setSelectedPath(null)
      setContent('')
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleSelect = async (path: string) => {
    setSelectedPath(path)
    try {
      const text = await api.readFile(path)
      setContent(text)
    } catch (err) {
      setError((err as Error).message)
      setContent('')
    }
  }

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme)
    applyTheme(newTheme)
  }

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
      className={cn(
        'flex h-full w-full overflow-hidden bg-background text-foreground',
        isDragging && 'ring-2 ring-primary ring-inset'
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <aside
        className="flex shrink-0 flex-col border-r bg-card"
        style={{ width: `${sidebarWidth}px` }}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
              <BookOpen className="h-4 w-4" />
            </div>
            <div className="flex flex-col overflow-hidden">
              <h1 className="text-sm font-semibold leading-tight">Readown</h1>
              <span className="max-w-[100px] truncate text-xs text-muted-foreground">
                {rootName ?? 'Markdown reader'}
              </span>
            </div>
          </div>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={handleOpen} title="Open directory" className="shrink-0">
              <FolderOpen className="h-4 w-4" />
            </Button>
            <div className="shrink-0">
              <SettingsDialog currentTheme={theme} onThemeChange={handleThemeChange} />
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-3 mt-3 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <ScrollArea className="flex-1">
          {!isEmpty ? (
            <FileTree nodes={tree} selectedPath={selectedPath} onSelect={handleSelect} />
          ) : (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-4 px-6 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                {rootName ? (
                  <FileText className="h-8 w-8 text-muted-foreground" />
                ) : (
                  <FolderOpen className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {rootName ? 'No Markdown files found' : 'No directory open'}
                </p>
                <p className="max-w-[220px] text-xs text-muted-foreground">
                  {rootName
                    ? `No .md files were found in ${rootName}.`
                    : 'Drop a directory here, or use the folder icon above to open one.'}
                </p>
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

      <main className="relative flex-1 overflow-hidden bg-background">
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-primary/10">
            <div className="rounded-xl border-2 border-dashed border-primary bg-background/80 px-10 py-8 text-center shadow-lg backdrop-blur">
              <Folder className="mx-auto mb-3 h-10 w-10 text-primary" />
              <p className="text-lg font-medium text-primary">Drop directory here</p>
              <p className="text-sm text-muted-foreground">to load Markdown files</p>
            </div>
          </div>
        )}
        <MarkdownPreview content={content} filePath={selectedPath} />
      </main>
    </div>
  )
}
