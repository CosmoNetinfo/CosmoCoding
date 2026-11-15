import { app, BrowserWindow, session, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { startWorkspace } from './server.mjs'
import worker from './generated/workspace.mjs'

let workspace
let window
const smoke = process.argv.includes('--cosmocoding-smoke')

function openExternal(url) {
  const target = URL.parse(url)
  if (target?.protocol === 'https:' && (['github.com', 'supabase.com', 'vercel.com'].includes(target.hostname)
    || /^[a-z0-9-]+\.vercel\.app$/i.test(target.hostname))) {
    void shell.openExternal(target.href).catch(() => {})
  }
}

async function openWindow() {
  window = new BrowserWindow({
    width: 1160,
    height: 790,
    minWidth: 390,
    minHeight: 560,
    show: !smoke,
    backgroundColor: '#0d1116',
    icon: fileURLToPath(new URL('./generated/icon.png', import.meta.url)),
    webPreferences: {
      session: session.fromPartition('cosmocoding'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false
    }
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (URL.parse(url)?.origin === workspace.origin) return
    event.preventDefault()
    openExternal(url)
  })
  window.on('closed', () => { window = null })
  await window.loadURL(workspace.origin)
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore()
    window?.focus()
  })
  app.whenReady().then(async () => {
    workspace = await startWorkspace(worker)
    const isolated = session.fromPartition('cosmocoding')
    isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    isolated.setPermissionCheckHandler(() => false)
    await openWindow()
    if (smoke) {
      const loaded = await window.webContents.executeJavaScript(
        'document.title === "CosmoCoding — Workspace" && document.querySelector(".brand img").naturalWidth === 192'
      )
      app.exit(loaded ? 0 : 1)
      return
    }
    app.on('activate', () => { if (!window) void openWindow().catch(() => app.exit(1)) })
  }).catch(() => app.exit(1))
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
  app.on('before-quit', () => workspace?.close())
}
