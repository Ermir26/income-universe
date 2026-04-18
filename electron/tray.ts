import { Tray, Menu, nativeImage, type BrowserWindow } from "electron";
import path from "path";

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow | null) {
  const iconPath = path.join(__dirname, "../public/tray-icon.png");

  // Create a 16x16 empty icon as fallback
  const icon = nativeImage.createFromPath(iconPath).isEmpty()
    ? nativeImage.createEmpty()
    : nativeImage.createFromPath(iconPath);

  tray = new Tray(icon.isEmpty() ? nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAAXklEQVQ4y2NgGAWDATAyMDD8J0YjIwMDAxMDAwMjMRoZiNXAQKwGkg1gYmBgYCRGA7EuICYMGJE0MBJjACOxGhhJ0cBIigZGUjQwkqKBkVQNjORoYCRHAyO5GkYBMQAAV3YJEWnEQNcAAAAASUVORK5CYII="
  ) : icon);

  tray.setToolTip("Income Universe");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Dashboard",
      click: () => mainWindow?.show(),
    },
    {
      label: "Scan Now",
      click: () => mainWindow?.webContents.send("command", "scan"),
    },
    {
      label: "Toggle Auto Mode",
      click: () => mainWindow?.webContents.send("command", "toggle-auto"),
    },
    { type: "separator" },
    {
      label: "Revenue: $0.00",
      enabled: false,
    },
    {
      label: "Planets: 0 active",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        mainWindow?.destroy();
        require("electron").app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    mainWindow?.show();
  });
}

export function updateTrayStats(revenue: number, planets: number) {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Dashboard",
      click: () => require("electron").BrowserWindow.getAllWindows()[0]?.show(),
    },
    { type: "separator" },
    {
      label: `Revenue: $${revenue.toFixed(2)}`,
      enabled: false,
    },
    {
      label: `Planets: ${planets} active`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => require("electron").app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);
}
