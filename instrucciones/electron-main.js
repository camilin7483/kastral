/**
 * KASTRAL — Contenedor de Escritorio Electron para Linux y Windows (100 % Offline)
 * Autor: Andres Guerrero
 * No utiliza API keys, credenciales ni conexiones externas.
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let serverProcess = null;
const PORT = 3000;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'Kastral — Convierte. Comprime. Simplifica.',
    backgroundColor: '#0B0B0D',
    icon: path.join(__dirname, 'public', 'pwa-512x512.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  serverProcess = spawn('npx', ['next', 'start', '-H', '127.0.0.1', '-p', String(PORT)], {
    cwd: __dirname,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_PUBLIC_DISABLE_ADS: 'true',
      NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${PORT}`,
    },
    shell: true,
  });

  setTimeout(createWindow, 2000);
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
