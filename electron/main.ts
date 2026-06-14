import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron'
import type { IpcMainInvokeEvent, MenuItemConstructorOptions } from 'electron'
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
          label: 'Open Directory…',
          click: () => send('menu-open-directory'),
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
    { role: 'viewMenu' },
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

app.whenReady().then(() => {
  setupMenu()
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
