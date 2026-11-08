/**
 * Clip desktop shell (Electron).
 *
 * Serves the static Nuxt build (`.output/public`, packaged as `resources/web`)
 * through a private, secure `app://` scheme so everything that needs a secure
 * context works exactly like on the web: IndexedDB, the private file system
 * (voices), WebCodecs export, Web Workers and WebAssembly. No server, no
 * network - all files are read from disk.
 */
const { app, BrowserWindow, Menu, protocol, session, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const SCHEME = 'app'
const HOST = 'clip'

// Portable Linux builds (AppImage) cannot use Chromium's setuid sandbox, and
// many distributions block unprivileged user namespaces; root cannot use it either.
if (process.platform === 'linux' && (process.env.APPIMAGE || (process.getuid && process.getuid() === 0))) {
  app.commandLine.appendSwitch('no-sandbox')
}
// Hardware video decoding / WebCodecs on Linux.
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder')

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, codeCache: true } },
])

/** Folder with the static web build. */
function webRoot() {
  const candidates = [
    path.join(process.resourcesPath ?? '', 'web'),
    path.join(__dirname, '..', '.output', 'public'),
    path.join(__dirname, 'web'),
  ]
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) ?? candidates[1]
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

function serve(root) {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url)
    let relative = decodeURIComponent(url.pathname)
    let file = path.normalize(path.join(root, relative))
    if (!file.startsWith(root)) return new Response('Forbidden', { status: 403 })
    try {
      if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
    } catch {
      // Unknown path: client-side route -> SPA entry; missing asset -> 404.
      file = path.extname(relative) ? '' : path.join(root, '200.html')
    }
    if (!file || !fs.existsSync(file)) return new Response('Not found', { status: 404 })
    const body = await fs.promises.readFile(file)
    return new Response(body, {
      headers: {
        'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-cache',
      },
    })
  })
}

let mainWindow = null

function createWindow() {
  const icon = path.join(webRoot(), 'icon-512.png')
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#0a0a0f',
    title: 'Clip',
    icon: fs.existsSync(icon) ? icon : undefined,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  // Links to websites open in the normal browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${SCHEME}://`)) {
      event.preventDefault()
      if (/^https?:/.test(url)) void shell.openExternal(url)
    }
  })
  // Exports: always ask where to save the video.
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: 'Save video', defaultPath: path.join(app.getPath('videos'), item.getFilename()) })
  })
  if (!fs.existsSync(path.join(webRoot(), 'index.html'))) {
    // Started from the source without a web build.
    void mainWindow.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent('<body style="background:#0a0a0f;color:#eee;font:16px system-ui;padding:40px"><h2>Clip</h2><p>No web build found. Run <code>npm run build</code> first (or <code>npm run desktop:dev</code>).</p></body>'),
    )
    return
  }
  void mainWindow.loadURL(`${SCHEME}://${HOST}/`)
  mainWindow.on('closed', () => (mainWindow = null))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    // Camera / microphone are not used; storage persistence and clipboard are.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(['persistent-storage', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'notifications'].includes(permission))
    })
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
    serve(webRoot())
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

