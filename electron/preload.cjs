const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Safe APIs go here
});
