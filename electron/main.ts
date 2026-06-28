import { app, BrowserWindow, Menu, dialog, ipcMain, shell, screen } from 'electron'
import type { IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron'
import { readFile, readdir, stat, writeFile, rename, rm } from 'fs/promises'
import chokidar from 'chokidar'
import type { FSWatcher } from 'chokidar'
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
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const win = new BrowserWindow({
    width,
    height,
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
      shell.openExternal(url)
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
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle' as const },
              { role: 'delete' as const },
              { role: 'selectAll' as const },
            ]
          : [
              { role: 'delete' as const },
              { type: 'separator' as const },
              { role: 'selectAll' as const },
            ]),
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => send('menu-find-in-page'),
        },
      ],
    },
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
const PROBE_MAX_DEPTH = 12
const PROBE_BUDGET = 2000

function isSupportedFile(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.md') || lower.endsWith('.csv')
}

async function hasMarkdownWithin(dirPath: string, depth: number, budget: { left: number }): Promise<boolean> {
  if (budget.left <= 0 || depth > PROBE_MAX_DEPTH) return true
  budget.left--
  let entries
  try {
    entries = await readdir(dirPath, { withFileTypes: true })
  } catch {
    return false
  }
  const subdirs: string[] = []
  for (const e of entries) {
    if (EXCLUDED_DIRS.has(e.name)) continue
    if (e.isFile() && isSupportedFile(e.name)) return true
    if (e.isDirectory()) subdirs.push(join(dirPath, e.name))
  }
  for (const sd of subdirs) {
    if (budget.left <= 0) return true
    if (await hasMarkdownWithin(sd, depth + 1, budget)) return true
  }
  return false
}

async function scanLevel(dirPath: string, basePath: string): Promise<TreeNode[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const nodes: TreeNode[] = []
  const budget = { left: PROBE_BUDGET }

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue
    const fullPath = join(dirPath, entry.name)
    const rel = relative(basePath, fullPath)
    if (entry.isDirectory()) {
      if (await hasMarkdownWithin(fullPath, 1, budget)) {
        nodes.push({ name: entry.name, path: fullPath, relativePath: rel, type: 'directory' })
      }
    } else if (entry.isFile() && isSupportedFile(entry.name)) {
      nodes.push({ name: entry.name, path: fullPath, relativePath: rel, type: 'file' })
    }
  }

  nodes.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name)
    return a.type === 'directory' ? -1 : 1
  })

  return nodes
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
  return scanLevel(rootPath, rootPath)
})

ipcMain.handle(
  'scan-directory',
  async (_event: IpcMainInvokeEvent, dirPath: string): Promise<TreeNode[]> => {
    return scanLevel(dirPath, dirPath)
  }
)

ipcMain.handle(
  'scan-children',
  async (_event: IpcMainInvokeEvent, dirPath: string, basePath: string): Promise<TreeNode[]> => {
    return scanLevel(dirPath, basePath)
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

ipcMain.handle(
  'open-local-link',
  async (_event: IpcMainInvokeEvent, filePath: string): Promise<void> => {
    await shell.openPath(filePath)
  }
)

const watchers = new Map<string, FSWatcher>()
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleNotify(dirPath: string) {
  const existing = debounceTimers.get(dirPath)
  if (existing) clearTimeout(existing)
  debounceTimers.set(dirPath, setTimeout(() => {
    debounceTimers.delete(dirPath)
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    win?.webContents.send('directory-changed', dirPath)
  }, 300))
}

function addDirWatcher(dirPath: string) {
  if (watchers.has(dirPath)) return
  try {
    const w = chokidar.watch(dirPath, {
      ignoreInitial: true,
      ignored: /(^|[/\\])(\.git|node_modules|\.DS_Store)/,
      persistent: true,
      depth: 0,
    })
    w.on('all', () => scheduleNotify(dirPath))
    watchers.set(dirPath, w)
  } catch { /* ignore */ }
}

function clearAllWatchers() {
  for (const [p, w] of watchers) {
    void w.close()
    const t = debounceTimers.get(p)
    if (t) { clearTimeout(t); debounceTimers.delete(p) }
  }
  watchers.clear()
}

ipcMain.handle(
  'set-watched-dirs',
  (_event: IpcMainInvokeEvent, paths: string[]): void => {
    const next = new Set(paths)
    for (const [p, w] of watchers) {
      if (!next.has(p)) {
        void w.close()
        watchers.delete(p)
        const t = debounceTimers.get(p)
        if (t) { clearTimeout(t); debounceTimers.delete(p) }
      }
    }
    for (const p of paths) addDirWatcher(p)
  }
)

app.on('before-quit', clearAllWatchers)
