// main.js - Główny plik startowy dla aplikacji Electron

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let serverProcess;

function createWindow() {
    console.log('Uruchamianie serwera Node.js w tle...');
    const command = process.platform === 'win32' ? 'node.exe' : 'node';
    serverProcess = spawn(command, [path.join(__dirname, 'server.js')]);

    serverProcess.stdout.on('data', (data) => {
        console.log(`[Serwer]: ${data}`);
    });

    serverProcess.stderr.on('data', (data) => {
        console.error(`[Błąd serwera]: ${data}`);
    });

    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        webPreferences: {
        },
        icon: path.join(__dirname, 'public', 'favicon.ico') 
    });

    setTimeout(() => {
        console.log('Ładowanie aplikacji do okna Electron...');
        mainWindow.loadURL('http://localhost:8080');
    }, 3000); 

}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    console.log('Zamykanie serwera Node.js...');
    if (serverProcess) {
        serverProcess.kill();
    }
});