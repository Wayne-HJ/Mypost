import type { Language } from './i18n';
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type Row = { id: string; enabled: boolean; key: string; value: string };
export type Auth = { type: 'none' | 'bearer' | 'basic'; token: string; username: string; password: string };
export type ApiRequest = {
  id: string; collectionId: string | null; name: string; method: Method; url: string;
  params: Row[]; headers: Row[]; bodyType: 'none' | 'json' | 'text' | 'urlencoded';
  body: string; bodyRows: Row[]; auth: Auth; dirty?: boolean;
};
export type Collection = { id: string; name: string };
export type Environment = { id: string; name: string; variables: Row[] };
export type Settings = { timeoutMs: number; followRedirects: boolean; language: Language };
export type ApiResponse = {
  status: number; statusText: string; headers: { key: string; value: string }[];
  body: string; base64?: string; isBinary: boolean; size: number; duration: number;
  url: string; redirected: boolean; receivedAt: string;
};
export type HistoryEntry = { id: string; at: string; request: ApiRequest; environmentName: string; status?: number; duration?: number; error?: string };
export type Workspace = {
  version: 1; collections: Collection[]; requests: ApiRequest[]; environments: Environment[];
  history: HistoryEntry[]; tabs: string[]; activeRequestId: string | null; activeEnvironmentId: string | null; settings: Settings;
};
export type RequestPayload = { id: string; request: ApiRequest; environment?: Environment; settings: Settings };
export type FilePayload = { name: string; content: string; encoding?: 'utf8' | 'base64' };
export type DesktopBridge = {
  platform: string;
  setLanguage(language: Language): Promise<void>;
  loadWorkspace(): Promise<Workspace | null>; saveWorkspace(value: Workspace): Promise<void>;
  sendRequest(payload: RequestPayload): Promise<ApiResponse>; cancelRequest(id: string): Promise<void>;
  saveFile(payload: FilePayload): Promise<boolean>; openWorkspaceFile(): Promise<Workspace | null>;
};
declare global { interface Window { mypost?: DesktopBridge } }
