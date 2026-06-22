const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, '../public/favicon.ico')
  });

  const template = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Sair', accelerator: 'Alt+F4', click: () => app.quit() }
      ]
    },
    {
      label: 'Ajuda',
      submenu: [
        { label: 'Sobre', click: () => {
          require('electron').dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Sobre',
            message: 'Sistema DOC Control',
            detail: 'Gerenciador de Documentos v1.0'
          });
        }}
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
