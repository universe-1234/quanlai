import { app, BrowserWindow, dialog, shell } from "electron";
import path from "node:path";

const headlessIssue = process.argv.includes("--issue-auto");

async function runHeadlessIssue() {
  await app.whenReady();
  try {
    const { runIssue } = await import("../server/scheduler.mjs");
    const result = await runIssue("scheduled");
    console.log(JSON.stringify({ ok: result.ok, couponCount: result.couponCount, isFirstIssue: result.isFirstIssue }));
    app.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(error.message || "自动领券失败");
    app.exit(1);
  }
}

async function startDesktopApp() {
  process.env.QUANLAI_STATIC_DIR = path.join(app.getAppPath(), "dist", "client");
  const { startQuanlaiServer } = await import("../server/index.mjs");
  const started = await startQuanlaiServer({
    onSchedulerError: (message) => console.error(message),
  });

  const window = new BrowserWindow({
    width: 1240,
    height: 900,
    minWidth: 360,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#fbfaf7",
    title: "券来",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(started.url)) {
      event.preventDefault();
      if (/^https:\/\//i.test(url)) shell.openExternal(url);
    }
  });
  await window.loadURL(started.url);

  app.on("before-quit", () => {
    clearInterval(started.scheduler);
    started.server.close();
  });
}

if (headlessIssue) {
  runHeadlessIssue();
} else {
  const hasLock = app.requestSingleInstanceLock();
  if (!hasLock) {
    app.quit();
  } else {
    app.on("second-instance", () => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window) {
        if (window.isMinimized()) window.restore();
        window.focus();
      }
    });
    app.whenReady()
      .then(startDesktopApp)
      .catch((error) => {
        dialog.showErrorBox("券来启动失败", error.message || String(error));
        app.quit();
      });
    app.on("window-all-closed", () => app.quit());
  }
}
