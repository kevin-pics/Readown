import { contextBridge, ipcRenderer, webUtils } from 'electron'

export interface FileNode {
  name: string
  path: string
  relativePath: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

export interface ReadownAPI {
  openDirectory: () => Promise<FileNode[] | null>
  scanDirectory: (dirPath: string) => Promise<FileNode[]>
  readFile: (filePath: string) => Promise<string>
  onDragDrop: (callback: (dirPath: string) => void) => () => void
  onCloseTab: (callback: () => void) => () => void
  onOpenDirectory: (callback: () => void) => () => void
  onOpenSettings: (callback: () => void) => () => void
  onFindInPage: (callback: () => void) => () => void
  onDirectoryChange: (callback: (dirPath: string) => void) => () => void
  closeWindow: () => void
  isDirectory: (filePath: string) => Promise<boolean>
  watchDirectory: (dirPath: string | null) => Promise<void>
  getPathForFile: (file: File) => string
  writeFile: (filePath: string, content: string) => Promise<void>
  renamePath: (oldPath: string, newName: string) => Promise<{ success: boolean; newPath?: string; error?: string }>
  deletePath: (targetPath: string) => Promise<{ success: boolean; error?: string }>
  openLocalLink: (filePath: string) => Promise<void>
}

function onChannel(channel: string, callback: () => void) {
  const handler = () => callback()
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: ReadownAPI = {
  openDirectory: () => ipcRenderer.invoke('open-directory'),
  scanDirectory: (dirPath: string) => ipcRenderer.invoke('scan-directory', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  onDragDrop: (callback: (dirPath: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, dirPath: string) => callback(dirPath)
    ipcRenderer.on('drag-drop-directory', handler)
    return () => ipcRenderer.removeListener('drag-drop-directory', handler)
  },
  onCloseTab: (callback: () => void) => onChannel('close-current-tab', callback),
  onOpenDirectory: (callback: () => void) => onChannel('menu-open-directory', callback),
  onOpenSettings: (callback: () => void) => onChannel('menu-open-settings', callback),
  onFindInPage: (callback: () => void) => onChannel('menu-find-in-page', callback),
  onDirectoryChange: (callback: (dirPath: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, dirPath: string) => callback(dirPath)
    ipcRenderer.on('directory-changed', handler)
    return () => ipcRenderer.removeListener('directory-changed', handler)
  },
  closeWindow: () => ipcRenderer.send('close-window'),
  isDirectory: (filePath: string) => ipcRenderer.invoke('is-directory', filePath),
  watchDirectory: (dirPath: string | null) => ipcRenderer.invoke('watch-directory', dirPath),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('write-file', filePath, content),
  renamePath: (oldPath: string, newName: string) => ipcRenderer.invoke('rename-path', oldPath, newName),
  deletePath: (targetPath: string) => ipcRenderer.invoke('delete-path', targetPath),
  openLocalLink: (filePath: string) => ipcRenderer.invoke('open-local-link', filePath),
}

contextBridge.exposeInMainWorld('readownAPI', api)
