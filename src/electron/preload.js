const { contextBridge, ipcRenderer } = require('electron');

// Exponer APIs seguras al renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  showDialog: (message) => ipcRenderer.invoke('show-dialog', message),
  
  // Escuchar eventos del menú
  onMenuEvent: (callback) => {
    ipcRenderer.on('nueva-visita', callback);
    ipcRenderer.on('ver-historial', callback);
  }
});