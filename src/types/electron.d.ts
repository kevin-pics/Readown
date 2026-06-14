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

declare global {
  interface Window {
    readownAPI: ReadownAPI
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
  }
  interface DataTransferItem {
    getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>
  }
}
