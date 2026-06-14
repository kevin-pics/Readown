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
    id: 'github',
    name: 'GitHub',
    preview: { sidebar: '#ffffff', content: '#ffffff', accent: '#0969da' },
    codeTheme: 'github',
    variables: {
      '--background': '0 0% 100%',
      '--foreground': '210 12% 15%',
      '--card': '0 0% 100%',
      '--card-foreground': '210 12% 15%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '210 12% 15%',
      '--primary': '212 92% 45%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '210 40% 96%',
      '--secondary-foreground': '210 12% 15%',
      '--muted': '210 40% 96%',
      '--muted-foreground': '215 16% 47%',
      '--accent': '210 40% 96%',
      '--accent-foreground': '210 12% 15%',
      '--destructive': '0 84% 60%',
      '--destructive-foreground': '0 0% 100%',
      '--border': '214 32% 91%',
      '--input': '214 32% 91%',
      '--ring': '212 92% 45%',
    },
    prose: {
      '--prose-text': '#1f2328',
      '--prose-heading': '#1f2328',
      '--prose-link': '#0969da',
      '--prose-code-bg': '#f6f8fa',
      '--prose-blockquote': '#57606a',
      '--prose-table-border': '#d0d7de',
      '--prose-table-header': '#f6f8fa',
    },
  },
  {
    id: 'vscode',
    name: 'VS Code Dark',
    preview: { sidebar: '#252526', content: '#1e1e1e', accent: '#007acc' },
    codeTheme: 'github-dark',
    variables: {
      '--background': '0 0% 12%',
      '--foreground': '0 0% 85%',
      '--card': '0 0% 15%',
      '--card-foreground': '0 0% 85%',
      '--popover': '0 0% 15%',
      '--popover-foreground': '0 0% 85%',
      '--primary': '207 90% 54%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '0 0% 20%',
      '--secondary-foreground': '0 0% 85%',
      '--muted': '0 0% 20%',
      '--muted-foreground': '0 0% 60%',
      '--accent': '0 0% 20%',
      '--accent-foreground': '0 0% 85%',
      '--destructive': '0 70% 50%',
      '--destructive-foreground': '0 0% 100%',
      '--border': '0 0% 25%',
      '--input': '0 0% 25%',
      '--ring': '207 90% 54%',
    },
    prose: {
      '--prose-text': '#d4d4d4',
      '--prose-heading': '#d4d4d4',
      '--prose-link': '#4fc1ff',
      '--prose-code-bg': '#3c3c3c',
      '--prose-blockquote': '#808080',
      '--prose-table-border': '#3c3c3c',
      '--prose-table-header': '#2d2d2d',
    },
  },
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
      '--prose-link': '#000000',
      '--prose-code-bg': '#f1f1ef',
      '--prose-blockquote': '#6b6b6b',
      '--prose-table-border': '#e3e2e0',
      '--prose-table-header': '#f7f6f3',
    },
  },
  {
    id: 'sepia',
    name: 'Sepia',
    preview: { sidebar: '#f4ecd8', content: '#f4ecd8', accent: '#8b4513' },
    codeTheme: 'atom-one-light',
    variables: {
      '--background': '40 35% 90%',
      '--foreground': '30 30% 20%',
      '--card': '40 35% 90%',
      '--card-foreground': '30 30% 20%',
      '--popover': '40 35% 92%',
      '--popover-foreground': '30 30% 20%',
      '--primary': '25 75% 47%',
      '--primary-foreground': '0 0% 100%',
      '--secondary': '40 25% 82%',
      '--secondary-foreground': '30 30% 20%',
      '--muted': '40 25% 82%',
      '--muted-foreground': '30 20% 40%',
      '--accent': '40 25% 82%',
      '--accent-foreground': '30 30% 20%',
      '--destructive': '0 60% 45%',
      '--destructive-foreground': '0 0% 100%',
      '--border': '35 20% 75%',
      '--input': '35 20% 75%',
      '--ring': '25 75% 47%',
    },
    prose: {
      '--prose-text': '#433422',
      '--prose-heading': '#433422',
      '--prose-link': '#8b4513',
      '--prose-code-bg': '#eaddcf',
      '--prose-blockquote': '#7a6652',
      '--prose-table-border': '#d7c8b5',
      '--prose-table-header': '#eaddcf',
    },
  },
]

export const defaultThemeId = 'github'

export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  Object.entries(theme.variables).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
  Object.entries(theme.prose).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
  root.setAttribute('data-theme', theme.id)
}

export function getThemeById(id: string): Theme {
  return themes.find((t) => t.id === id) ?? themes[0]
}
