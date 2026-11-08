// Tells the web app it runs inside the desktop shell.
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('clipDesktop', { platform: process.platform, isDesktop: true })
