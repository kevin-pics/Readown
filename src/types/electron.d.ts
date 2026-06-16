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
  onDirectoryChange: (callback: (dirPath: string) => void) => () => void
  closeWindow: () => void
  isDirectory: (filePath: string) => Promise<boolean>
  watchDirectory: (dirPath: string | null) => Promise<void>
  getPathForFile: (file: File) => string
  writeFile: (filePath: string, content: string) => Promise<void>
  renamePath: (oldPath: string, newName: string) => Promise<{ success: boolean; newPath?: string; error?: string }>
  deletePath: (targetPath: string) => Promise<{ success: boolean; error?: string }>
}

declare global {
  interface Window {
    readownAPI: ReadownAPI
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
  }
  interface DataTransferItem {
    getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>
  }
}
