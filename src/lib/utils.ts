import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isExternalHref(href: string): boolean {
  return /^[a-zA-Z][\w+.-]*:/.test(href) || href.startsWith('//')
}

export function hashString(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return hash.toString(16)
}

export function isCsvPath(path: string): boolean {
  return path.toLowerCase().endsWith('.csv')
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let col = ''
  let row: string[] = []
  let i = 0
  const n = text.length

  while (i < n) {
    const ch = text[i]
    if (ch === '"') {
      i++
      while (i < n) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            col += '"'
            i += 2
          } else {
            i++
            break
          }
        } else {
          col += text[i++]
        }
      }
    } else if (ch === ',') {
      row.push(col)
      col = ''
      i++
    } else if (ch === '\r' || ch === '\n') {
      row.push(col)
      col = ''
      if (ch === '\r' && text[i + 1] === '\n') i++
      rows.push(row)
      row = []
      i++
    } else {
      col += ch
      i++
    }
  }

  row.push(col)
  if (row.some((c) => c !== '')) rows.push(row)

  return rows
}

export function resolveRelativePath(basePath: string, href: string): string | null {
  let target = href.split('#')[0].split('?')[0]
  if (!target) return null
  try {
    target = decodeURIComponent(target)
  } catch {
    // keep raw target if it is not valid percent-encoding
  }

  const sep = basePath.includes('\\') ? '\\' : '/'
  const parts = basePath.split(/[\\/]/)
  parts.pop()

  for (const segment of target.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') parts.pop()
    else parts.push(segment)
  }

  return parts.join(sep)
}
