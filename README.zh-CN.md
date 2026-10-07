# Mypost

[English](README.md) · 简体中文

开源、本地优先的 Windows / macOS API 接口管理与调试工具。使用集合组织 REST 请求、维护环境变量、调试 HTTP 响应，Electron + React + TypeScript，中英文界面，本地保存，无需登录。

当前版本 `v0.1.0` 处于早期开发阶段。欢迎通过 [Issues](https://github.com/Wayne-HJ/Mypost/issues) 反馈问题和需求，参与开发请阅读 [贡献指南](CONTRIBUTING.md)。项目采用 [MIT 许可证](LICENSE)。

## 快速运行

需要 Node.js 22.12+（建议 Node.js 24 LTS）。

```bash
git clone https://github.com/Wayne-HJ/Mypost.git
cd Mypost
npm ci
npm run dev
```

`npm run dev` 启动桌面窗口及本机 Vite 服务。浏览器开发预览可单独运行 `npm run dev:web`，打开 `http://127.0.0.1:5173`。浏览器预览必须保持 Vite 运行，生产版通过 Electron 主进程发送请求。

如需离线验证，在另一终端启动本地测试服务：

```bash
npm run fixture
```

在界面右上角选择「本地开发」环境，发送「入门示例」中的 GET / POST / DELETE 请求。测试服务默认监听 `127.0.0.1:8088`，另提供 `/delay/10`、`/redirect`、`/binary`、`/status/422` 等测试接口。默认「公共测试」环境使用 httpbin.org，需要联网。

## 已实现

- 在左下角「设置 → 软件语言」选择「简体中文」或「English」，保存后立即切换，并在重启后保留选择。工作台、对话框、提示、错误和桌面菜单随语言切换。
- GET、POST、PUT、PATCH、DELETE、HEAD、OPTIONS；同时打开多个请求标签。
- Query 参数和请求头逐行编辑、启用、禁用，保留重复字段。
- 无请求体、JSON、纯文本、URL 编码表单；JSON 格式化。
- No Auth、Bearer Token、Basic Auth。
- 环境配置和 `{{变量名}}` 替换，适用于 URL、参数、Header、请求体与认证。
- 请求集合、草稿自动保存、命名保存、复制、搜索和删除。
- 真实响应状态码、耗时、大小、响应头、JSON 高亮、Raw、搜索、复制、下载。
- 请求超时、取消、重定向设置、网络错误提示；HTTP 4xx / 5xx 正常展示响应。
- 最近 100 次请求记录，可恢复配置后重新发送。历史保存请求快照，不保存响应体。
- cURL 文本导入和复制；Mypost 工作区 JSON 导入、导出。
- 二进制响应以原始字节下载；文本按响应 charset 解码。
- 键盘快捷键与可拖动的请求/响应分隔条。

请求体上限 10 MB，响应上限 20 MB，界面预览最多 250 KB。完整响应可复制、下载。GET / HEAD 不发送请求体。

快捷键：`Cmd/Ctrl + Enter` 发送、`Cmd/Ctrl + S` 保存到集合、`Cmd/Ctrl + N` 新请求、`Cmd/Ctrl + L` 聚焦 URL、`Cmd/Ctrl + K` 搜索请求、`Esc` 关闭对话框。

## 构建与安装包

```bash
npm test             # 实际 HTTP 服务集成测试 + 工作区/cURL 测试
npm run build        # TypeScript 检查 + 前端构建
npm run start        # 运行已构建桌面应用
npm run dist:dir     # 本机未压缩桌面应用
npm run dist:mac     # macOS DMG / ZIP，Apple Silicon + Intel
npm run dist:win     # Windows NSIS 安装包，x64 + ARM64
```

输出在 `release/`。推荐分别在 macOS 和 Windows 构建各自安装包，仓库自带 GitHub Actions 双平台构建流程。Windows 构建在本项目当前 macOS 环境未实机验证。

生成的安装包保存在本机 `release/`，不提交到 Git。也可在成功的 [GitHub Actions 构建](https://github.com/Wayne-HJ/Mypost/actions/workflows/build.yml) 中下载构建产物。当前工作流不会自动发布 GitHub Release。macOS 压缩包解压后可打开 `Mypost.app`。从 macOS 交叉构建 Windows 时可跳过 EXE 资源编辑；在 Windows 上运行默认打包命令会应用完整资源配置。

本机验证：28 项自动化测试通过；macOS 独立应用启动、真实 GET / POST、cURL 导入、参数连续输入、命名保存及重启恢复均通过。中英文即时切换、原生菜单切换、重启后语言恢复及旧工作区迁移已验证。Windows 安装包已交叉构建成功，安装与运行仍需 Windows 实机验证。

开发安装包不使用开发者证书。macOS 使用 ad-hoc 签名（`mac.identity: "-"`），Windows 未签名。正式分发时请修改 `mac.identity` 并配置开发者代码签名，macOS 还需公证；按 [electron-builder 代码签名文档](https://www.electron.build/code-signing.html)配置发布环境。

## 本地数据

语言偏好保存于工作区的 `settings.language`（`zh-CN` / `en`）。旧版工作区缺少此项时默认中文；导入、导出包含语言偏好。切换语言保持已有集合、请求名称、环境配置和响应内容原样。

桌面数据写入 Electron `userData/workspace.json`，采用串行队列和临时文件重命名，避免并发保存覆盖。通常位于：

- macOS：`~/Library/Application Support/Mypost/workspace.json`。
- Windows：`%APPDATA%/Mypost/workspace.json`。
- 浏览器开发预览：当前 origin 的 localStorage，独立于桌面数据。

集合、环境变量、认证及历史请求快照为本机明文数据；工作区导出也包含这些配置。响应内容不执行 HTML 或 JavaScript。本地文件损坏时会显示读取错误并暂停自动覆盖，可导出当前临时工作区或导入备份。

## 项目结构

```text
electron/       桌面生命周期、受限 IPC、HTTP 引擎与原子保存
src/            React 工作台、请求模型、cURL 解析、桌面桥接
shared/         前端和桌面端共用的语言资源与格式化
scripts/        桌面开发启动器、本地 HTTP 测试服务
tests/          模型、存储与真实 HTTP 集成测试
.github/        Windows/macOS 安装包 CI
```

桌面渲染进程遵循 [Electron 官方安全建议](https://www.electronjs.org/docs/latest/tutorial/security/)：context isolation、sandbox、禁用 Node integration、限定 IPC 接口、阻止页面导航和窗口弹出。HTTP 请求在主进程使用 Node fetch，遵循系统默认 TLS 验证。

第一版聚焦 REST / HTTP。尚未提供 multipart 文件上传、Cookie 管理、代理配置、客户端证书、WebSocket、GraphQL 专用编辑器、自动化断言/批量运行、Postman Collection 格式兼容或云端团队同步。当前 cURL 解析器支持常用独立参数，不支持文件引用、组合短选项或任意 shell 脚本；复制的 cURL 使用 POSIX shell 引号。
