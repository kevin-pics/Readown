import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileNode } from '@/types/electron'
import { ChatPanel } from '@/components/ChatPanel'
import { FileTree } from '@/components/FileTree'
import { MarkdownPreview } from '@/components/MarkdownPreview'
import { MarkdownEditor } from '@/components/MarkdownEditor'
import { TableViewer } from '@/components/TableViewer'
import { TabBar } from '@/components/TabBar'
import { SettingsDialog } from '@/components/SettingsDialog'
import { ConfirmCloseDialog } from '@/components/ConfirmCloseDialog'
import { SaveDialog } from '@/components/SaveDialog'
import { RenameDialog } from '@/components/RenameDialog'
import { DeleteDialog } from '@/components/DeleteDialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { hashString, isCsvPath, resolveRelativePath } from '@/lib/utils'
import { BookOpen, FileText, Folder, FolderOpen, X } from 'lucide-react'
import { applyFont, applyScale, applyTheme, getStoredFont, getStoredFrontmatterExpanded, getStoredScale, getStoredTheme, getStoredWidth, storeFont, storeFrontmatterExpanded, storeScale, storeTheme, storeWidth, type FontOption, type ScaleOption, type Theme, type WidthOption } from '@/lib/theme'
import { Button } from '@/components/ui/button'
import { getStoredChatModels, type ChatModel } from '@/lib/chat'

interface DirectoryAPI {
  openDirectory: () => Promise<FileNode[] | null>
  loadDirectory: (source: string | FileSystemDirectoryHandle, selectPath?: string) => Promise<FileNode[]>
  loadChildren?: (dirPath: string, rootPath: string) => Promise<FileNode[]>
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, content: string) => Promise<void>
  renamePath?: (oldPath: string, newName: string) => Promise<{ success: boolean; newPath?: string; error?: string }>
  deletePath?: (targetPath: string) => Promise<{ success: boolean; error?: string }>
  onDragDrop: (callback: (source: string | FileSystemDirectoryHandle) => void) => () => void
  onDirectoryChange?: (callback: (dirPath: string) => void) => () => void
  setWatchedDirs?: (paths: string[]) => Promise<void>
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
    loadChildren: (dirPath, rootPath) => electronAPI.scanChildren(dirPath, rootPath),
    readFile: (path) => electronAPI.readFile(path),
    writeFile: (path, content) => electronAPI.writeFile(path, content),
    renamePath: electronAPI.renamePath ? (oldPath, newName) => electronAPI.renamePath!(oldPath, newName) : undefined,
    deletePath: electronAPI.deletePath ? (targetPath) => electronAPI.deletePath!(targetPath) : undefined,
    onDragDrop: (callback) =>
      electronAPI.onDragDrop((dirPath) => callback(dirPath)),
    onDirectoryChange: (callback) =>
      electronAPI.onDirectoryChange((dirPath) => callback(dirPath)),
    setWatchedDirs: (paths) => electronAPI.setWatchedDirs(paths),
  }
}

function createBrowserAPI(): DirectoryAPI {
  const fileHandles = new Map<string, FileSystemFileHandle>()
  const dirHandles = new Map<string, FileSystemDirectoryHandle>()
  const EXCLUDED = new Set(['.git', 'node_modules', '.DS_Store'])
  const PROBE_MAX_DEPTH = 12
  const PROBE_BUDGET = 2000

  function isSupportedFileName(name: string): boolean {
    const lower = name.toLowerCase()
    return lower.endsWith('.md') || lower.endsWith('.csv')
  }

  async function hasMarkdownWithin(handle: FileSystemDirectoryHandle, depth: number, budget: { left: number }): Promise<boolean> {
    if (budget.left <= 0 || depth > PROBE_MAX_DEPTH) return true
    budget.left--
    const subdirs: FileSystemDirectoryHandle[] = []
    try {
      for await (const entry of handle.values()) {
        if (EXCLUDED.has(entry.name)) continue
        if (entry.kind === 'file' && isSupportedFileName(entry.name)) return true
        if (entry.kind === 'directory') subdirs.push(entry as FileSystemDirectoryHandle)
      }
    } catch {
      return false
    }
    for (const sd of subdirs) {
      if (budget.left <= 0) return true
      if (await hasMarkdownWithin(sd, depth + 1, budget)) return true
    }
    return false
  }

  async function scanLevel(handle: FileSystemDirectoryHandle, basePath: string): Promise<FileNode[]> {
    const nodes: FileNode[] = []
    const budget = { left: PROBE_BUDGET }
    for await (const entry of handle.values()) {
      if (EXCLUDED.has(entry.name)) continue
      const rel = basePath ? `${basePath}/${entry.name}` : entry.name
      if (entry.kind === 'directory') {
        const dirHandle = entry as FileSystemDirectoryHandle
        dirHandles.set(rel, dirHandle)
        if (await hasMarkdownWithin(dirHandle, 1, budget)) {
          nodes.push({ name: entry.name, path: rel, relativePath: rel, type: 'directory' })
        }
      } else if (entry.kind === 'file' && isSupportedFileName(entry.name)) {
        fileHandles.set(rel, entry as FileSystemFileHandle)
        nodes.push({ name: entry.name, path: rel, relativePath: rel, type: 'file' })
      }
    }
    nodes.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name)
      return a.type === 'directory' ? -1 : 1
    })
    return nodes
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
        dirHandles.clear()
        fileHandles.clear()
        dirHandles.set('', handle)
        return await scanLevel(handle, '')
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
        dirHandles.clear()
        fileHandles.clear()
        dirHandles.set('', source)
        return scanLevel(source, '')
      }
      throw new Error('Browser directory API requires a FileSystemDirectoryHandle')
    },
    loadChildren: async (dirPath) => {
      const handle = dirHandles.get(dirPath)
      if (!handle) throw new Error(`Directory not found: ${dirPath}`)
      return scanLevel(handle, dirPath)
    },
    readFile: async (path) => {
      const handle = fileHandles.get(path)
      if (!handle) throw new Error(`File not found: ${path}`)
      const file = await handle.getFile()
      return file.text()
    },
    onDragDrop: () => () => {},
    writeFile: async () => {
      throw new Error('Saving files is not supported in browser mode. Please use the Electron app.')
    },
  }
}

function setNodeChildren(
  nodes: FileNode[],
  targetPath: string,
  updater: FileNode[] | ((old: FileNode[] | undefined) => FileNode[])
): FileNode[] {
  return nodes.map((n) => {
    if (n.path === targetPath) {
      const children = typeof updater === 'function' ? updater(n.children) : updater
      return { ...n, children }
    }
    if (n.type === 'directory' && n.children) return { ...n, children: setNodeChildren(n.children, targetPath, updater) }
    return n
  })
}

function mergeChildren(oldNodes: FileNode[] | undefined, fresh: FileNode[]): FileNode[] {
  const oldByPath = new Map((oldNodes ?? []).map((n) => [n.path, n]))
  return fresh.map((n) => {
    if (n.type === 'directory') {
      const prev = oldByPath.get(n.path)
      if (prev && prev.type === 'directory' && prev.children !== undefined) {
        return { ...n, children: prev.children }
      }
    }
    return n
  })
}

function collectLoadedDirs(nodes: FileNode[], acc: string[] = []): string[] {
  for (const n of nodes) {
    if (n.type === 'directory' && n.children !== undefined) {
      acc.push(n.path)
      collectLoadedDirs(n.children, acc)
    }
  }
  return acc
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

function fileExistsInTree(nodes: FileNode[], targetPath: string): boolean {
  for (const node of nodes) {
    if (node.type === 'file' && node.path === targetPath) return true
    if (node.children && fileExistsInTree(node.children, targetPath)) return true
  }
  return false
}

function isUntitledPath(path: string): boolean {
  return path.startsWith('__untitled__')
}

function computeDefaultSaveName(tree: FileNode[], dirPath: string | null): string {
  let n = 1
  while (true) {
    const name = `untitled-${n}.md`
    if (!dirPath || !fileExistsInTree(tree, `${dirPath}/${name}`)) break
    n++
  }
  return `untitled-${n}.md`
}

let untitledCounter = 0

export default function App() {
  const [api] = useState<DirectoryAPI>(() => {
    if (window.readownAPI) return adaptElectronAPI(window.readownAPI)
    return createBrowserAPI()
  })
  const [tree, setTree] = useState<FileNode[]>([])
  const [dirPath, setDirPath] = useState<string | null>(null)
  const [recentDirs, setRecentDirs] = useState<{ path: string; name: string }[]>(() => {
    try {
      const raw = localStorage.getItem('readown.recentDirs')
      return raw ? (JSON.parse(raw) as { path: string; name: string }[]) : []
    } catch { return [] }
  })
  const pushRecentDir = useCallback((path: string, name: string) => {
    setRecentDirs((prev) => {
      const next = [{ path, name }, ...prev.filter((d) => d.path !== path)].slice(0, 5)
      try { localStorage.setItem('readown.recentDirs', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])
  const removeRecentDir = useCallback((path: string) => {
    setRecentDirs((prev) => {
      const next = prev.filter((d) => d.path !== path)
      try { localStorage.setItem('readown.recentDirs', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])
  const [tabs, setTabs] = useState<string[]>([])
  const tabsRef = useRef(tabs)
  const [activePath, setActivePath] = useState<string | null>(null)
  const [contents, setContents] = useState<Record<string, string>>({})
  const contentsRef = useRef(contents)
  const dirPathRef = useRef(dirPath)
  useEffect(() => { tabsRef.current = tabs }, [tabs])
  useEffect(() => { contentsRef.current = contents }, [contents])
  useEffect(() => { dirPathRef.current = dirPath }, [dirPath])
  const [snapshots, setSnapshots] = useState<Record<string, string>>({})
  const [modifiedTabs, setModifiedTabs] = useState<Set<string>>(new Set())
  const [editingPaths, setEditingPaths] = useState<Set<string>>(new Set())
  const [unsavedChanges, setUnsavedChanges] = useState<Set<string>>(new Set())

  const [isDragging, setIsDragging] = useState(false)
  const [rootName, setRootName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme())
  const [font, setFont] = useState<FontOption>(() => getStoredFont())
  const [contentWidth, setContentWidth] = useState<WidthOption>(() => getStoredWidth())
  const [scale, setScale] = useState<ScaleOption>(() => getStoredScale())
  const [frontmatterExpanded, setFrontmatterExpanded] = useState<boolean>(() => getStoredFrontmatterExpanded())
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [chatWidth, setChatWidth] = useState(() => {
    try { return Number(localStorage.getItem('readown.chatWidth')) || 480 } catch { return 480 }
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(() => {
    try { return localStorage.getItem('readown.chatOpen') !== 'false' } catch { return true }
  })
  const [chatDraft, setChatDraft] = useState<string | null>(null)
  const [chatModels, setChatModels] = useState<ChatModel[]>(() => getStoredChatModels())
  const [openingDir, _setOpeningDir] = useState(false)
  const [saveDialogPath, setSaveDialogPath] = useState<string | null>(null)
  const [confirmClosePath, setConfirmClosePath] = useState<string | null>(null)
  const [renameNode, setRenameNode] = useState<FileNode | null>(null)
  const [deleteNode, setDeleteNode] = useState<FileNode | null>(null)
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchFocusTrigger, setSearchFocusTrigger] = useState(0)
  const previewScrollFractionsRef = useRef<Record<string, number>>({})

  // Close search when switching tabs
  useEffect(() => {
    setSearchVisible(false) // eslint-disable-line react-hooks/set-state-in-effect -- intentional: close search on tab switch
  }, [activePath])

  useEffect(() => {
    try { localStorage.setItem('readown.chatOpen', String(chatOpen)) } catch { /* ignore */ }
  }, [chatOpen])

  useEffect(() => {
    applyTheme(theme)
    applyFont(font)
    applyScale(scale)
  }, [])

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

  const handleFrontmatterExpandedChange = useCallback((value: boolean) => {
    setFrontmatterExpanded(value)
    storeFrontmatterExpanded(value)
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

  const createUntitledTab = useCallback(() => {
    untitledCounter++
    const path = `__untitled__${untitledCounter}`
    setTabs((prev) => [...prev, path])
    setContents((prev) => ({ ...prev, [path]: '' }))
    setEditingPaths((prev) => new Set(prev).add(path))
    setActivePath(path)
  }, [])

  const toggleEditMode = useCallback((path: string) => {
    setEditingPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  const handleEditorChange = useCallback((path: string, value: string) => {
    setContents((prev) => ({ ...prev, [path]: value }))
    setUnsavedChanges((prev) => new Set(prev).add(path))
  }, [])

  const saveFile = useCallback(async (path: string) => {
    if (isUntitledPath(path)) {
      setSaveDialogPath(path)
      return
    }
    const content = contents[path]
    if (content === undefined) return
    try {
      await api.writeFile(path, content)
      setSnapshots((prev) => ({ ...prev, [path]: hashString(content) }))
      setModifiedTabs((prev) => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })
      setUnsavedChanges((prev) => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })
    } catch (err) {
      setError(`Failed to save ${path.split(/[\\/]/).pop()}: ${(err as Error).message}`)
    }
  }, [api, contents])

  const refreshLevel = useCallback(async (targetDir: string) => {
    const root = dirPathRef.current
    if (!root) return
    try {
      const isRoot = targetDir === root
      const fresh = isRoot
        ? await api.loadDirectory(root)
        : (api.loadChildren ? await api.loadChildren(targetDir, root) : [])
      if (isRoot) {
        setTree((prev) => mergeChildren(prev, fresh))
      } else {
        setTree((prev) => setNodeChildren(prev, targetDir, (old) => mergeChildren(old, fresh)))
      }
    } catch {
      setError('The directory could not be reloaded. It may have been moved, renamed, or deleted. Please open it again.')
    }
  }, [api])
  const handleSaveAs = useCallback(async (name: string) => {
    const untitledPath = saveDialogPath
    if (!untitledPath) return
    if (!dirPath) {
      setError('Please open a directory first before saving.')
      setSaveDialogPath(null)
      return
    }
    setSaveDialogPath(null)

    const content = contents[untitledPath]
    if (content === undefined) return

    const fullPath = `${dirPath}/${name}`

    try {
      await api.writeFile(fullPath, content)

      await refreshLevel(dirPath)

      // Replace the untitled tab with the real file path
      const idx = tabs.indexOf(untitledPath)
      const nextTabs = [...tabs]
      if (idx >= 0) nextTabs[idx] = fullPath
      setTabs(nextTabs)

      const nextContents: Record<string, string> = {}
      for (const key of Object.keys(contents)) {
        nextContents[key === untitledPath ? fullPath : key] = contents[key]
      }
      nextContents[fullPath] = content
      setContents(nextContents)

      const nextSnapshots: Record<string, string> = {}
      for (const key of Object.keys(snapshots)) {
        nextSnapshots[key === untitledPath ? fullPath : key] = snapshots[key]
      }
      nextSnapshots[fullPath] = hashString(content)
      setSnapshots(nextSnapshots)

      setEditingPaths((prev) => {
        const next = new Set(prev)
        next.delete(untitledPath)
        return next
      })
      setUnsavedChanges((prev) => {
        const next = new Set(prev)
        next.delete(untitledPath)
        return next
      })
      setActivePath(fullPath)
    } catch (err) {
      setError(`Failed to save ${name}: ${(err as Error).message}`)
    }
  }, [saveDialogPath, dirPath, contents, tabs, api, snapshots, refreshLevel])

  const forceCloseTab = useCallback(
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
      setEditingPaths((prev) => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })
      setUnsavedChanges((prev) => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })
      if (activePath === path) {
        setActivePathAndCheckModified(next.length ? next[Math.min(idx, next.length - 1)] : null)
      }
    },
    [tabs, activePath, setActivePathAndCheckModified]
  )

  const handleRename = useCallback(async (newName: string) => {
    const node = renameNode
    if (!node || !api.renamePath) return
    setRenameNode(null)
    const result = await api.renamePath(node.path, newName)
    if (!result.success) {
      setError(`Failed to rename: ${result.error}`)
      return
    }
    const parentDir = node.path.substring(0, Math.max(node.path.lastIndexOf('/'), node.path.lastIndexOf('\\'))) || dirPath
    if (parentDir) {
      void refreshLevel(parentDir)
    }
    if (node.type === 'directory') {
      const oldPrefix = node.path + '/'
      const newPrefix = result.newPath! + '/'
      setTabs((prev) => prev.map((p) => p.startsWith(oldPrefix) ? newPrefix + p.slice(oldPrefix.length) : p))
      setContents((prev) => {
        const next: Record<string, string> = {}
        for (const key of Object.keys(prev)) {
          next[key.startsWith(oldPrefix) ? newPrefix + key.slice(oldPrefix.length) : key] = prev[key]
        }
        return next
      })
      setSnapshots((prev) => {
        const next: Record<string, string> = {}
        for (const key of Object.keys(prev)) {
          next[key.startsWith(oldPrefix) ? newPrefix + key.slice(oldPrefix.length) : key] = prev[key]
        }
        return next
      })
      setActivePath((prev) => prev && prev.startsWith(oldPrefix) ? newPrefix + prev.slice(oldPrefix.length) : prev)
    } else {
      const oldPath = node.path
      const newPath = result.newPath!
      setTabs((prev) => prev.map((p) => p === oldPath ? newPath : p))
      setContents((prev) => {
        const next: Record<string, string> = {}
        for (const key of Object.keys(prev)) {
          next[key === oldPath ? newPath : key] = prev[key]
        }
        return next
      })
      setSnapshots((prev) => {
        const next: Record<string, string> = {}
        for (const key of Object.keys(prev)) {
          next[key === oldPath ? newPath : key] = prev[key]
        }
        return next
      })
      setActivePath((prev) => prev === oldPath ? newPath : prev)
    }
  }, [renameNode, api, dirPath, refreshLevel])

  const handleDelete = useCallback(async () => {
    const node = deleteNode
    if (!node || !api.deletePath) return
    setDeleteNode(null)
    const result = await api.deletePath(node.path)
    if (!result.success) {
      setError(`Failed to delete: ${result.error}`)
      return
    }
    if (node.type === 'directory') {
      const deletedPrefix = node.path + '/'
      const tabsToClose = tabsRef.current.filter((p) => p.startsWith(deletedPrefix))
      for (const p of tabsToClose) {
        forceCloseTab(p)
      }
    } else {
      if (tabsRef.current.includes(node.path)) {
        forceCloseTab(node.path)
      }
    }
    const parentDir = node.path.substring(0, Math.max(node.path.lastIndexOf('/'), node.path.lastIndexOf('\\'))) || dirPath
    if (parentDir) {
      void refreshLevel(parentDir)
    }
  }, [deleteNode, api, dirPath, forceCloseTab, refreshLevel])

  const closeTab = useCallback(
    (path: string) => {
      if (unsavedChanges.has(path)) {
        setConfirmClosePath(path)
        return
      }
      forceCloseTab(path)
    },
    [unsavedChanges, forceCloseTab]
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
    if (!activePath || isUntitledPath(activePath) || contents[activePath] !== undefined) return
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
        if (isUntitledPath(path)) continue
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
      if (!resolved) return
      const lowerExt = resolved.toLowerCase()
      if (lowerExt.endsWith('.md') || lowerExt.endsWith('.markdown') || lowerExt.endsWith('.mdx') || lowerExt.endsWith('.csv')) {
        openFile(resolved)
      } else {
        window.readownAPI?.openLocalLink(resolved)
      }
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
      const untitledTabs = tabsRef.current.filter((p) => isUntitledPath(p))
      const untitledContents: Record<string, string> = {}
      for (const p of untitledTabs) {
        const c = contentsRef.current[p]
        if (c !== undefined) untitledContents[p] = c
      }
      setTabs(untitledTabs)
      setActivePath(untitledTabs.length > 0 ? untitledTabs[untitledTabs.length - 1] : null)
      setContents(untitledContents)
      setEditingPaths((prev) => {
        const next = new Set<string>()
        for (const p of untitledTabs) { if (prev.has(p)) next.add(p) }
        return next
      })
      setUnsavedChanges((prev) => {
        const next = new Set<string>()
        for (const p of untitledTabs) { if (prev.has(p)) next.add(p) }
        return next
      })
      setError(null)

      const rootPath = nodes[0]?.path.slice(0, nodes[0].path.length - nodes[0].relativePath.length).replace(/[/\\]$/, '')
      setDirPath(rootPath || null)
      if (rootPath) {
        setRootName(rootPath.split(/[\\/]/).pop() ?? 'Directory')
        pushRecentDir(rootPath, rootPath.split(/[\\/]/).pop() || 'Directory')
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
  }, [api, openFile, pushRecentDir])

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

      if (e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        // Save all unsaved non-untitled tabs (untitled needs a dialog)
        for (const path of tabs) {
          if (!isUntitledPath(path) && unsavedChanges.has(path)) {
            void saveFile(path)
          }
        }
        return
      }

      if (e.shiftKey) return

      if (e.key.toLowerCase() === 'f') {
        // Only show search bar in preview mode; Cmd+F in edit mode is ignored
        if (activePath && !editingPaths.has(activePath)) {
          e.preventDefault()
          if (searchVisible) {
            setSearchFocusTrigger((n) => n + 1)
          } else {
            setSearchVisible(true)
          }
        } else {
          e.preventDefault()
        }
        return
      }
      if (e.key.toLowerCase() === 'w') {
        e.preventDefault()
        closeActiveTabRef.current()
        return
      }
      if (e.key.toLowerCase() === 'e') {
        e.preventDefault()
        if (activePath) toggleEditMode(activePath)
        return
      }
      if (e.key.toLowerCase() === 't') {
        e.preventDefault()
        createUntitledTab()
        return
      }
      if (e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (activePath) {
          if (isUntitledPath(activePath)) {
            setSaveDialogPath(activePath)
          } else if (unsavedChanges.has(activePath)) {
            void saveFile(activePath)
          }
        }
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
  }, [tabs, handleOpen, activePath, setActivePathAndCheckModified, reloadTab, unsavedChanges, saveFile, toggleEditMode, createUntitledTab, forceCloseTab, editingPaths, searchVisible])

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
          (typeof source === 'string' ? source : source.name).split(/[\\/]/).pop() ?? 'Directory'
        )
        if (typeof source === 'string' && rootDir && selectPath === undefined) {
          pushRecentDir(rootDir, rootDir.split(/[\\/]/).pop() || 'Directory')
        }
        const untitledTabs = tabsRef.current.filter((p) => isUntitledPath(p))
        const untitledContents: Record<string, string> = {}
        for (const p of untitledTabs) {
          const c = contentsRef.current[p]
          if (c !== undefined) untitledContents[p] = c
        }
        setTabs(untitledTabs)
        setActivePath(untitledTabs.length > 0 ? untitledTabs[untitledTabs.length - 1] : null)
        setContents(untitledContents)
        setEditingPaths((prev) => {
          const next = new Set<string>()
          for (const p of untitledTabs) { if (prev.has(p)) next.add(p) }
          return next
        })
        setUnsavedChanges((prev) => {
          const next = new Set<string>()
          for (const p of untitledTabs) { if (prev.has(p)) next.add(p) }
          return next
        })
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
    [api, openFile, pushRecentDir]
  )

  const handleLoadChildren = useCallback(async (node: FileNode) => {
    const root = dirPathRef.current
    if (!api.loadChildren || !root) return
    try {
      const children = await api.loadChildren(node.path, root)
      setTree((prev) => setNodeChildren(prev, node.path, () => children))
    } catch {
      // silently ignore; the folder will show as empty
    }
  }, [api])

  useEffect(() => {
    if (!api.setWatchedDirs || !dirPath) return
    const dirs = [dirPath, ...collectLoadedDirs(tree)]
    void api.setWatchedDirs(dirs)
  }, [api, tree, dirPath])

  useEffect(() => {
    const unsubscribe = api.onDragDrop((source) => {
      loadDirectory(source)
    })
    return () => unsubscribe()
  }, [api, loadDirectory])

  useEffect(() => {
    if (!window.readownAPI) return
    const params = new URLSearchParams(window.location.search)
    const openFile = params.get('openFile')
    if (openFile) {
      window.history.replaceState({}, '', window.location.pathname)
      void (async () => {
        try {
          const isDir = await window.readownAPI.isDirectory(openFile)
          if (isDir) {
            loadDirectory(openFile)
          } else if (openFile.toLowerCase().endsWith('.md') || openFile.toLowerCase().endsWith('.csv')) {
            const parentDir = openFile.substring(0, Math.max(openFile.lastIndexOf('/'), openFile.lastIndexOf('\\')))
            if (parentDir) {
              loadDirectory(parentDir, openFile)
            }
          }
        } catch (err) {
          setError((err as Error).message)
        }
      })()
    }
  }, [loadDirectory])

  useEffect(() => {
    if (!api.onDirectoryChange) return
    const unsubscribe = api.onDirectoryChange((changedPath) => {
      void refreshLevel(changedPath)
    })
    return () => unsubscribe()
  }, [api, refreshLevel])

  useEffect(() => {
    return () => {
      void api.setWatchedDirs?.([])
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
      electron.onFindInPage?.(() => {
        if (activePath && !editingPaths.has(activePath)) {
          if (searchVisible) {
            setSearchFocusTrigger((n) => n + 1)
          } else {
            setSearchVisible(true)
          }
        }
      }),
    ]
    return () => unsubs.forEach((unsub) => unsub?.())
  }, [handleOpen, activePath, editingPaths, searchVisible])

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
      if (droppedPath.toLowerCase().endsWith('.md') || droppedPath.toLowerCase().endsWith('.csv')) {
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
            <FileTree nodes={tree} selectedPath={activePath} onSelect={openFile} onLoadChildren={api.loadChildren ? handleLoadChildren : undefined} onRename={api.renamePath ? (node) => setRenameNode(node) : undefined} onDelete={api.deletePath ? (node) => setDeleteNode(node) : undefined} />
          ) : (
            <>
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
              {!dirPath && recentDirs.length > 0 && (
                <div className="border-t px-2 py-2">
                  <p className="px-1 pb-1.5 text-xs font-semibold tracking-wide text-foreground">Recents</p>
                  {recentDirs.map((item) => (
                    <div
                      key={item.path}
                      className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-accent"
                    >
                      <button
                        onClick={() => void loadDirectory(item.path)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        title={item.path}
                      >
                        <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                        <span className="truncate text-muted-foreground">{item.name}</span>
                      </button>
                      <button
                        onClick={() => removeRecentDir(item.path)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                        title="Remove from recents"
                        aria-label="Remove from recents"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
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
        <TabBar tabs={tabs} activePath={activePath} modifiedPaths={modifiedTabs} unsavedPaths={unsavedChanges} editingPaths={editingPaths} onActivate={setActivePathAndCheckModified} onClose={closeTab} />
        <div className="flex flex-1 overflow-hidden">
          <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
            {activePath && isCsvPath(activePath) && !editingPaths.has(activePath) ? (
              <TableViewer
                key={activePath}
                content={contents[activePath] ?? ''}
                filePath={activePath}
                contentWidth={contentWidth.value}
                onToggleEdit={() => toggleEditMode(activePath)}
                onToggleChat={() => setChatOpen((v) => !v)}
              />
            ) : activePath && editingPaths.has(activePath) ? (
              <MarkdownEditor
                key={activePath}
                content={contents[activePath] ?? ''}
                filePath={activePath}
                contentWidth={contentWidth.value}
                onChange={(value) => handleEditorChange(activePath, value)}
                onSave={() => void saveFile(activePath)}
                onToggleEdit={() => toggleEditMode(activePath)}
                onToggleChat={() => setChatOpen((v) => !v)}
                initialScrollFraction={previewScrollFractionsRef.current[activePath]}
                onScrollFractionChange={(fraction) => { previewScrollFractionsRef.current[activePath] = fraction }}
              />
            ) : activePath ? (
              <MarkdownPreview
                content={contents[activePath] ?? ''}
                filePath={activePath}
                contentWidth={contentWidth.value}
                onOpenRelative={handleOpenRelative}
                onFocus={handlePreviewFocus}
                onAskAI={(text) => { setChatOpen(true); setChatDraft(text) }}
                onToggleEdit={() => toggleEditMode(activePath)}
                onToggleChat={() => setChatOpen((v) => !v)}
                isEditing={false}
                searchVisible={searchVisible}
                onSearchClose={() => setSearchVisible(false)}
                searchFocusTrigger={searchFocusTrigger}
                onScrollFractionChange={(fraction) => { previewScrollFractionsRef.current[activePath] = fraction }}
                initialScrollFraction={previewScrollFractionsRef.current[activePath]}
                frontmatterExpanded={frontmatterExpanded}
              />
            ) : null}
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
            models={chatModels}
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
        frontmatterExpanded={frontmatterExpanded}
        onFrontmatterExpandedChange={handleFrontmatterExpandedChange}
        models={chatModels}
        onModelsChange={setChatModels}
      />

      <ConfirmCloseDialog
        open={confirmClosePath !== null}
        fileName={confirmClosePath ? (isUntitledPath(confirmClosePath) ? 'Untitled' : (confirmClosePath.split(/[\\/]/).pop() ?? confirmClosePath)) : ''}
        onSave={() => {
          const path = confirmClosePath
          setConfirmClosePath(null)
          if (!path) return
          if (isUntitledPath(path)) {
            setSaveDialogPath(path)
          } else {
            void saveFile(path).then(() => forceCloseTab(path))
          }
        }}
        onDiscard={() => {
          const path = confirmClosePath
          setConfirmClosePath(null)
          if (path) forceCloseTab(path)
        }}
        onCancel={() => setConfirmClosePath(null)}
      />

      <SaveDialog
        open={saveDialogPath !== null}
        defaultName={computeDefaultSaveName(tree, dirPath)}
        fileExists={(name) => !!(dirPath && fileExistsInTree(tree, `${dirPath}/${name}`))}
        onSave={handleSaveAs}
        onCancel={() => setSaveDialogPath(null)}
      />

      <RenameDialog
        open={renameNode !== null}
        currentName={renameNode?.name ?? ''}
        isFile={renameNode?.type === 'file'}
        onRename={handleRename}
        onCancel={() => setRenameNode(null)}
      />

      <DeleteDialog
        open={deleteNode !== null}
        itemName={deleteNode?.name ?? ''}
        isDirectory={deleteNode?.type === 'directory'}
        onDelete={handleDelete}
        onCancel={() => setDeleteNode(null)}
      />

    </div>
  )
}
