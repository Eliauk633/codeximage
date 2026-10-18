# Agnes 网关

这是独立于 Electron 客户端的 Node.js 服务。所有本地账号通过同一网关共用 Agnes Key 和额度；网关不创建用户 Key 表，也不保存聊天、请求日志或凭据文件。

运行环境为 Node.js 24。无新增运行时依赖。

## 配置与启动

优先编辑项目根目录的 `.env` 文件，也支持通过进程环境配置（环境变量优先）：

| 变量 | 含义 |
| --- | --- |
| `AGNES_API_KEY` | 服务端持有的 Agnes Key，必填；不能发给客户端 |
| `STUDIO_GATEWAY_TOKEN` | 网关访问凭证，必填；32–512 个不含空格的可打印 ASCII 字符 |
| `STUDIO_GATEWAY_HOST` | 默认 `127.0.0.1` |
| `STUDIO_GATEWAY_PORT` | 默认 `8787` |

请从 `.env.example` 创建本机 `.env`，填写自己的 Agnes Key，并生成至少32位随机服务凭证。保持 `STUDIO_GATEWAY_TOKEN` 与 `CODEX_STUDIO_AI_TOKEN` 一致；将配置文件权限限制为当前用户可读。仓库不提供真实密钥或预置凭证。

在项目目录分别启动模型服务与客户端：一个终端执行 `npm run ai:server`，另一个终端执行 `npm start`。已运行的服务和客户端都需要重启。缺少Key时服务启动失败，程序不输出凭据。`.env.example` 是不含凭据的空白模板。

部署后，服务器文件保留 `AGNES_API_KEY` 和 `STUDIO_GATEWAY_TOKEN`；客户端文件只保留 `CODEX_STUDIO_AI_URL` 与 `CODEX_STUDIO_AI_TOKEN`，不能分发本机包含Agnes Key的完整文件。

服务目前默认只监听本机。远程部署需由 HTTPS 反向代理接入，并关闭 SSE 缓冲；本轮未执行部署。服务访问凭证由所有客户端共享，属于服务入口授权，不是逐用户身份或配额控制。

## 客户端配置

Electron 主进程从启动环境或根目录 `.env` 的白名单字段读取以下配置，所有本地账号共用，不写入用户工作区：

| 变量 | 含义 |
| --- | --- |
| `CODEX_STUDIO_AI_URL` | 网关根地址，默认 `http://127.0.0.1:8787`；远程地址必须是 HTTPS |
| `CODEX_STUDIO_AI_TOKEN` | 与服务端 `STUDIO_GATEWAY_TOKEN` 相同的访问凭证，不是 Agnes Key |

配置完成后运行 `npm run build` 和 `npm start`。运行中的客户端须重新启动才读取新的环境或文件。设置 → 配置 → 模型服务显示地址与配置状态；“已配置”只表示本地配置齐全，不代表已验证上游。不能把 `AGNES_API_KEY` 放进客户端或使用 `VITE_` 变量。

客户端发送最近完整的文字回合（最多40条、32000字符），单次输入最多16000字符；不上传项目路径、本地账号ID或附件。回复支持停止、失败重试和按账号本地保存。重启后未完成的回复标记为已停止，不自动重新请求；流式片段只在内存，正常结束/停止/失败时保存，强制退出可能丢失未完成片段。UI 的推理强度目前不作为 Agnes 参数发送，尚未验证其兼容参数。

现在的注册登录和聊天库仍在客户端 SQLite。服务器只负责统一模型调用；服务器账号认证、集中用量账本、每人额度和支付未实现。现有使用情况图仍是手工配置的数据，不是 Agnes 账单。后续远程部署要另外配置 HTTPS、进程管理和访问凭证分发，本轮没有部署。

## 接口

所有接口均要求 `Authorization: Bearer <STUDIO_GATEWAY_TOKEN>`。任何带 `Origin` 的请求都会拒绝，不提供 CORS；Electron 应由主进程访问网关。

`GET /health` 返回 `200` 与 `{"ok":true}`，只证明网关运行，不访问 Agnes、不证明上游额度可用。

`POST /chat` 使用 `Content-Type: application/json`，不接受压缩请求。请求只允许以下字段：

```json
{
  "displayModel": "默认",
  "messages": [
    { "role": "user", "content": "你好" }
  ]
}
```

`displayModel` 白名单为：默认、GPT-6.1 Sol、GPT-6 Astra、GPT-6 Sol、GPT-6 Luna、GPT-5.6 Sol、GPT-5.6 Terra、GPT-5.6 Luna。

每条消息仅允许 `role` 与文本 `content`；角色仅允许 `user` 和 `assistant`。客户端不能指定 model、endpoint、system、tools 或任意请求头。网关始终调用 `https://apihub.agnes-ai.com/v1/chat/completions`，使用 `agnes-2.5-flash`、`stream: true`、`max_tokens: 8192`，并注入固定身份说明：界面型号是显示名称，询问身份时区分实际 Agnes 模型。系统说明也明确当前仅支持纯文本，无附件解析、文件访问、命令执行或浏览器工具，不能声称已完成这些操作。

`max_tokens: 8192` 用于限制输出预算；此参数与 Agnes 的实际兼容性仍需取得真实 Key 后验证，当前仅完成协议模拟测试。

响应使用 `text/event-stream`：

```text
data: {"type":"delta","text":"你好"}

data: {"type":"done"}

```

流中失败会发送一次终止事件：

```text
data: {"type":"error","error":"模型回复中断，请重试。","code":"UPSTREAM_INCOMPLETE"}

```

客户端断开会取消上游，不再尝试发送终止事件。不能将普通 EOF 当作完成；成功必须收到 `done`。

流开始前失败使用非 2xx JSON：`{"ok":false,"error":"固定中文提示","code":"错误代码"}`。常见代码为 `UNAUTHORIZED`（401）、`ORIGIN_NOT_ALLOWED`（403）、`INVALID_REQUEST`（400）、`REQUEST_TOO_LARGE`（413）、`BUSY`（429）、`UPSTREAM_RATE_LIMIT`（429）、`UPSTREAM_AUTH`（502）、`UPSTREAM_TIMEOUT`（504）。不会转发供应商原始错误或响应头。

## 默认边界

请求体 256 KiB、最多 100 条消息、单条 64 KiB、累计上下文 192 KiB；回复文本 256 KiB、单个 SSE 事件 64 KiB、上游总传输 2 MiB；最多 4 个并发聊天。读取请求体超时 10 秒、上游流停顿超时 30 秒、请求总超时 120 秒。上游重定向被拒绝。

`createGateway({ apiKey, serviceToken, fetch?, limits? })` 返回 Node `http.Server`，可用 `.listen(0, '127.0.0.1')` 取得临时端口。`fetch` 用于注入测试上游；`limits` 只能降低默认限制，不能提高。CLI 不暴露任意上游 URL。

## 验证

运行 `node --experimental-strip-types --test tests/agnes-gateway.test.ts`。测试仅监听随机本机端口，所有上游响应均注入，不使用真实 Key、不调用外部服务、不产生收费请求。真实 Agnes 连通性、额度及远程部署尚未验证。
