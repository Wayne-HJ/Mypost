const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { executeRequest } = require('./http.cjs');
const { createStorage, validateWorkspace, MAX_WORKSPACE_BYTES } = require('./storage.cjs');
const { createTranslator, translateMessage, defaultLanguage, isLanguage } = require('../shared/i18n.mjs');

app.setName('Mypost');

let mainWindow;
let storage;
let currentLanguage = defaultLanguage;
const pending = new Map();
const devUrl = process.env.MYPOST_DEV_URL;
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
function trusted(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('无权访问桌面 API');
}
function handle(channel, action) {
  ipcMain.handle(channel, async (event, ...args) => {
    try { trusted(event); return await action(...args); }
    catch (error) { throw new Error(translateMessage(error.message ?? String(error), currentLanguage)); }
  });
}
function setLanguage(language) {
  if (!isLanguage(language)) throw new Error('语言设置无效');
  currentLanguage = language;
  const t = createTranslator(language);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: 'Mypost', submenu: [{ role: 'about', label: t('关于 Mypost') }, { type: 'separator' }, { role: 'hide', label: t('隐藏 Mypost') }, { role: 'quit', label: t('退出 Mypost') }] }] : []),
    { label: t('编辑'), submenu: [{ role: 'undo', label: t('撤销') }, { role: 'redo', label: t('重做') }, { type: 'separator' }, { role: 'cut', label: t('剪切') }, { role: 'copy', label: t('复制') }, { role: 'paste', label: t('粘贴') }, { role: 'selectAll', label: t('全选') }] },
    { label: t('视图'), submenu: [{ role: 'resetZoom', label: t('实际大小') }, { role: 'zoomIn', label: t('放大') }, { role: 'zoomOut', label: t('缩小') }, { role: 'togglefullscreen', label: t('切换全屏') }, ...(devUrl ? [{ role: 'toggleDevTools', label: t('开发者工具') }] : [])] },
    { label: t('窗口'), submenu: [{ role: 'minimize', label: t('最小化') }, { role: 'close', label: t('关闭窗口') }] },
  ]));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 940, minWidth: 1000, minHeight: 720,
    title: 'Mypost', backgroundColor: '#faf9f6',
    titleBarStyle: 'hidden', ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 18, y: 18 } } : { titleBarOverlay: { color: '#faf9f6', symbolColor: '#565653', height: 48 } }),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  if (devUrl) {
    const url = new URL(devUrl);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('开发服务器必须使用本机地址');
    mainWindow.loadURL(devUrl);
  } else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  mainWindow.on('closed', () => {
    for (const controller of pending.values()) controller.abort();
    pending.clear();
    mainWindow = null;
  });
}

if (hasInstanceLock) app.whenReady().then(() => {
  storage = createStorage(path.join(app.getPath('userData'), 'workspace.json'));
  handle('language:set', setLanguage);
  handle('workspace:load', () => storage.load());
  handle('workspace:save', value => storage.save(value));
  handle('request:send', async payload => {
    if (!payload || typeof payload.id !== 'string' || payload.id.length > 100 || pending.has(payload.id)) throw new Error('请求标识无效');
    const controller = new AbortController();
    pending.set(payload.id, controller);
    try { return await executeRequest(payload.request, payload.environment, payload.settings, controller.signal); }
    finally { pending.delete(payload.id); }
  });
  handle('request:cancel', id => { pending.get(id)?.abort(); });
  handle('file:save', async payload => {
    if (!payload || typeof payload.content !== 'string' || typeof payload.name !== 'string'
      || payload.content.length > 30 * 1024 * 1024 || !['utf8', 'base64'].includes(payload.encoding ?? 'utf8')) throw new Error('文件内容无效');
    const t = createTranslator(currentLanguage);
    const result = await dialog.showSaveDialog(mainWindow, { title: t('保存文件'), buttonLabel: t('保存'), defaultPath: path.basename(payload.name) });
    if (result.canceled || !result.filePath) return false;
    await fs.writeFile(result.filePath, payload.content, { encoding: payload.encoding ?? 'utf8', mode: 0o600 });
    return true;
  });
  handle('file:open', async () => {
    const t = createTranslator(currentLanguage);
    const result = await dialog.showOpenDialog(mainWindow, { title: t('打开工作区'), buttonLabel: t('导入'), properties: ['openFile'], filters: [{ name: t('Mypost 工作区'), extensions: ['json'] }] });
    if (result.canceled) return null;
    if ((await fs.stat(result.filePaths[0])).size > MAX_WORKSPACE_BYTES) throw new Error('工作区超过 20 MB 限制');
    return validateWorkspace(JSON.parse(await fs.readFile(result.filePaths[0], 'utf8')));
  });
  setLanguage(defaultLanguage);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
let quitting = false;
app.on('before-quit', event => {
  if (quitting || !storage) return;
  event.preventDefault();
  quitting = true;
  storage.flush().finally(() => app.quit());
});
