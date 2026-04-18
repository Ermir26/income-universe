import { app, BrowserWindow, Menu, nativeImage } from "electron";
import path from "path";
import { createTray } from "./tray";
import { setupNotifications } from "./notifications";

let mainWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === "development";
const PORT = process.env.PORT || 3000;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: "Income Universe",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#010208",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: nativeImage.createFromPath(
      path.join(__dirname, "../public/icon.png")
    ),
  });

  if (isDev) {
    mainWindow.loadURL(`http://localhost:${PORT}`);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../out/index.html"));
  }

  mainWindow.on("close", (event) => {
    // Minimize to tray instead of quitting
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "Income Universe",
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Scan Now",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => {
            mainWindow?.webContents.send("command", "scan");
          },
        },
        {
          label: "Toggle Auto Mode",
          accelerator: "CmdOrCtrl+Shift+A",
          click: () => {
            mainWindow?.webContents.send("command", "toggle-auto");
          },
        },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { role: "close" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  createWindow();
  createMenu();
  createTray(mainWindow);
  setupNotifications();

  app.on("activate", () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // Keep running in tray on macOS
  if (process.platform !== "darwin") {
    app.quit();
  }
});

export { mainWindow };
