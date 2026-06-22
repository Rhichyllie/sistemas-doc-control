const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Aqui você pode expor APIs seguras para o frontend, se precisar
});
