import { validateWorkspace } from './model';
import type { ApiResponse, DesktopBridge, FilePayload, RequestPayload, Workspace } from './types';

const storageKey = 'mypost.workspace.v1';
async function callPreview(action: string, payload: unknown) {
  const response = await fetch(`/__mypost/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Mypost-Client': 'preview' }, body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? '请求失败');
  return result;
}
export const bridge: DesktopBridge = window.mypost ?? {
  platform: 'web',
  async setLanguage() {},
  async loadWorkspace(): Promise<Workspace | null> {
    const value = localStorage.getItem(storageKey);
    return value ? validateWorkspace(JSON.parse(value)) : null;
  },
  async saveWorkspace(value) { localStorage.setItem(storageKey, JSON.stringify(validateWorkspace(value))); },
  async sendRequest(payload: RequestPayload): Promise<ApiResponse> { return callPreview('send', payload); },
  async cancelRequest(id) { await callPreview('cancel', { id }); },
  async saveFile(payload: FilePayload) {
    const bytes = payload.encoding === 'base64' ? Uint8Array.from(atob(payload.content), char => char.charCodeAt(0)) : payload.content;
    const url = URL.createObjectURL(new Blob([bytes]));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = payload.name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },
  async openWorkspaceFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input'); input.type = 'file'; input.accept = '.json';
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.addEventListener('change', async () => {
        try {
          const file = input.files?.[0];
          if (!file) { resolve(null); return; }
          if (file.size > 20 * 1024 * 1024) throw new Error('工作区超过 20 MB 限制');
          resolve(validateWorkspace(JSON.parse(await file.text())));
        } catch (error) { reject(error); }
      }, { once: true });
      input.click();
    });
  },
};
