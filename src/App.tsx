import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpRight, Braces, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, Code2, Copy, Folder, FolderPlus, Globe2, Layers3, LoaderCircle, MoreHorizontal, Plus, Search, Send, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Square, Terminal, Trash2, Upload, X } from 'lucide-react';
import { bridge } from './bridge';
import { exportCurl, formatSize, id, importCurl, initialWorkspace, methods, newRequest, prettyJson, resolvedUrl, row, validateWorkspace } from './model';
import type { ApiRequest, ApiResponse, Environment, Row, Workspace } from './types';
import KeyValueEditor from './components/KeyValueEditor';
import Modal from './components/Modal';
import { I18nProvider, useI18n, createTranslator, translateMessage, formatTime, formatDate } from './i18n';

type RequestTab = 'params' | 'auth' | 'headers' | 'body';
type ModalKind = 'save' | 'curl' | 'environment' | 'settings' | 'collection' | 'shortcuts' | 'workspaceImport' | 'deleteRequest' | 'deleteCollection' | null;
type Result = { response?: ApiResponse; error?: string };


function CodeViewer({ content, search, pretty }: { content: string; search: string; pretty: boolean }) {
  const { t } = useI18n();
  const displayed = pretty ? prettyJson(content) : content;
  // 巨大响应避免生成数十万个 DOM 节点。完整内容仍可复制和下载。
  const truncated = displayed.length > 250000;
  const lines = displayed.slice(0, 250000).split('\n');
  const highlight = (line: string) => {
    if (!pretty) return line;
    const pieces = line.split(/("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g);
    return pieces.map((piece, i) => <span key={i} className={piece.startsWith('"') ? piece.trimEnd().endsWith(':') ? 'code-key' : 'code-string' : /^(true|false|null)$/.test(piece) ? 'code-literal' : /^-?\d/.test(piece) ? 'code-number' : undefined}>{piece}</span>);
  };
  return <div className="code-view" tabIndex={0} aria-label={t("响应内容")}>
    {lines.map((line, index) => <div className={`code-line ${search && line.toLowerCase().includes(search.toLowerCase()) ? 'matched' : ''}`} key={index}><span className="line-number" aria-hidden="true">{index + 1}</span><code>{highlight(line) || ' '}</code></div>)}
    {truncated && <div className="truncation">{t("仅预览前 250 KB，复制或下载可获取完整响应。")}</div>}
  </div>;
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => initialWorkspace());
  const language = workspace.settings.language;
  const t = useMemo(() => createTranslator(language), [language]);
  const tabLabels: Record<RequestTab, string> = { params: t("参数"), auth: t("认证"), headers: t("请求头"), body: t("请求体") };
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState<Record<string, string>>({});
  const [sidebarTab, setSidebarTab] = useState<'collections' | 'history'>('collections');
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [requestTab, setRequestTab] = useState<RequestTab>('params');
  const [responseTab, setResponseTab] = useState<'body' | 'headers'>('body');
  const [pretty, setPretty] = useState(true);
  const [responseSearch, setResponseSearch] = useState('');
  const [showResponseSearch, setShowResponseSearch] = useState(false);
  const [editorHeight, setEditorHeight] = useState(300);
  const [modal, setModal] = useState<ModalKind>(null);
  const [modalError, setModalError] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [collectionInput, setCollectionInput] = useState('');
  const [curlInput, setCurlInput] = useState('');
  const [curlCopied, setCurlCopied] = useState(false);
  const [envDrafts, setEnvDrafts] = useState<Environment[]>([]);
  const [envSelected, setEnvSelected] = useState<string | null>(null);
  const [envValuesVisible, setEnvValuesVisible] = useState(true);
  const [settingsDraft, setSettingsDraft] = useState(workspace.settings);
  const [importDraft, setImportDraft] = useState<Workspace | null>(null);
  const [targetId, setTargetId] = useState('');
  const [toast, setToast] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const runningRef = useRef(new Map<string, string>());
  const generation = useRef(0);
  const saveSequence = useRef(0);
  const urlRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const request = workspace.requests.find(item => item.id === workspace.activeRequestId);
  const environment = workspace.environments.find(item => item.id === workspace.activeEnvironmentId);
  const result = request ? results[request.id] : undefined;
  const response = result?.response;
  const activeRun = request ? running[request.id] : undefined;
  const collection = workspace.collections.find(item => item.id === request?.collectionId);
  const isMac = bridge.platform === 'darwin' || (bridge.platform === 'web' && /Mac/.test(navigator.platform));
  const modKey = isMac ? '⌘' : 'Ctrl';
  const closeModal = useCallback(() => { setModal(null); setModalError(''); }, []);
  const notify = useCallback((message: string) => setToast(message), []);

  useEffect(() => {
    let disposed = false;
    bridge.loadWorkspace().then(value => {
      if (!disposed && value) setWorkspace(validateWorkspace(value));
    }).catch(error => { if (!disposed) setLoadError(String(error.message)); })
      .finally(() => { if (!disposed) setReady(true); });
    return () => { disposed = true; };
  }, []);
  useEffect(() => {
    if (!ready || loadError) return;
    const sequence = ++saveSequence.current;
    setSaving(true);
    bridge.saveWorkspace(workspace).then(() => { if (sequence === saveSequence.current) setSaveError(''); })
      .catch(error => { if (sequence === saveSequence.current) setSaveError(error.message); })
      .finally(() => { if (sequence === saveSequence.current) setSaving(false); });
  }, [workspace, ready, loadError]);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = language;
    document.title = `Mypost · ${t('接口调试工作台')}`;
    void bridge.setLanguage(language).catch(error => notify(error.message));
  }, [language, ready, t, notify]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { setResponseSearch(''); setShowResponseSearch(false); }, [workspace.activeRequestId]);
  useEffect(() => {
    if (!moreOpen) return;
    const close = () => setMoreOpen(false);
    document.addEventListener('click', close); return () => document.removeEventListener('click', close);
  }, [moreOpen]);

  function updateRequest(change: Partial<ApiRequest>) {
    if (!request) return;
    setWorkspace(value => ({ ...value, requests: value.requests.map(item => item.id === request.id ? { ...item, ...change, dirty: true } : item) }));
  }
  function openRequest(requestId: string) {
    setWorkspace(value => ({ ...value, activeRequestId: requestId, tabs: value.tabs.includes(requestId) ? value.tabs : [...value.tabs, requestId] }));
  }
  function addRequest(collectionId: string | null = null, source?: ApiRequest) {
    const item = source ? { ...structuredClone(source), id: id(), name: t("{0} 副本", [source.name]), dirty: true } : newRequest({ collectionId, name: t('未命名请求') });
    setWorkspace(value => ({ ...value, requests: [...value.requests, item], tabs: [...value.tabs, item.id], activeRequestId: item.id }));
    setRequestTab(item.bodyType === 'none' ? 'params' : 'body');
    setTimeout(() => urlRef.current?.focus(), 0);
  }
  function closeRequestTab(requestId: string) {
    setWorkspace(value => {
      const index = value.tabs.indexOf(requestId), tabs = value.tabs.filter(item => item !== requestId);
      return { ...value, tabs, activeRequestId: value.activeRequestId === requestId ? tabs[Math.max(0, index - 1)] ?? null : value.activeRequestId };
    });
  }
  function openModal(kind: ModalKind) {
    setModalError(''); setMoreOpen(false);
    if (kind === 'save' && request) { setNameInput(request.name); setCollectionInput(request.collectionId ?? workspace.collections[0]?.id ?? ''); }
    if (kind === 'curl') setCurlInput('');
    if (kind === 'collection') setNameInput('');
    if (kind === 'environment') { setEnvDrafts(structuredClone(workspace.environments)); setEnvSelected(workspace.activeEnvironmentId ?? workspace.environments[0]?.id ?? null); }
    if (kind === 'settings') setSettingsDraft({ ...workspace.settings });
    setModal(kind);
  }
  function saveRequest() {
    if (!request || !nameInput.trim()) { setModalError(t("请输入请求名称")); return; }
    let collectionId = collectionInput;
    let collections = workspace.collections;
    if (!collectionId) { collectionId = id(); collections = [...collections, { id: collectionId, name: t("我的接口") }]; }
    setWorkspace(value => ({ ...value, collections, requests: value.requests.map(item => item.id === request.id ? { ...item, name: nameInput.trim(), collectionId, dirty: false } : item) }));
    setCollapsed(value => { const next = new Set(value); next.delete(collectionId); return next; });
    closeModal(); notify(t("请求已保存到集合"));
  }
  async function sendRequest() {
    if (!request || runningRef.current.has(request.id)) return;
    const snapshot = structuredClone(request), requestId = request.id, runId = id(), currentGeneration = generation.current;
    const envSnapshot = environment ? structuredClone(environment) : undefined;
    runningRef.current.set(requestId, runId);
    setRunning(value => ({ ...value, [requestId]: runId }));
    setResults(value => ({ ...value, [requestId]: {} }));
    const at = new Date().toISOString();
    let outcome: Result;
    try { outcome = { response: await bridge.sendRequest({ id: runId, request: snapshot, environment: envSnapshot, settings: { ...workspace.settings } }) }; }
    catch (error) { outcome = { error: error instanceof Error ? error.message : String(error) }; }
    finally { runningRef.current.delete(requestId); setRunning(value => { const next = { ...value }; delete next[requestId]; return next; }); }
    if (generation.current !== currentGeneration) return;
    setResults(value => ({ ...value, [requestId]: outcome }));
    setWorkspace(value => ({ ...value, history: [{ id: id(), at, request: snapshot, environmentName: envSnapshot?.name ?? t("无环境"),
      status: outcome.response?.status, duration: outcome.response?.duration, error: outcome.error }, ...value.history].slice(0, 100) }));
  }
  async function cancelRequest() {
    if (!activeRun) return;
    try { await bridge.cancelRequest(activeRun); } catch (error) { notify(t("取消失败：{0}", [translateMessage(error instanceof Error ? error.message : String(error), language)])); }
  }
  async function copyText(content: string, message = t("已复制到剪贴板")) {
    try { await navigator.clipboard.writeText(content); notify(message); return true; }
    catch { notify(t("剪贴板不可用，请选中文本后手动复制")); return false; }
  }
  async function copyCurl() {
    if (!request) return;
    try { if (await copyText(exportCurl(request, environment), t("cURL 命令已复制"))) { setCurlCopied(true); setTimeout(() => setCurlCopied(false), 2000); } }
    catch (error) { notify(error instanceof Error ? error.message : String(error)); }
  }
  async function saveFile(content: string, name: string, encoding: 'utf8' | 'base64' = 'utf8') {
    try { if (await bridge.saveFile({ name, content, encoding })) notify(t("文件已导出")); }
    catch (error) { notify(error instanceof Error ? error.message : String(error)); }
  }
  async function importWorkspace() {
    setMoreOpen(false);
    try { const value = await bridge.openWorkspaceFile(); if (value) { setImportDraft(validateWorkspace(value)); setModal('workspaceImport'); } }
    catch (error) { notify(error instanceof Error ? error.message : String(error)); }
  }
  function applyImport() {
    if (!importDraft) return;
    generation.current++;
    for (const runId of runningRef.current.values()) void bridge.cancelRequest(runId).catch(() => {});
    setWorkspace(importDraft); setResults({}); setLoadError(''); closeModal(); notify(t("工作区已导入"));
  }
  function restoreHistory(item: Workspace['history'][number]) {
    const restored = { ...structuredClone(item.request), id: id(), collectionId: null, name: t("{0} · 历史", [item.request.name]), dirty: true };
    setWorkspace(value => ({ ...value, requests: [...value.requests, restored], tabs: [...value.tabs, restored.id], activeRequestId: restored.id }));
    setRequestTab(restored.bodyType === 'none' ? 'params' : 'body'); notify(t("已恢复请求配置，可重新发送"));
  }
  function removeTargets(ids: string[]) {
    setWorkspace(value => {
      const tabs = value.tabs.filter(item => !ids.includes(item));
      return { ...value, requests: value.requests.filter(item => !ids.includes(item.id)), tabs,
        activeRequestId: ids.includes(value.activeRequestId ?? '') ? tabs[0] ?? null : value.activeRequestId };
    });
    for (const requestId of ids) { const runId = runningRef.current.get(requestId); if (runId) void bridge.cancelRequest(runId).catch(() => {}); }
    closeModal();
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || modal || !ready) return;
      if (event.key === 'Enter') { event.preventDefault(); void sendRequest(); }
      if (event.key.toLowerCase() === 's') { event.preventDefault(); if (request) openModal('save'); }
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); addRequest(); }
      if (event.key.toLowerCase() === 'l') { event.preventDefault(); urlRef.current?.focus(); urlRef.current?.select(); }
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
    };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  });
  const matching = useMemo(() => workspace.requests.filter(item => `${item.name} ${item.url} ${item.method}`.toLowerCase().includes(search.toLowerCase())), [workspace.requests, search]);
  const draftEnv = envDrafts.find(item => item.id === envSelected);
  const variableNames = (environment?.variables ?? []).filter(item => item.enabled && item.key.trim()).map(item => item.key.trim());
  let urlPreview = '';
  if (request?.url) { try { urlPreview = resolvedUrl(request, environment); } catch (error) { urlPreview = translateMessage(error instanceof Error ? error.message : '', language); } }

  function renderSidebarRequest(item: ApiRequest) {
    return <div className={`sidebar-request ${workspace.activeRequestId === item.id ? 'selected' : ''}`} key={item.id}>
      <button className="sidebar-request-main" onClick={() => openRequest(item.id)} title={item.url}><span className={`method-label method-${item.method.toLowerCase()}`}>{item.method}</span><span className="truncate">{item.name}</span></button>
      <button className="icon-button sidebar-request-delete" aria-label={t("删除请求 {0}", [item.name])} title={t("删除请求")} onClick={() => { setTargetId(item.id); openModal('deleteRequest'); }}><X size={13} /></button>
    </div>;
  }

  if (!ready) return <div className="loading-app"><img src="./logo.svg" alt="" /><span>Mypost</span><LoaderCircle className="spin" size={20} /></div>;
  return <I18nProvider language={language}><div className={`app platform-${bridge.platform}`}>
    <header className="titlebar"><div className="titlebar-left"><span className="tiny-logo">m</span><span>Mypost</span><span className="titlebar-divider" /><span className="titlebar-caption">{t("接口调试工作台")}</span></div><span className="titlebar-right"><span className="online-dot" />{t("本地工作区")}</span></header>
    <div className="workspace-layout">
      <aside className="sidebar">
        <div className="workspace-brand"><img src="./logo.svg" alt="Mypost" /><div><strong>{t("我的工作区")}</strong><span>YOUR API, IN FOCUS.</span></div><span className="workspace-badge">LOCAL</span></div>
        <div className="sidebar-actions"><button className="button button-secondary" onClick={() => addRequest()}><Plus size={15} />{t("新建请求")}</button><button className="button button-quiet import-button" onClick={() => openModal('curl')}><Upload size={14} />{t("导入")}</button></div>
        <label className="sidebar-search"><Search size={15} /><input ref={searchRef} aria-label={t("搜索集合与请求")} placeholder={t("搜索请求…")} value={search} onChange={event => setSearch(event.target.value)} /><kbd>{modKey} K</kbd></label>
        <div className="sidebar-tabs"><button className={sidebarTab === 'collections' ? 'active' : ''} onClick={() => setSidebarTab('collections')}><Layers3 size={15} />{t("集合")}</button><button className={sidebarTab === 'history' ? 'active' : ''} onClick={() => setSidebarTab('history')}><Clock3 size={15} />{t("历史")}</button></div>
        <div className="sidebar-content">
          {sidebarTab === 'collections' ? <>
            <div className="sidebar-section-heading"><span>{t("请求集合")}<b>{workspace.collections.length}</b></span><button className="icon-button" title={t("新建集合")} aria-label={t("新建集合")} onClick={() => openModal('collection')}><FolderPlus size={15} /></button></div>
            {workspace.collections.map(item => {
              const entries = matching.filter(entry => entry.collectionId === item.id);
              if (search && !entries.length && !item.name.toLowerCase().includes(search.toLowerCase())) return null;
              const expanded = !collapsed.has(item.id) || Boolean(search);
              return <div className="collection" key={item.id}>
                <div className="collection-heading"><button className="collection-name" onClick={() => setCollapsed(value => { const next = new Set(value); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}>{expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<Folder size={16} /><span className="truncate">{item.name}</span><small>{workspace.requests.filter(entry => entry.collectionId === item.id).length}</small></button><div className="collection-controls"><button className="icon-button" title={t("在此集合新建请求")} aria-label={t("在 {0} 新建请求", [item.name])} onClick={() => addRequest(item.id)}><Plus size={13} /></button><button className="icon-button" title={t("删除集合")} aria-label={t("删除集合 {0}", [item.name])} onClick={() => { setTargetId(item.id); openModal('deleteCollection'); }}><Trash2 size={13} /></button></div></div>
                {expanded && <div className="collection-requests">{entries.map(renderSidebarRequest)}{!entries.length && <span className="sidebar-empty-small">{t("此集合还没有请求")}</span>}</div>}
              </div>;
            })}
            {matching.some(item => !item.collectionId) && <><div className="sidebar-section-heading drafts-heading"><span>{t("草稿")}</span></div>{matching.filter(item => !item.collectionId).map(renderSidebarRequest)}</>}
            {search && !matching.length && <div className="sidebar-empty">{t("没有找到相关请求")}</div>}
            <button className="add-collection" onClick={() => openModal('collection')}><Plus size={14} />{t("创建新的集合")}</button>
          </> : <>
            <div className="sidebar-section-heading"><span>{t("最近请求")}<b>{workspace.history.length}</b></span>{Boolean(workspace.history.length) && <button className="text-button" onClick={() => { setWorkspace(value => ({ ...value, history: [] })); notify(t("历史记录已清空")); }}>{t("清空")}</button>}</div>
            {!workspace.history.length && <div className="sidebar-empty"><Clock3 size={26} /><p>{t('发送第一次请求后，记录会出现在这里。')}</p></div>}
            {workspace.history.filter(item => `${item.request.name} ${item.request.url}`.toLowerCase().includes(search.toLowerCase())).map(item => <button className="history-item" key={item.id} onClick={() => restoreHistory(item)} title={t("恢复此次请求配置")}><div><span className={`method-label method-${item.request.method.toLowerCase()}`}>{item.request.method}</span><span className="truncate">{item.request.name}</span><span className={`history-status ${!item.status || item.status >= 400 ? 'status-bad' : ''}`}>{item.status ?? 'ERR'}</span></div><small>{formatDate(item.at, language)} {formatTime(item.at, language)}<span>{item.environmentName}</span></small></button>)}
          </>}
        </div>
        <div className="sidebar-tip"><div className="tip-icon"><Terminal size={16} /></div><div><strong>{t("从一条 cURL 开始")}</strong><p>{t("粘贴命令，快速还原你的请求。")}</p><button onClick={() => openModal('curl')}>{t("导入 cURL")}<ArrowUpRight size={12} /></button></div></div>
        <div className="sidebar-bottom"><button onClick={() => openModal('environment')}><Globe2 size={16} />{t("环境管理")}</button><button className="icon-button" title={t("设置")} aria-label={t("设置")} onClick={() => openModal('settings')}><Settings2 size={17} /></button><button className="icon-button" title={t("快捷键")} aria-label={t("快捷键帮助")} onClick={() => openModal('shortcuts')}><CircleHelp size={17} /></button></div>
      </aside>
      <main className="main-workspace">
        <div className="workspace-toolbar"><div className="workspace-breadcrumb"><Folder size={14} /><span>{t("我的工作区")}</span><ChevronRight size={13} /><strong>{collection?.name ?? t("请求草稿")}</strong></div><div className="toolbar-actions"><div className="environment-picker"><span className="online-dot" /><select aria-label={t("选择环境")} value={workspace.activeEnvironmentId ?? ''} onChange={event => setWorkspace(value => ({ ...value, activeEnvironmentId: event.target.value || null }))}><option value="">{t("无环境")}</option>{workspace.environments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={12} /></div><button className="icon-button" title={t("编辑环境变量")} aria-label={t("编辑环境变量")} onClick={() => openModal('environment')}><SlidersHorizontal size={17} /></button><span className="toolbar-separator" /><div className="menu-anchor"><button className="icon-button" title={t("工作区操作")} aria-label={t("工作区操作")} onClick={event => { event.stopPropagation(); setMoreOpen(value => !value); }}><MoreHorizontal size={19} /></button>{moreOpen && <div className="dropdown-menu"><button onClick={() => void saveFile(JSON.stringify(workspace, null, 2), 'mypost-workspace.json')}><ArrowDownToLine size={15} />{t("导出工作区")}</button><button onClick={() => void importWorkspace()}><Upload size={15} />{t("导入工作区")}</button></div>}</div></div></div>
        <div className="request-tabs" role="tablist" aria-label={t("已打开的请求")}>{workspace.tabs.map(requestId => {
          const item = workspace.requests.find(entry => entry.id === requestId); if (!item) return null;
          return <div className={`request-document-tab ${requestId === workspace.activeRequestId ? 'active' : ''}`} key={requestId}><button role="tab" aria-selected={requestId === workspace.activeRequestId} onClick={() => openRequest(requestId)}><span className={`method-label method-${item.method.toLowerCase()}`}>{item.method}</span><span className="truncate">{item.name}</span>{item.dirty && <span className="dirty-dot" title={t("配置已修改")} />}{running[requestId] && <LoaderCircle size={12} className="spin" />}</button><button className="tab-close" aria-label={t("关闭 {0}", [item.name])} onClick={() => closeRequestTab(requestId)}><X size={13} /></button></div>;
        })}<button className="icon-button new-tab" aria-label={t("新建请求标签页")} title={t("新建请求 {0} N", [modKey])} onClick={() => addRequest()}><Plus size={17} /></button></div>
        {(loadError || saveError) && <div className="persistence-error" role="alert">{loadError ? t("{0}。当前临时工作区不会覆盖原数据，可通过导入工作区恢复。", [translateMessage(loadError, language)]) : t("自动保存失败：{0}", [translateMessage(saveError, language)])}<button className="text-button" onClick={() => void saveFile(JSON.stringify(workspace, null, 2), 'mypost-recovery.json')}>{t("导出备份")}</button></div>}
        {request ? <>
          <section className="request-panel" style={{ height: editorHeight }}>
            <div className="request-heading"><div><span className="request-heading-icon"><Send size={16} /></span><h1>{request.name}</h1>{request.dirty && <span className="draft-label">{t("已修改")}</span>}</div><div className="request-heading-actions"><button className="text-button" title={t("复制请求")} aria-label={t("复制当前请求")} onClick={() => addRequest(request.collectionId, request)}><Copy size={14} /></button><button className="button button-quiet save-button" onClick={() => openModal('save')}><ArrowDownToLine size={14} />{t("保存")}<kbd>{modKey} S</kbd></button></div></div>
            <form className="url-bar" onSubmit={event => { event.preventDefault(); if (!activeRun) void sendRequest(); }}><div className="url-input-group"><div className={`method-select method-${request.method.toLowerCase()}`}><select aria-label={t("HTTP 方法")} value={request.method} onChange={event => updateRequest({ method: event.target.value as ApiRequest['method'] })}>{methods.map(method => <option key={method}>{method}</option>)}</select><ChevronDown size={13} /></div><input ref={urlRef} aria-label={t("请求 URL")} className="mono url-input" placeholder="https://api.example.com/v1/users" value={request.url} onChange={event => updateRequest({ url: event.target.value })} spellCheck={false} autoComplete="off" title={urlPreview} /></div>{activeRun ? <button className="button button-primary send-button cancel-button" type="button" onClick={() => void cancelRequest()}><Square size={13} fill="currentColor" />{t("取消")}</button> : <button className="button button-primary send-button" type="submit"><span>{t("发送")}</span><Send size={15} /><kbd>{modKey} ↵</kbd></button>}</form>
            <div className="request-options"><div className="option-tabs" role="tablist" aria-label={t("请求配置")}>{(Object.keys(tabLabels) as RequestTab[]).map(tab => <button className={requestTab === tab ? 'active' : ''} role="tab" aria-selected={requestTab === tab} onClick={() => setRequestTab(tab)} key={tab}>{tabLabels[tab]}{tab === 'auth' && request.auth.type !== 'none' && <span className="option-dot" />}{(tab === 'params' || tab === 'headers') && request[tab].filter(item => item.enabled && item.key.trim()).length > 0 && <span className="tab-count">{request[tab].filter(item => item.enabled && item.key.trim()).length}</span>}{tab === 'body' && request.bodyType !== 'none' && <span className="option-dot" />}</button>)}</div><button className="curl-button" onClick={() => void copyCurl()} title={t("复制为 cURL")}>{curlCopied ? <Check size={14} /> : <Code2 size={14} />}<span>{curlCopied ? t("已复制") : 'cURL'}</span></button></div>
            <div className="request-editor">
              {(requestTab === 'params' || requestTab === 'headers') && <KeyValueEditor rows={request[requestTab]} onChange={rows => updateRequest({ [requestTab]: rows })} keyLabel={requestTab === 'params' ? t("参数名") : t("Header 名称")} valueLabel={requestTab === 'params' ? t("参数值") : t("Header 值")} />}
              {requestTab === 'auth' && <div className="auth-editor"><div className="auth-type"><label htmlFor="auth-type">{t("认证方式")}</label><select id="auth-type" value={request.auth.type} onChange={event => updateRequest({ auth: { ...request.auth, type: event.target.value as ApiRequest['auth']['type'] } })}><option value="none">{t("No Auth · 无认证")}</option><option value="bearer">Bearer Token</option><option value="basic">Basic Auth</option></select><p>{t('认证信息会自动添加到 Authorization 请求头。')}</p></div><div className="auth-fields">{request.auth.type === 'none' ? <div className="auth-empty"><ShieldCheck size={24} /><span>{t("此请求不使用认证。")}</span></div> : request.auth.type === 'bearer' ? <label className="field-label">Token<input className="mono" type="password" placeholder={t("输入 Token 或 {{token}}")} value={request.auth.token} onChange={event => updateRequest({ auth: { ...request.auth, token: event.target.value } })} /></label> : <><label className="field-label">{t("用户名")}<input value={request.auth.username} autoComplete="off" onChange={event => updateRequest({ auth: { ...request.auth, username: event.target.value } })} /></label><label className="field-label">{t("密码")}<input type="password" autoComplete="off" value={request.auth.password} onChange={event => updateRequest({ auth: { ...request.auth, password: event.target.value } })} /></label></>}</div></div>}
              {requestTab === 'body' && <div className="body-editor"><div className="body-types">{([{ value: 'none', label: t("无") }, { value: 'json', label: 'JSON' }, { value: 'text', label: 'Text' }, { value: 'urlencoded', label: 'x-www-form-urlencoded' }] as const).map(item => <label key={item.value}><input type="radio" name="body-type" checked={request.bodyType === item.value} onChange={() => updateRequest({ bodyType: item.value })} />{item.label}</label>)}{request.bodyType === 'json' && <button className="text-button format-json" onClick={() => { try { updateRequest({ body: JSON.stringify(JSON.parse(request.body), null, 2) }); } catch { notify(t("请先输入有效的 JSON")); } }}><Braces size={12} />{t("格式化")}</button>}</div>{['GET', 'HEAD'].includes(request.method) && request.bodyType !== 'none' && <div className="body-notice">{t('{0} 请求不发送请求体，切换到 POST / PUT / PATCH 后生效。', [request.method])}</div>}{request.bodyType === 'none' ? <div className="body-empty"><Braces size={22} /><span>{t("选择一种格式，为请求添加内容。")}</span></div> : request.bodyType === 'urlencoded' ? <KeyValueEditor rows={request.bodyRows} onChange={rows => updateRequest({ bodyRows: rows })} /> : <textarea className="body-textarea mono" aria-label={t("请求体内容")} spellCheck={false} value={request.body} placeholder={request.bodyType === 'json' ? '{\n  "message": "Hello, Mypost"\n}' : t("输入请求内容…")} onChange={event => updateRequest({ body: event.target.value })} />}</div>}
            </div>
            <div className="request-footnote"><span><span className="variable-symbol">{'{{ }}'}</span>{t("使用")} <code>{t("{{变量名}}")}</code> {t("引用环境变量")}</span>{variableNames.length > 0 && <button onClick={() => openModal('environment')}><span className="online-dot" />{t('{0} 个可用变量', [variableNames.length])}<ChevronRight size={12} /></button>}</div>
          </section>
          <div className="panel-resizer" role="separator" aria-label={t("调整请求面板高度")} aria-orientation="horizontal" tabIndex={0} onKeyDown={event => { if (['ArrowUp', 'ArrowDown'].includes(event.key)) { event.preventDefault(); setEditorHeight(height => Math.max(230, Math.min(600, height + (event.key === 'ArrowUp' ? -20 : 20)))); } }} onPointerDown={event => {
            const startY = event.clientY, startHeight = editorHeight, target = event.currentTarget;
            target.setPointerCapture(event.pointerId);
            const move = (moving: PointerEvent) => setEditorHeight(Math.max(230, Math.min(window.innerHeight - 350, startHeight + moving.clientY - startY)));
            const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); };
            target.addEventListener('pointermove', move); target.addEventListener('pointerup', up, { once: true });
          }}><span /></div>
          <section className="response-panel">
            <div className="response-heading"><div><h2>{t("响应")}</h2><span className="response-heading-note">RESPONSE</span></div>{response && <div className="response-metrics"><span className={`status-pill ${response.status >= 400 ? 'status-bad' : response.status >= 300 ? 'status-redirect' : ''}`}><span />{response.status} {response.statusText}</span><span><Clock3 size={12} />{response.duration} ms</span><span><ArrowDownToLine size={12} />{formatSize(response.size)}</span></div>}{activeRun && <span className="sending-label"><LoaderCircle size={13} className="spin" />{t("请求进行中")}</span>}</div>
            {response ? <><div className="response-toolbar"><div className="option-tabs"><button className={responseTab === 'body' ? 'active' : ''} onClick={() => setResponseTab('body')}>{t("响应体")}</button><button className={responseTab === 'headers' ? 'active' : ''} onClick={() => setResponseTab('headers')}>{t("响应头")}<span className="tab-count">{response.headers.length}</span></button></div><div className="response-tools">{responseTab === 'body' && !response.isBinary && <div className="segmented-control"><button className={pretty ? 'active' : ''} onClick={() => setPretty(true)}>Pretty</button><button className={!pretty ? 'active' : ''} onClick={() => setPretty(false)}>Raw</button></div>}<button className="icon-button" aria-label={t("搜索响应")} title={t("搜索响应")} onClick={() => setShowResponseSearch(value => !value)}><Search size={15} /></button><button className="icon-button" aria-label={t("复制响应")} title={t("复制响应")} onClick={() => void copyText(responseTab === 'headers' ? response.headers.map(item => `${item.key}: ${item.value}`).join('\n') : response.isBinary ? response.base64 ?? '' : pretty ? prettyJson(response.body) : response.body)}><Copy size={14} /></button><button className="icon-button" aria-label={t("下载响应")} title={t("下载完整响应")} onClick={() => void saveFile(response.isBinary ? response.base64 ?? '' : response.body, response.isBinary ? 'response.bin' : response.headers.some(item => item.key === 'content-type' && item.value.includes('json')) ? 'response.json' : 'response.txt', response.isBinary ? 'base64' : 'utf8')}><ArrowDownToLine size={15} /></button></div></div>{showResponseSearch && <label className="response-search"><Search size={14} /><input autoFocus aria-label={t("搜索响应内容")} placeholder={t("输入内容，高亮匹配行…")} value={responseSearch} onChange={event => setResponseSearch(event.target.value)} /><button className="icon-button" aria-label={t("关闭响应搜索")} onClick={() => { setShowResponseSearch(false); setResponseSearch(''); }}><X size={13} /></button></label>}
              <div className="response-content">{responseTab === 'headers' ? <div className="response-headers"><div className="kv-head"><span>{t("名称")}</span><span>{t("值")}</span></div>{response.headers.filter(item => `${item.key} ${item.value}`.toLowerCase().includes(responseSearch.toLowerCase())).map(item => <div className="response-header-row" key={item.key}><code>{item.key}</code><code>{item.value}</code></div>)}</div> : response.isBinary ? <div className="binary-response"><ArrowDownToLine size={32} /><h3>{t("二进制响应")}</h3><p>{response.headers.find(item => item.key === 'content-type')?.value} · {formatSize(response.size)}</p><button className="button button-secondary" onClick={() => void saveFile(response.base64 ?? '', 'response.bin', 'base64')}>{t("下载响应文件")}</button></div> : response.body ? <CodeViewer content={response.body} search={responseSearch} pretty={pretty} /> : <div className="body-empty"><Check size={25} /><span>{t("请求已完成，响应体为空。")}</span></div>}</div><div className="response-footer"><span>{response.headers.find(item => item.key === 'content-type')?.value ?? t("未指定 Content-Type")}</span><span>{response.redirected ? t("已跟随重定向 · ") : ''}{formatTime(response.receivedAt, language)} {t("接收")}</span></div></> : result?.error ? <div className="response-error" role="alert"><div className="error-illustration"><X size={28} /></div><h3>{translateMessage(result.error, language) === t('请求已取消') ? t("请求已取消") : t("未能完成请求")}</h3><p>{translateMessage(result.error, language)}</p><button className="button button-secondary" onClick={() => void sendRequest()}><Send size={14} />{t("重新发送")}</button></div> : <div className="response-empty">{activeRun ? <><div className="empty-orbit loading-orbit"><LoaderCircle size={36} className="spin" /></div><h3>{t("正在等待响应…")}</h3><p>{t("请求已发送，正在连接你的接口。")}</p><button className="text-button" onClick={() => void cancelRequest()}>{t("取消请求")}</button></> : <><div className="empty-orbit"><span className="orbit-dot dot-one" /><span className="orbit-dot dot-two" /><div className="empty-icon"><Send size={30} strokeWidth={1.4} /></div><span className="orbit-code"><Braces size={15} /></span></div><h3>{t("让每次请求，清晰可见。")}</h3><p>{t("点击「发送」，在这里查看接口的响应。")}</p><div className="empty-shortcut"><kbd>{modKey}</kbd><span>+</span><kbd>Enter</kbd><span>{t("发送请求")}</span></div><div className="empty-features"><span><ShieldCheck size={13} />{t("本地存储")}</span><span><Globe2 size={13} />{t("跨域调试")}</span><span><Braces size={13} />{t("JSON 格式化")}</span></div></>}</div>}
          </section>
        </> : <div className="welcome"><div className="empty-icon"><Sparkles size={32} /></div><h1>{t("准备好下一次请求。")}</h1><p>{t("从集合中打开一个接口，或创建新的请求。")}</p><button className="button button-primary" onClick={() => addRequest()}><Plus size={16} />{t("新建请求")}</button></div>}
        <footer className="statusbar"><div><span className="online-dot" />{loadError ? t("临时工作区") : saveError ? t("保存失败") : saving ? t("正在保存…") : t("配置已自动保存")}<span className="statusbar-divider" /><span>{t('{0} 个请求', [workspace.requests.length])}</span></div><button onClick={() => openModal('shortcuts')}><Terminal size={12} />{t("快捷键")}</button><span className="version-label">Mypost v0.1.0</span></footer>
      </main>
    </div>
    {toast && <div className="toast" role="status"><Check size={15} />{translateMessage(toast, language)}</div>}
    {modal && <Modal title={modal === 'save' ? t("保存请求") : modal === 'curl' ? t("导入 cURL") : modal === 'environment' ? t("环境管理") : modal === 'settings' ? t("工作台设置") : modal === 'collection' ? t("新建集合") : modal === 'shortcuts' ? t("键盘快捷键") : modal === 'workspaceImport' ? t("导入工作区") : modal === 'deleteCollection' ? t("删除集合") : t("删除请求")} subtitle={modal === 'environment' ? t("在 URL、参数、请求头和请求体中使用 {{变量名}}。") : modal === 'curl' ? t("粘贴 cURL 命令，还原 URL、请求头、认证和请求体。") : undefined} wide={modal === 'environment' || modal === 'curl'} onClose={closeModal}>
      {modal === 'save' && <form onSubmit={event => { event.preventDefault(); saveRequest(); }}><label className="field-label">{t("请求名称")}<input value={nameInput} onChange={event => setNameInput(event.target.value)} placeholder={t("例如：获取用户列表")} /></label><label className="field-label">{t("保存到集合")}<select value={collectionInput} onChange={event => setCollectionInput(event.target.value)}>{!workspace.collections.length && <option value="">{t("自动创建「我的接口」")}</option>}{workspace.collections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{modalError && <p className="form-error">{translateMessage(modalError, language)}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={closeModal}>{t("取消")}</button><button className="button button-primary" type="submit">{t("保存请求")}</button></div></form>}
      {modal === 'collection' && <form onSubmit={event => { event.preventDefault(); if (!nameInput.trim()) { setModalError(t("请输入集合名称")); return; } setWorkspace(value => ({ ...value, collections: [...value.collections, { id: id(), name: nameInput.trim() }] })); closeModal(); }}><label className="field-label">{t("集合名称")}<input placeholder={t("例如：用户服务")} value={nameInput} onChange={event => setNameInput(event.target.value)} /></label>{modalError && <p className="form-error">{translateMessage(modalError, language)}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={closeModal}>{t("取消")}</button><button type="submit" className="button button-primary">{t("创建集合")}</button></div></form>}
      {modal === 'curl' && <form onSubmit={event => { event.preventDefault(); try { const item = { ...importCurl(curlInput), name: t('导入的请求') }; setWorkspace(value => ({ ...value, requests: [...value.requests, item], tabs: [...value.tabs, item.id], activeRequestId: item.id })); setRequestTab(item.bodyType === 'none' ? 'params' : 'body'); closeModal(); notify(t("cURL 请求已导入")); } catch (error) { setModalError(error instanceof Error ? error.message : String(error)); } }}><textarea className="curl-input mono" aria-label={t("cURL 命令")} placeholder={'curl --request GET \\\n  \'https://httpbin.org/get\' \\\n  --header \'Accept: application/json\''} value={curlInput} onChange={event => setCurlInput(event.target.value)} spellCheck={false} /><p className="modal-note">{t("支持 -X、-H、-d、--data-raw、--data-urlencode、-u；导入后按工作台设置处理重定向。不会执行命令。")}</p>{modalError && <p className="form-error">{translateMessage(modalError, language)}</p>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={closeModal}>{t("取消")}</button><button type="submit" className="button button-primary"><Upload size={14} />{t("导入请求")}</button></div></form>}
      {modal === 'environment' && <><div className="environment-manager"><div className="environment-list">{envDrafts.map(item => <div key={item.id} className={`environment-list-item ${envSelected === item.id ? 'active' : ''}`}><button onClick={() => setEnvSelected(item.id)}><Globe2 size={14} /><span className="truncate">{item.name}</span></button><button className="icon-button" aria-label={t("删除环境 {0}", [item.name])} onClick={() => { setEnvDrafts(value => value.filter(entry => entry.id !== item.id)); if (envSelected === item.id) setEnvSelected(envDrafts.find(entry => entry.id !== item.id)?.id ?? null); }}><X size={12} /></button></div>)}<button className="add-environment" onClick={() => { const item = { id: id(), name: t("新环境"), variables: [row('baseUrl', '')] }; setEnvDrafts(value => [...value, item]); setEnvSelected(item.id); }}><Plus size={14} />{t("新建环境")}</button></div><div className="environment-detail">{draftEnv ? <><label className="field-label">{t("环境名称")}<input value={draftEnv.name} onChange={event => setEnvDrafts(value => value.map(item => item.id === draftEnv.id ? { ...item, name: event.target.value } : item))} /></label><div className="variables-heading"><strong>{t("环境变量")}</strong><button className="text-button" onClick={() => setEnvValuesVisible(value => !value)}>{envValuesVisible ? t("隐藏值") : t("显示值")}</button></div><KeyValueEditor rows={draftEnv.variables} sensitive={!envValuesVisible} keyLabel={t("变量名")} valueLabel={t("变量值")} onChange={(variables: Row[]) => setEnvDrafts(value => value.map(item => item.id === draftEnv.id ? { ...item, variables } : item))} /><p className="modal-note">{t("变量和认证信息保存在本机文件中。导出工作区时会一并包含。")}</p></> : <div className="body-empty"><Globe2 size={24} /><span>{t("新建一个环境，开始配置变量。")}</span></div>}</div></div>{modalError && <p className="form-error">{translateMessage(modalError, language)}</p>}<div className="modal-actions"><button className="button button-secondary" onClick={closeModal}>{t("取消")}</button><button className="button button-primary" onClick={() => {
        if (envDrafts.some(item => !item.name.trim())) { setModalError(t("环境名称不能为空")); return; }
        for (const item of envDrafts) { const keys = item.variables.filter(entry => entry.enabled && entry.key.trim()).map(entry => entry.key.trim()); if (new Set(keys).size !== keys.length) { setModalError(t("「{0}」包含重复变量名", [item.name])); return; } }
        setWorkspace(value => ({ ...value, environments: envDrafts, activeEnvironmentId: envDrafts.some(item => item.id === value.activeEnvironmentId) ? value.activeEnvironmentId : envDrafts[0]?.id ?? null })); closeModal(); notify(t("环境配置已保存"));
      }}>{t("保存环境")}</button></div></>}
      {modal === 'settings' && <><label className="field-label">{t("软件语言")}<select aria-label={t('软件语言')} value={settingsDraft.language} onChange={event => setSettingsDraft(value => ({ ...value, language: event.target.value as typeof value.language }))}><option value="zh-CN">简体中文</option><option value="en">English</option></select><small>{t("保存后立即生效，无需重启。")}</small></label><label className="field-label">{t("请求超时（毫秒）")}<input type="number" min={100} max={300000} step={100} value={settingsDraft.timeoutMs} onChange={event => setSettingsDraft(value => ({ ...value, timeoutMs: Number(event.target.value) }))} /><small>{t("范围 100–300000 ms，默认 30000 ms。")}</small></label><label className="setting-check"><input type="checkbox" checked={settingsDraft.followRedirects} onChange={event => setSettingsDraft(value => ({ ...value, followRedirects: event.target.checked }))} /><div><strong>{t("自动跟随重定向")}</strong><p>{t("关闭后可直接查看 301 / 302 等原始响应。")}</p></div></label><div className="settings-info"><ShieldCheck size={18} /><div><strong>{t("本地优先的工作台")}</strong><p>{t("集合、环境与历史保存在这台设备上，无需账号。响应体最多读取 20 MB，请求体最多 10 MB。")}</p><p>{bridge.platform === 'web' ? t("当前为浏览器开发预览。桌面模式请运行 npm run dev。") : t("当前平台：{0}", [bridge.platform === 'darwin' ? 'macOS' : bridge.platform === 'win32' ? 'Windows' : bridge.platform])}</p></div></div>{modalError && <p className="form-error">{translateMessage(modalError, language)}</p>}<div className="modal-actions"><button className="button button-secondary" onClick={closeModal}>{t("取消")}</button><button className="button button-primary" onClick={() => { if (!Number.isFinite(settingsDraft.timeoutMs) || settingsDraft.timeoutMs < 100 || settingsDraft.timeoutMs > 300000) { setModalError(t("超时时间必须在 100–300000 毫秒之间")); return; } setWorkspace(value => ({ ...value, settings: settingsDraft })); closeModal(); notify(t("设置已保存")); }}>{t("保存设置")}</button></div></>}
      {modal === 'shortcuts' && <div className="shortcuts">{[[t("发送当前请求"), `${modKey} + Enter`], [t("保存到集合"), `${modKey} + S`], [t("新建请求"), `${modKey} + N`], [t("聚焦 URL"), `${modKey} + L`], [t("搜索请求"), `${modKey} + K`], [t("关闭对话框"), 'Esc']].map(([label, key]) => <div key={label}><span>{label}</span><kbd>{key}</kbd></div>)}</div>}
      {modal === 'workspaceImport' && <><p className="confirmation-text">{t('即将导入 {0} 个集合、{1} 个请求和 {2} 个环境，替换当前工作区。可先导出当前配置作为备份。', [importDraft?.collections.length, importDraft?.requests.length, importDraft?.environments.length])}</p><div className="modal-actions"><button className="button button-secondary" onClick={() => void saveFile(JSON.stringify(workspace, null, 2), 'mypost-backup.json')}>{t("导出当前配置")}</button><button className="button button-primary" onClick={applyImport}>{t("替换并导入")}</button></div></>}
      {modal === 'deleteRequest' && <><p className="confirmation-text">{t('删除「{0}」后，它会从工作区中移除。', [workspace.requests.find(item => item.id === targetId)?.name])}</p><div className="modal-actions"><button className="button button-secondary" onClick={closeModal}>{t("取消")}</button><button className="button button-danger" onClick={() => removeTargets([targetId])}>{t("删除请求")}</button></div></>}
      {modal === 'deleteCollection' && <><p className="confirmation-text">{t('删除「{0}」及其中 {1} 个请求。', [workspace.collections.find(item => item.id === targetId)?.name, workspace.requests.filter(item => item.collectionId === targetId).length])}</p><div className="modal-actions"><button className="button button-secondary" onClick={closeModal}>{t("取消")}</button><button className="button button-danger" onClick={() => { const ids = workspace.requests.filter(item => item.collectionId === targetId).map(item => item.id); removeTargets(ids); setWorkspace(value => ({ ...value, collections: value.collections.filter(item => item.id !== targetId) })); }}>{t("删除集合")}</button></div></>}
    </Modal>}
  </div></I18nProvider>;
}
