export interface Theme {
  id: string
  name: string
  preview: {
    sidebar: string
    content: string
    accent: string
  }
  variables: Record<string, string>
  prose: Record<string, string>
  codeTheme: string
}

export const themes: Theme[] = [
  {
    id: 'notion',
    name: 'Notion',
    preview: { sidebar: '#f7f6f3', content: '#ffffff', accent: '#000000' },
    codeTheme: 'atom-one-light',
    variables: {
      '--background': '40 20% 97%',
      '--foreground': '0 0% 15%',
      '--card': '40 20% 97%',
      '--card-foreground': '0 0% 15%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '0 0% 15%',
      '--primary': '0 0% 15%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '40 15% 92%',
      '--secondary-foreground': '0 0% 15%',
      '--muted': '40 15% 92%',
      '--muted-foreground': '0 0% 45%',
      '--accent': '40 15% 92%',
      '--accent-foreground': '0 0% 15%',
      '--destructive': '0 70% 50%',
      '--destructive-foreground': '0 0% 100%',
      '--border': '40 10% 85%',
      '--input': '40 10% 85%',
      '--ring': '0 0% 15%',
    },
    prose: {
      '--prose-text': '#37352f',
      '--prose-heading': '#37352f',
      '--prose-link': '#353470',
      '--prose-code-bg': '#e9e9e5',
      '--prose-blockquote': '#6b6b6b',
      '--prose-table-border': '#d9d8d5',
      '--prose-table-header': '#f7f6f3',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    preview: { sidebar: '#282a36', content: '#44475a', accent: '#bd93f9' },
    codeTheme: 'github-dark',
    variables: {
      '--background': '231 15% 18%',
      '--foreground': '60 30% 96%',
      '--card': '231 15% 22%',
      '--card-foreground': '60 30% 96%',
      '--popover': '231 15% 22%',
      '--popover-foreground': '60 30% 96%',
      '--primary': '265 89% 78%',
      '--primary-foreground': '231 15% 18%',
      '--secondary': '232 14% 31%',
      '--secondary-foreground': '60 30% 96%',
      '--muted': '232 14% 31%',
      '--muted-foreground': '231 13% 60%',
      '--accent': '232 14% 31%',
      '--accent-foreground': '60 30% 96%',
      '--destructive': '0 100% 67%',
      '--destructive-foreground': '60 30% 96%',
      '--border': '231 13% 35%',
      '--input': '231 13% 35%',
      '--ring': '265 89% 78%',
    },
    prose: {
      '--prose-text': '#f8f8f2',
      '--prose-heading': '#f8f8f2',
      '--prose-link': '#8be9fd',
      '--prose-code-bg': '#44475a',
      '--prose-blockquote': '#6272a4',
      '--prose-table-border': '#44475a',
      '--prose-table-header': '#6272a4',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    preview: { sidebar: '#2e3440', content: '#3b4252', accent: '#88c0d0' },
    codeTheme: 'github-dark',
    variables: {
      '--background': '220 16% 22%',
      '--foreground': '219 28% 88%',
      '--card': '220 16% 26%',
      '--card-foreground': '219 28% 88%',
      '--popover': '220 16% 26%',
      '--popover-foreground': '219 28% 88%',
      '--primary': '193 43% 67%',
      '--primary-foreground': '220 16% 22%',
      '--secondary': '220 16% 32%',
      '--secondary-foreground': '219 28% 88%',
      '--muted': '220 16% 32%',
      '--muted-foreground': '220 12% 65%',
      '--accent': '220 16% 32%',
      '--accent-foreground': '219 28% 88%',
      '--destructive': '354 42% 56%',
      '--destructive-foreground': '219 28% 88%',
      '--border': '220 16% 35%',
      '--input': '220 16% 35%',
      '--ring': '193 43% 67%',
    },
    prose: {
      '--prose-text': '#d8dee9',
      '--prose-heading': '#d8dee9',
      '--prose-link': '#88c0d0',
      '--prose-code-bg': '#3b4252',
      '--prose-blockquote': '#4c566a',
      '--prose-table-border': '#434c5e',
      '--prose-table-header': '#4c566a',
    },
  },
  {
    id: 'monokai',
    name: 'Monokai',
    preview: { sidebar: '#272822', content: '#3e3d32', accent: '#a6e22e' },
    codeTheme: 'atom-one-dark',
    variables: {
      '--background': '70 8% 15%',
      '--foreground': '60 9% 78%',
      '--card': '70 8% 18%',
      '--card-foreground': '60 9% 78%',
      '--popover': '70 8% 18%',
      '--popover-foreground': '60 9% 78%',
      '--primary': '80 76% 53%',
      '--primary-foreground': '70 8% 15%',
      '--secondary': '70 7% 25%',
      '--secondary-foreground': '60 9% 78%',
      '--muted': '70 7% 25%',
      '--muted-foreground': '60 5% 55%',
      '--accent': '70 7% 25%',
      '--accent-foreground': '60 9% 78%',
      '--destructive': '338 95% 56%',
      '--destructive-foreground': '60 9% 78%',
      '--border': '70 7% 28%',
      '--input': '70 7% 28%',
      '--ring': '80 76% 53%',
    },
    prose: {
      '--prose-text': '#f8f8f2',
      '--prose-heading': '#f8f8f2',
      '--prose-link': '#a6e22e',
      '--prose-code-bg': '#3e3d32',
      '--prose-blockquote': '#75715e',
      '--prose-table-border': '#49483e',
      '--prose-table-header': '#3e3d32',
    },
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    preview: { sidebar: '#191724', content: '#1f1d2e', accent: '#ebbcba' },
    codeTheme: 'github-dark',
    variables: {
      '--background': '249 22% 12%',
      '--foreground': '245 50% 91%',
      '--card': '248 21% 15%',
      '--card-foreground': '245 50% 91%',
      '--popover': '248 21% 15%',
      '--popover-foreground': '245 50% 91%',
      '--primary': '14 89% 78%',
      '--primary-foreground': '249 22% 12%',
      '--secondary': '248 13% 26%',
      '--secondary-foreground': '245 50% 91%',
      '--muted': '248 13% 26%',
      '--muted-foreground': '248 12% 60%',
      '--accent': '248 13% 26%',
      '--accent-foreground': '245 50% 91%',
      '--destructive': '343 76% 68%',
      '--destructive-foreground': '245 50% 91%',
      '--border': '248 13% 30%',
      '--input': '248 13% 30%',
      '--ring': '14 89% 78%',
    },
    prose: {
      '--prose-text': '#e0def4',
      '--prose-heading': '#e0def4',
      '--prose-link': '#9ccfd8',
      '--prose-code-bg': '#26233a',
      '--prose-blockquote': '#6e6a86',
      '--prose-table-border': '#313040',
      '--prose-table-header': '#26233a',
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    preview: { sidebar: '#1e1e2e', content: '#313244', accent: '#cba6f7' },
    codeTheme: 'github-dark',
    variables: {
      '--background': '240 21% 15%',
      '--foreground': '226 64% 88%',
      '--card': '240 21% 18%',
      '--card-foreground': '226 64% 88%',
      '--popover': '240 21% 18%',
      '--popover-foreground': '226 64% 88%',
      '--primary': '267 84% 81%',
      '--primary-foreground': '240 21% 15%',
      '--secondary': '237 16% 23%',
      '--secondary-foreground': '226 64% 88%',
      '--muted': '237 16% 23%',
      '--muted-foreground': '228 20% 65%',
      '--accent': '237 16% 23%',
      '--accent-foreground': '226 64% 88%',
      '--destructive': '343 81% 75%',
      '--destructive-foreground': '226 64% 88%',
      '--border': '237 16% 28%',
      '--input': '237 16% 28%',
      '--ring': '267 84% 81%',
    },
    prose: {
      '--prose-text': '#cdd6f4',
      '--prose-heading': '#cdd6f4',
      '--prose-link': '#cba6f7',
      '--prose-code-bg': '#313244',
      '--prose-blockquote': '#6c7086',
      '--prose-table-border': '#45475a',
      '--prose-table-header': '#313244',
    },
  },
]

export const defaultThemeId = 'notion'

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  Object.entries(theme.variables).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
  Object.entries(theme.prose).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
  root.style.setProperty('--code-theme', theme.codeTheme)
  root.setAttribute('data-theme', theme.id)
}

export function getThemeById(id: string): Theme {
  return themes.find((t) => t.id === id) ?? themes[0]
}

const THEME_STORAGE_KEY = 'readown.theme'

export function getStoredTheme(): Theme {
  try {
    const id = localStorage.getItem(THEME_STORAGE_KEY)
    if (id) return getThemeById(id)
  } catch {
    // ignore storage access errors (e.g. private mode)
  }
  return getThemeById(defaultThemeId)
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme.id)
  } catch {
    // ignore storage access errors
  }
}
