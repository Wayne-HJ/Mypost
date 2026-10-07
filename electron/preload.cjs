const { contextBridge, ipcRenderer } = require('electron');
async function invoke(channel, ...args) {
  try { return await ipcRenderer.invoke(channel, ...args); }
  catch (error) { throw new Error(String(error.message).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')); }
}
contextBridge.exposeInMainWorld('mypost', {
  platform: process.platform,
  setLanguage: language => invoke('language:set', language),
  loadWorkspace: () => invoke('workspace:load'),
  saveWorkspace: value => invoke('workspace:save', value),
  sendRequest: payload => invoke('request:send', payload),
  cancelRequest: id => invoke('request:cancel', id),
  saveFile: payload => invoke('file:save', payload),
  openWorkspaceFile: () => invoke('file:open'),
});
