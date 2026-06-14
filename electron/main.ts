import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { readFile, readdir } from 'fs/promises'
import { fileURLToPath } from 'url'
import { dirname, join, relative } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const isDev = !app.isPackaged

function createWindow(): BrowserWindow {
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
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../../dist/index.html'))
      .catch((err) => {
        console.error('Failed to load index.html:', err)
        dialog.showErrorBox('Load Error', `Failed to load app: ${err.message}`)
      })
    win.webContents.openDevTools({ mode: 'detach' })
  }

  win.webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' &&
      (input.meta || input.control) &&
      !input.alt &&
      input.key.toLowerCase() === 'w'
    ) {
      event.preventDefault()
      win.webContents.send('close-current-tab')
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

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('open-file', (_event, path) => {
    const win = BrowserWindow.getFocusedWindow()
    if (win && path) win.webContents.send('drag-drop-directory', path)
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

async function scanDirectory(dirPath: string, basePath: string): Promise<TreeNode[]> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  const nodes: TreeNode[] = []

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) continue

    const fullPath = join(dirPath, entry.name)
    const rel = relative(basePath, fullPath)

    if (entry.isDirectory()) {
      const children = await scanDirectory(fullPath, basePath)
      nodes.push({
        name: entry.name,
        path: fullPath,
        relativePath: rel,
        type: 'directory',
        children,
      })
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      nodes.push({
        name: entry.name,
        path: fullPath,
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
