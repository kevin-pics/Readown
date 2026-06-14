# Readown

A modern Markdown directory reader. Open a folder, browse its Markdown files in a collapsible tree, and read them rendered with syntax highlighting.

## Features

- Browse a directory of `.md` files in a collapsible file tree
- Rendered Markdown preview with GitHub-flavored Markdown and code syntax highlighting
- Resizable sidebar (drag the divider to adjust width)
- Switchable themes
- Runs as a desktop app (Electron) or in a compatible browser via the File System Access API
- Open a folder by drag-and-drop or with the folder button

## Tech stack

- React 19 + TypeScript
- Vite
- Tailwind CSS v4
- Electron
- marked + DOMPurify + highlight.js for rendering

## Getting started

Install dependencies:

```bash
npm install
```

Run in the browser (Vite dev server):

```bash
npm run dev
```

Run as a desktop app (Electron + Vite):

```bash
npm run electron:dev
```

## Build

Build the production app and package it with electron-builder:

```bash
npm run build
```

The packaged output is written to the `release/` directory.

## Scripts

- `npm run dev` - start the Vite dev server
- `npm run electron:dev` - start Vite and launch Electron
- `npm run build` - typecheck, build, and package the desktop app
- `npm run lint` - run ESLint
- `npm run preview` - preview the production build

## Usage

1. Launch the app.
2. Click the folder icon (or drag a directory onto the window) to open a folder.
3. Select a Markdown file from the tree to read it.
4. Drag the divider between the sidebar and the content to resize.
