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
