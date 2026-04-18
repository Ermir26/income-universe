import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  // Receive commands from native menu
  onCommand: (callback: (command: string) => void) => {
    ipcRenderer.on("command", (_event, command) => callback(command));
  },

  // Send notifications
  notify: (title: string, body: string) => {
    ipcRenderer.send("notify", { title, body });
  },

  // App info
  platform: process.platform,
  isElectron: true,

  // Window controls
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
});
