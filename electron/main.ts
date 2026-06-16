import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron'
import { readFile, readdir, stat, writeFile, rename, rm } from 'fs/promises'
import { watch } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, relative } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const isDev = !app.isPackaged

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.exit(0)
}

function createWindow(openFilePath?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  })

  if (isDev) {
    const url = new URL('http://localhost:3000')
    if (openFilePath) url.searchParams.set('openFile', openFilePath)
    win.loadURL(url.toString())
  } else {
    const opts: Electron.LoadFileOptions = {}
    if (openFilePath) opts.query = { openFile: openFilePath }
    win.loadFile(join(__dirname, '../../dist/index.html'), opts)
      .catch((err) => {
        console.error('Failed to load index.html:', err)
        dialog.showErrorBox('Load Error', `Failed to load app: ${err.message}`)
      })
  }

  win.webContents.on('before-input-event', (event, input) => {
    if (input.meta && input.key.toLowerCase() === 'n') {
      event.preventDefault()
      createWindow()
      return
    }
  })

  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault()
      import('electron').then(({ shell }) => shell.openExternal(url))
    }
  })

  return win
}

function setupMenu(): void {
  const isMac = process.platform === 'darwin'
  const send = (channel: string) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    win?.webContents.send(channel)
  }

  const settingsItem: MenuItemConstructorOptions = {
    label: 'Settings…',
    accelerator: 'CmdOrCtrl+,',
    click: () => send('menu-open-settings'),
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              settingsItem,
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => send('menu-open-directory'),
        },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => createWindow(),
        },
        { type: 'separator' },
        { label: 'Close Tab', click: () => send('close-current-tab') },
        ...(isMac
          ? []
          : [
              { type: 'separator' as const },
              settingsItem,
              { type: 'separator' as const },
              { role: 'quit' as const },
            ]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload', accelerator: '', visible: false },
        { role: 'forceReload', accelerator: '', visible: false },
        { role: 'toggleDevTools', accelerator: 'Alt+CmdOrCtrl+I' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' as const }, { role: 'front' as const }]
          : []),
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

const pendingOpenFiles: string[] = []

app.on('open-file', (_event, path) => {
  if (!app.isReady()) {
    pendingOpenFiles.push(path)
    return
  }
  createWindow(path)
})

app.on('second-instance', () => {
  const wins = BrowserWindow.getAllWindows()
  if (wins.length > 0) {
    const win = wins[0]
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.show()
    win.focus()
  }
})

app.whenReady().then(() => {
  setupMenu()

  if (pendingOpenFiles.length > 0) {
    for (const filePath of pendingOpenFiles) {
      createWindow(filePath)
    }
    pendingOpenFiles.length = 0
  } else {
    createWindow()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

interface TreeNode {
  name: string
  path: string
  relativePath: string
  type: 'file' | 'directory'
  children?: TreeNode[]
}

const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '.DS_Store'])
const MAX_FILES = 500

interface DirQueueItem {
  dirPath: string
  parentNode?: TreeNode & { children: TreeNode[] }
}

async function scanDirectory(dirPath: string, basePath: string): Promise<TreeNode[]> {
  const rootNodes: TreeNode[] = []
  let visitedFiles = 0

  const processEntries = async (currentDir: string, targetNodes: TreeNode[]) => {
    const entries = await readdir(currentDir, { withFileTypes: true })
    const childDirs: { entry: typeof entries[number]; rel: string }[] = []

    for (const entry of entries) {
      if (EXCLUDED_DIRS.has(entry.name)) continue

      const fullPath = join(currentDir, entry.name)
      const rel = relative(basePath, fullPath)

      if (entry.isDirectory()) {
        childDirs.push({ entry, rel })
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        if (visitedFiles < MAX_FILES) {
          visitedFiles++
          targetNodes.push({
            name: entry.name,
            path: fullPath,
            relativePath: rel,
            type: 'file',
          })
        }
      }
    }

    const dirNodes: (TreeNode & { children: TreeNode[] })[] = []
    for (const { entry, rel } of childDirs) {
      const dirNode: TreeNode & { children: TreeNode[] } = {
        name: entry.name,
        path: join(currentDir, entry.name),
        relativePath: rel,
        type: 'directory',
        children: [],
      }
      targetNodes.push(dirNode)
      dirNodes.push(dirNode)
    }

    return dirNodes
  }

  const firstLevel = await processEntries(dirPath, rootNodes)
  const queue: DirQueueItem[] = firstLevel.map((node) => ({ dirPath: node.path, parentNode: node }))

  while (queue.length > 0) {
    const batch = queue.splice(0, queue.length)
    await Promise.all(
      batch.map(async (item) => {
        const children = await processEntries(item.dirPath, item.parentNode!.children)
        for (const child of children) {
          queue.push({ dirPath: child.path, parentNode: child })
        }
      })
    )
  }

  const pruneEmpty = (nodes: TreeNode[]): TreeNode[] => {
    const kept: TreeNode[] = []
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

  const sortNodes = (nodes: TreeNode[]) => {
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

ipcMain.on('close-window', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.handle('open-directory', async (): Promise<TreeNode[] | null> => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const rootPath = result.filePaths[0]
  return scanDirectory(rootPath, rootPath)
})

ipcMain.handle(
  'scan-directory',
  async (_event: IpcMainInvokeEvent, dirPath: string): Promise<TreeNode[]> => {
    return scanDirectory(dirPath, dirPath)
  }
)

ipcMain.handle(
  'read-file',
  async (_event: IpcMainInvokeEvent, filePath: string): Promise<string> => {
    return readFile(filePath, 'utf-8')
  }
)

ipcMain.handle(
  'is-directory',
  async (_event: IpcMainInvokeEvent, filePath: string): Promise<boolean> => {
    try {
      const info = await stat(filePath)
      return info.isDirectory()
    } catch {
      return false
    }
  }
)

ipcMain.handle(
  'write-file',
  async (_event: IpcMainInvokeEvent, filePath: string, content: string): Promise<void> => {
    await writeFile(filePath, content, 'utf-8')
  }
)

ipcMain.handle(
  'rename-path',
  async (_event: IpcMainInvokeEvent, oldPath: string, newName: string): Promise<{ success: boolean; newPath?: string; error?: string }> => {
    try {
      const parentDir = dirname(oldPath)
      const newPath = join(parentDir, newName)
      await rename(oldPath, newPath)
      return { success: true, newPath }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }
)

ipcMain.handle(
  'delete-path',
  async (_event: IpcMainInvokeEvent, targetPath: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const info = await stat(targetPath)
      if (info.isDirectory()) {
        await rm(targetPath, { recursive: true, force: true })
      } else {
        await rm(targetPath, { force: true })
      }
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  }
)

let currentWatcher: ReturnType<typeof watch> | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function stopWatching() {
  if (currentWatcher) {
    currentWatcher.close()
    currentWatcher = null
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

ipcMain.handle(
  'watch-directory',
  (_event: IpcMainInvokeEvent, dirPath: string | null): void => {
    stopWatching()
    if (!dirPath) return
    try {
      currentWatcher = watch(dirPath, { recursive: true }, () => {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
          if (win) {
            win.webContents.send('directory-changed', dirPath)
          }
        }, 300)
      })
    } catch {
      stopWatching()
    }
  }
)
