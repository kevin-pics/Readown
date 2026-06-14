import { contextBridge, ipcRenderer } from 'electron'

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
}

contextBridge.exposeInMainWorld('readownAPI', api)
