import { Notification, ipcMain } from "electron";

export function setupNotifications() {
  ipcMain.on("notify", (_event, { title, body }: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body }).show();
    }
  });

  // Window control handlers
  ipcMain.on("window-minimize", (event) => {
    const win = require("electron").BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });

  ipcMain.on("window-maximize", (event) => {
    const win = require("electron").BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.on("window-close", (event) => {
    const win = require("electron").BrowserWindow.fromWebContents(event.sender);
    win?.hide();
  });
}

export function sendRevenueNotification(
  planetName: string,
  amount: number
) {
  if (!Notification.isSupported()) return;

  new Notification({
    title: `+$${amount.toFixed(2)} Revenue`,
    body: `From ${planetName}`,
    silent: false,
  }).show();
}

export function sendScanNotification(
  planetsCreated: number,
  ideasFound: number
) {
  if (!Notification.isSupported()) return;

  new Notification({
    title: "Scan Complete",
    body: `Found ${ideasFound} ideas, deployed ${planetsCreated} planets`,
    silent: true,
  }).show();
}
