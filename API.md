# LLM Chat App API 接口文档

本文档描述客户端（移动端、桌面端、脚本等）如何调用本服务：**完成身份识别、会话保持、按积分计费的对话能力**。侧重「这些接口分别解决什么问题、如何组合使用」，不展开服务端实现细节。

---

## 一、文档作用与业务全景

### 1.1 这套接口整体在做什么

本服务提供两类能力，由若干 HTTP 接口共同完成：

1. **身份与会话**  
   识别「当前是谁在调用」：可以是**未注册的游客**，也可以是**已注册的正式用户**。识别通过后，会发给你一枚**会话令牌**；之后访问受保护能力时，只要在请求里带上这枚令牌即可，**无需**在客户端维护 Cookie（适合移动端、跨域场景）。

2. **对话与计费**  
   在身份有效的前提下，按你选择的**对话模型**处理聊天内容，并以**流式**返回模型输出。每次成功发起对话会按模型规则**扣除积分**；积分不足或账号不可用时，接口会明确返回原因。

因此，典型产品流程是：**先拿到令牌 → 用令牌调对话**；注册/登录/游客入口只是「拿令牌」的不同路径。

### 1.2 用户身份与数据含义（业务概念）

| 概念 | 含义 |
|------|------|
| **游客** | 未主动注册前，用设备侧稳定的 `device_id` 换得一个「临时身份」。服务端会为该设备维护同一游客账号（幂等），初始积分较少。 |
| **正式用户** | 通过**注册**创建的账号：有**登录名（username）**、**密码**，并需提供一个**邮箱字段**（可用于找回、通知；也允许使用应用内占位邮箱，见下文）。正式用户默认积分高于游客。 |
| **用户 ID（userId）** | 服务端分配的稳定标识。游客与正式用户都有；聊天计费、后续扩展业务（如订单）都围绕该 ID。 |
| **会话令牌（accessToken）** | 表示「当前已登录/已识别」的凭证。业务接口（如聊天）要求放在 `Authorization: Bearer ...` 中。令牌有过期时间；过期后需重新走登录或游客会话，**没有单独的「刷新令牌」接口**。 |
| **积分（credits）** | 用于按次消费对话等资源。不同模型单次消耗可能不同；游客与正式用户的初始额度不同。 |

### 1.3 接口如何搭配使用（推荐理解方式）

可以把接口分成三层来记：

**A. 拿到会话令牌（三选一或组合）**

- **只想快速试用、不注册**：应用启动时用持久化的 `device_id` 调用 **`POST /api/guest/session`**，得到 `accessToken` + `userId` + 当前 `credits`（游客）。
- **正式注册**：调用账号服务里的 **`POST /api/auth/sign-up/email`**，提交用户名、密码、邮箱、显示名等；成功后响应里会带有会话令牌（见下文「令牌从哪里读」）。
- **老用户回来**：调用 **`POST /api/auth/sign-in/username`**，用用户名 + 密码换取新的会话令牌。

游客与正式用户共用**同一种** Bearer 用法：后续请求都带 `Authorization: Bearer <accessToken>`。

**B. 使用对话能力**

- 在请求头中带上令牌，调用 **`POST /api/chat`**。  
- 成功时为 **SSE 流**（非整段 JSON）；失败时为 JSON，便于展示错误原因。

**C. 辅助与自检**

- **`GET /api/auth/ok`**：探测账号服务是否可用（例如上线检查、监控）。

当前版本**不再提供**旧的独立路径：`/api/register`、`/api/login`、`/api/refresh`；注册与登录均归入 **`/api/auth/...`** 前缀下的标准形态。

### 1.4 注册时「邮箱」在业务上怎么用

注册接口要求携带 **邮箱字段**（协议与风控上的常见要求）。若你的产品短期内不打算发邮件，可以采用**应用内约定格式**的占位邮箱（例如 `{username}@你的应用专用域` 或自有后缀），只要保证**全局不与他人重复**即可；登录仍以 **username + 密码** 为主（**`POST /api/auth/sign-in/username`**）。

### 1.5 令牌过期与重试策略（客户端建议）

- 会话令牌会过期；过期后聊天等接口可能返回 **401**。客户端应：**用本地保存的用户名密码重新 sign-in**，或 **用 `device_id` 重新请求游客会话**，再更新本地保存的 `accessToken`。  
- 若遇到 **5xx** 或边缘返回 **`error code: 1102`** 等临时故障，可做**有限次退避重试**（与业务错误区分）。

---

## 二、基础约定

- **Base URL**  
  - 本地示例：`http://127.0.0.1:8787`  
  - 线上：你的 Worker 或自定义域名根地址（勿带末尾多余路径）。

- **数据格式**  
  - 除 **`POST /api/chat` 成功** 返回 **SSE 流** 外，其余多为 **JSON**，编码 **UTF-8**。

- **鉴权**  
  - 受保护接口：`Authorization: Bearer <accessToken>`  
  - 令牌来源见各「注册 / 登录 / 游客」接口说明。

- **CORS（浏览器场景）**  
  - `Access-Control-Allow-Origin: *`  
  - `Access-Control-Allow-Methods`: 含 `GET, POST, PUT, DELETE, OPTIONS`  
  - `Access-Control-Allow-Headers`: `Content-Type`, `Authorization`，以及人机验证用的 **`x-captcha-response`**  
  - 暴露头包含：`set-auth-token` / `Set-Auth-Token`，以及聊天流场景的 **`X-Credits-Remaining`**、**`X-Chat-Reference-Id`**（便于浏览器 `fetch` 读取）

- **人机验证（Cloudflare Turnstile + Better Auth Captcha）**  
  - 下文列出的账号相关接口须在 HTTP 请求头携带 **`x-captcha-response`**，值为 Turnstile 控件回调得到的 token（即浏览器表单字段 **`cf-turnstile-response`** 的同内容；亦可由移动端/原生 SDK 取得）。集成方式见 [Better Auth Captcha 插件](https://www.better-auth.com/docs/plugins/captcha)（本项目使用 **`provider: cloudflare-turnstile`**）。  
  - **Site Key**：嵌入客户端页面或 App（公开）。**Secret Key**：仅服务端校验使用，通过 Worker 密钥 **`TURNSTILE_SECRET_KEY`** 注入（生产请 `wrangler secret put TURNSTILE_SECRET_KEY`，**勿**写入仓库）。  
  - **本地 / 自动化测试**：可使用 Cloudflare 文档中的 **dummy Site Key / Secret Key**，dummy token 固定为 **`XXXX.DUMMY.TOKEN.XXXX`**；dummy Secret 只接受 dummy token，生产 Secret 只接受真实 token（详见 [Testing Turnstile](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)）。

---

## 三、会话令牌从哪里读取

以下接口在成功时都可能下发会话令牌，客户端建议按优先级兼容：

1. **响应头** `set-auth-token`（或 `Set-Auth-Token`）  
2. **响应体 JSON** 中的 **`token`** 字段（若存在）

**说明**：头里的值可能与 JSON 里的 `token` 在编码形式上略有差异；**任选其一**用于 `Authorization: Bearer`，与当前服务端校验逻辑一致即可。业务封装接口 **`/api/guest/session`** 则在 JSON 中统一返回 **`accessToken`** 字段，便于与旧客户端字段对齐。

---

## 四、通用 HTTP 状态与错误形态

| 状态码 | 典型含义 |
|--------|----------|
| `200` | 成功（聊天成功时为流式响应，仍为 200） |
| `204` | `OPTIONS` 预检成功 |
| `400` | 参数不合法、校验失败 |
| `401` | 未带令牌、令牌无效或无法识别会话 |
| `402` | 积分不足 |
| `403` | 禁止访问（如账号禁用、模型权限不足） |
| `404` | 路径不存在 |
| `405` | 方法不允许 |
| `422` | 账号类冲突（如邮箱已被注册），多见于注册接口 |
| `500` | 服务内部错误；少数账号流程在极端情况下也会返回 500（见各节说明） |

业务错误多为 JSON：`{ "error": "..." }` 或账号服务返回的结构化 `message` / `code`（以实际响应为准）。

---

## 五、业务封装接口

### 5.1 游客会话 — `POST /api/guest/session`

**作用**：用设备侧 **`device_id`** **幂等** 获取或恢复**游客**身份，并返回可在业务接口中使用的 **`accessToken`** 与当前积分。

**何时调用**：首次启动、未登录、或希望「匿名试用」时；`device_id` 应在应用内持久化，保证同一设备多次启动为同一游客（在仍为游客的前提下）。

#### 请求

```http
POST /api/guest/session
Content-Type: application/json
```

```json
{
  "device_id": "d_3f9fd9adf0a9439a9f6d7e1f7f1a8b20",
  "turnstile_token": "<与 Turnstile Site Key 对应的 cf-turnstile-response / widget token>"
}
```

| 字段 | 说明 |
|------|------|
| `device_id` | **必填**。长度 `8～128`，仅允许 `[a-zA-Z0-9_-]`。 |
| `turnstile_token` | **必填**。客户端完成 Turnstile 后得到的 token；服务端会将其作为 **`x-captcha-response`** 转发给 Better Auth，用于校验 **`/sign-up/email`**、**`/sign-in/email`** 等内部账号调用。 |

#### 成功 `200`

```json
{
  "accessToken": "<会话令牌>",
  "userId": "<用户 ID>",
  "isGuest": true,
  "credits": 100
}
```

- 游客初始积分当前为 **100**（与产品策略一致时可调整，以服务端为准）。

#### 失败示例

| 状态 | 含义 / `error` 示例 |
|------|---------------------|
| `400` | 缺少 Turnstile：`turnstile_token required ...` |
| `400` | `device_id required: 8-128 chars, [a-zA-Z0-9_-]` |
| `403` | 该 `device_id` 已关联**正式账号**，应引导用户走登录，而非继续游客：`This device is linked to a registered account; please log in` |
| `403` | `Account disabled` |
| `500` | `Guest session failed` |

**说明**：当前版本**不包含**「游客一键升级为正式用户并合并资料」的单独业务接口；若需正式账号，请用户走 **`/api/auth/sign-up/email`** 注册新用户（与游客账号在业务上视为不同身份）。

---

## 六、账号与会话（路径前缀 `/api/auth`）

以下路径均挂在 **`/api/auth`** 下（即完整 URL 为 `https://<主机>/api/auth/...`）。除特别说明外，请求体为 JSON，`Content-Type: application/json`。

### 6.1 健康检查 — `GET /api/auth/ok`

**作用**：判断账号相关服务是否存活。

#### 成功 `200`

```json
{ "ok": true }
```

---

### 6.2 注册（邮箱 + 用户名 + 密码）— `POST /api/auth/sign-up/email`

**作用**：创建**正式用户**，并在成功时建立会话，返回用户信息与会话令牌。

#### 请求头（必填）

```http
Content-Type: application/json
x-captcha-response: <Turnstile token>
```

#### 请求体（必填字段）

```json
{
  "name": "展示名称",
  "email": "alice@example.com",
  "password": "至少8位，按服务端策略",
  "username": "alice"
}
```

| 字段 | 说明 |
|------|------|
| `name` | 显示名（可与 username 相同） |
| `email` | 需通过服务端邮箱格式校验；可用产品内约定的占位域名 |
| `password` | 长度等规则以服务端校验为准（当前默认不少于 8 位） |
| `username` | 登录名，唯一；仅允许字母数字下划线点等（以服务端为准） |

#### 成功 `200`

响应体通常包含：

- `user`：用户对象（含 `id`、`username`、`email` 等）  
- `token`：会话令牌（同时可能出现在响应头 `set-auth-token`）

正式用户默认积分一般高于游客（当前默认 **1000**，以服务端配置为准）。

#### 失败示例

| 状态 | 说明 |
|------|------|
| `400` | 未带 **`x-captcha-response`**：`code` 多为 **`MISSING_RESPONSE`** |
| `400` | 密码过短、邮箱格式非法等 |
| `422` | 邮箱已存在等冲突 |

---

### 6.3 登录（用户名 + 密码）— `POST /api/auth/sign-in/username`

**作用**：已注册用户用 **用户名 + 密码** 换取**新的**会话令牌（替换本地旧令牌）。

#### 请求头（必填）

```http
Content-Type: application/json
x-captcha-response: <Turnstile token>
```

#### 请求体

```json
{
  "username": "alice",
  "password": "你的密码",
  "rememberMe": true
}
```

`rememberMe` 可选；影响会话记住策略（具体时长由服务端决定）。

#### 成功 `200`

- 响应体含 `token`、`user` 等；同样可能带 `set-auth-token` 响应头。

#### 失败示例

| 状态 | 说明 |
|------|------|
| `400` | 未带 **`x-captcha-response`**：`code` 多为 **`MISSING_RESPONSE`** |
| `401` | 用户名或密码错误 |
| `500` | 极少数情况：如账号在业务侧被标记为不可登录时，会话创建失败，可能返回 `FAILED_TO_CREATE_SESSION`（产品侧应引导联系客服或自助申诉） |

---

### 6.4 其他 `/api/auth/*` 能力

同一前缀下还可能提供会话查询、退出登录、修改资料等**标准账号能力**；是否启用以你当前部署为准。本产品在业务上**必须对接**的主要是：**注册**、**用户名登录**、**健康检查**，以及下文的**聊天**。

---

## 七、聊天（SSE）— `POST /api/chat`

**作用**：在会话有效的前提下，按所选模型进行对话，**流式**返回模型输出，并按规则扣减积分。

服务端通过 Cloudflare 的 **OpenAI 兼容端点** 调用模型：`POST https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`（与官方 `openai-node` 在 `baseURL = .../ai/v1` 下调用 `chat.completions.create` 等价）。需在 Worker 环境配置 **`CLOUDFLARE_ACCOUNT_ID`**（`wrangler.jsonc` 的 `vars`）与 **`CLOUDFLARE_API_KEY`**（`wrangler secret put CLOUDFLARE_API_KEY`，具备 Workers AI 调用权限的 API Token）。

成功时响应体为 **OpenAI Chat Completions 流式 API** 兼容的 **SSE**（`text/event-stream`）：服务端**透传**上游返回的字节流，**不在网关侧解析或改写** chunk 内容。客户端应按 OpenAI 约定解析 `data:` 行（含 `data: [DONE]` 结束标记）。非流式错误仍以 JSON 返回。

### 请求

```http
POST /api/chat
Content-Type: application/json
Authorization: Bearer <accessToken>
```

```json
{
  "model_id": "llama-3.1-8b",
  "thinking": true,
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "add_todo",
        "description": "Create a todo item for the user.",
        "parameters": {
          "type": "object",
          "properties": {
            "title": { "type": "string" },
            "due_time_iso": { "type": "string" }
          },
          "required": ["title", "due_time_iso"]
        }
      }
    }
  ],
  "messages": [
    { "role": "user", "content": "你好，给我一句简短问候。" }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `model_id` | 可选。不传则使用服务端默认模型（当前默认 `llama-3.1-8b`）。须为已上架且启用的逻辑模型 ID。 |
| `thinking` | 可选，`boolean`。默认 `true`（开启思考模式）。当传 `false` 时，服务端会在支持的模型上转发 `chat_template_kwargs.enable_thinking=false`，用于关闭思考链输出；当前主要对 Qwen 系列生效。 |
| `tools` | 可选，数组。传入时按你提供的工具定义透传给模型；不传或空数组时，服务端会基于 Vectorize 语义召回默认 `2` 个工具（可配置），候选来自内置 6 个工具：`add_todo`、`open_app`、`record_expense`、`generate_image`、`ai_web_search`、`summarize_text`。召回失败会回退到安全默认工具。 |
| `messages` | 建议始终传递。元素 `role` 为 `system` \| `user` \| `assistant`，`content` 为文本。若无 `system` 消息，服务端会自动插入一条默认系统提示。 |

### 成功 `200`

- `Content-Type`: `text/event-stream; charset=utf-8`  
- 重要响应头：  
  - `X-Credits-Remaining`：本次请求完成扣费后的**剩余积分**  
  - `X-Chat-Reference-Id`：本次对话计费关联 ID（对账、客服可查）

服务端会记录工具召回链路日志（embedding 用时、向量查询用时、命中工具列表、是否 fallback），用于线上排障与召回质量调优。

**流式正文（OpenAI 兼容）**

- 每个 SSE 事件一行或多行 `data: `，负载为 JSON；流结束前会发送 **`data: [DONE]`**（字面量，非 JSON）。  
- 典型 chunk 的 `object` 为 **`chat.completion.chunk`**，增量文本在 **`choices[0].delta`** 中，例如：  
  - **`delta.content`**：助手回复正文片段  
  - **`delta.reasoning_content`**：部分推理模型会流式输出思考过程（扩展字段，见 Cloudflare Workers AI 实际输出）  
  - **`delta.tool_calls`**：工具调用时分片到达，需按 OpenAI 流式 tool_calls 规则合并  
- 首包常带 **`delta.role`**、空 **`content`**；最后一包可能带 **`finish_reason`**。  
- **完整字段语义、合并算法与边界情况**见下文 **「附录一：OpenAI 兼容 Chat Completions 流式协议」**；原始 trace 见 **`model_reponse_demo.md`**（与 `curl …/ai/run/...` 的 SSE 形态一致）。

示例（节选，实际以模型为准）：

```text
data: {"id":"chatcmpl-…","object":"chat.completion.chunk","created":1776510399,"model":"@cf/…","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}],…}

data: {"id":"chatcmpl-…","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"你好"}}],…}

data: [DONE]

```

**说明**：旧版部分 Llama 流式曾使用非标准字段（如顶层 `response`）；当前网关**仅透传** Workers AI 的 OpenAI 形态 SSE，客户端请**不要**依赖已废弃格式。

### 失败（JSON）

| 状态 | `error` 示例 |
|------|----------------|
| `401` | 未带令牌或无效：`Unauthorized`；或资料缺失：`User not found` |
| `400` | `Unknown or inactive model` |
| `402` | `Insufficient credits` |
| `403` | `Account disabled` |
| `403` | `This model requires an active Pro subscription`（模型要求 Pro 而当前账号未满足） |
| `500` | `Failed to process request` |

### `OPTIONS /api/chat`

用于 CORS 预检时返回 **`204`**，并携带 CORS 相关响应头。

### 其他方法

对 `/api/chat` 使用非 `POST` 方法时返回 **`405`**，JSON：`{ "error": "Method not allowed" }`。

---

## 附录一：OpenAI 兼容 Chat Completions 流式协议（客户端解析参考）

本节说明 **`POST /api/chat` 成功时** 响应体的通用解析方式。网关**透传**上游（Workers AI / OpenAI 形态）SSE，字段以实际 chunk 为准；下列结构以 [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat/create) 及常见兼容实现为基准，并标注**厂商扩展**。

### A. 传输层（SSE）

| 项目 | 说明 |
|------|------|
| 媒体类型 | `text/event-stream`（UTF-8） |
| 事件行格式 | 若干行以 **`data: `** 开头；负载为 **单行 JSON**，或字面量 **`[DONE]`**（非 JSON） |
| 流结束 | 必须处理 **`data: [DONE]`**（含前导空格与否以实现为准，常见为精确字符串 `[DONE]`） |
| 注释行 | 规范允许 `: comment` 行；多数实现可忽略 |

客户端应按行读取：若以 `data:` 开头，则取其后负载；若为 `[DONE]` 则结束解析循环。

### A.1 响应原文节选（与 `model_reponse_demo.md` 同形，已折叠中间重复分片）

下面是从同一类 Workers AI（OpenAI 兼容 SSE）实测 trace **精简后的原文**：仍含 **`role` 首包**、**少量 `reasoning_content`**、**可见 `content`**、**`tool_calls`（`id`/`name` + `arguments` 多分片）**、**`finish_reason`**、**`choices: []` 用量包**、**`[DONE]`**。真实流里推理与 `arguments` 往往远多于下列行数，合并规则不变。

```text
data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}],"usage":{"prompt_tokens":192,"total_tokens":192,"completion_tokens":0}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"\n"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":194,"completion_tokens":2}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"reasoning_content":"Okay"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":195,"completion_tokens":3}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"content":"\n\n"},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":285,"completion_tokens":93}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"id":"chatcmpl-tool-a7348842dffa4c4795f7f8ae2cc1b328","type":"function","index":0,"function":{"name":"add_todo"}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":294,"completion_tokens":102}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"task\": \""}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":301,"completion_tokens":109}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"go to the library"}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":305,"completion_tokens":113}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\",\"time\":\"tomorrow at 2pm\"}"}}]},"logprobs":null,"finish_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":318,"completion_tokens":126}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[{"index":0,"delta":{"content":""},"logprobs":null,"finish_reason":"tool_calls","stop_reason":null,"token_ids":null}],"usage":{"prompt_tokens":192,"total_tokens":319,"completion_tokens":127}}

data: {"id":"chatcmpl-15a69a9103684dafb11499ce4f587d45","object":"chat.completion.chunk","created":1776510399,"model":"@cf/qwen/qwen3-30b-a3b-fp8","choices":[],"usage":{"prompt_tokens":192,"total_tokens":319,"completion_tokens":127}}

data: [DONE]
```

**说明**：上述第 7～8 行为展示「`arguments` 可多包拼接」，在 **`model_reponse_demo.md` 全量 trace 中被拆成更多细粒度 token**；拼接后应与 `{\"task\":\"...\",\"time\":\"...\"}` 的 JSON 字符串一致。完整未折叠原文见仓库 **`model_reponse_demo.md`**。

### B. 单个 chunk 的 JSON 形态（`chat.completion.chunk`）

每条 `data:` 负载解析后为对象，常见顶层字段：

| 字段 | 含义 |
|------|------|
| `id` | 本次补全的唯一 ID；**同一流内各 chunk 通常相同** |
| `object` | 固定为 **`chat.completion.chunk`** |
| `created` | Unix 时间戳（秒） |
| `model` | 模型标识字符串 |
| `choices` | **数组**；流式增量在 `choices[i].delta` 中；**可能为空数组**（见下文 usage） |
| `usage` | **可选**。部分实现仅在最后一包或开启 `stream_options` 时出现；部分实现（如某些 Workers AI 响应）可能在多个 chunk 上携带累计用量——**勿假设只出现一次** |

每个 `choices[]` 元素常见字段：

| 字段 | 含义 |
|------|------|
| `index` | 候选序号；单路输出一般为 `0` |
| `delta` | **增量**：本事件相对上一状态的追加片段（见下节） |
| `finish_reason` | **终止原因**；流式过程中多为 `null`，结束时有值（见 D 节） |
| `logprobs` | 若请求了 logprobs，此处可能非 null |

### C. `delta`：正文、推理、拒答、工具调用

`choices[].delta` 表示「本条事件带来的增量」。同一字段在多 chunk 上**字符串类需拼接**，**数组类需按索引合并**。

#### C.1 OpenAI 标准字段

| 字段 | 类型 | 合并规则 |
|------|------|----------|
| `role` | string | 通常仅在**靠前**的 chunk 出现一次（如 `assistant`）；可与空 `content` 同包 |
| `content` | string | **追加拼接**得到助手对用户可见的完整正文 |
| `refusal` | string | 安全拒答等；若有，按字符串追加理解（具体以模型为准） |
| `function_call` | object | **已弃用**；由 `tool_calls` 取代；若仍遇到，需兼容 `name` / `arguments` 的流式片段 |

#### C.2 推理 / 思考（**扩展字段**，非全部 OpenAI 模型具备）

| 字段 | 说明 |
|------|------|
| `reasoning_content` | **字符串增量**，与 `content` 同样**按 chunk 顺序拼接**。用于展示「链式思考」或内部推理文本（如 Qwen 思考模式、部分 DeepSeek 兼容接口等）。**不得**与面向用户的 `content` 混在同一缓冲区，除非产品刻意合并。 |

本仓库示例 **`model_reponse_demo.md`** 中，Workers AI（`@cf/qwen/...`）先流式输出大量 `delta.reasoning_content`，再出现 `delta.content`，最后流式输出 `delta.tool_calls`。

其他生态中还可能见到 `thinking`、`reasoning` 等别名；**以实际上游为准**，解析器宜做成「可配置字段名」或「多键 fallback」。

#### C.3 `tool_calls`（OpenAI 标准，流式分片）

`delta.tool_calls` 为 **数组**，元素形态与 REST 非流式响应中的 `message.tool_calls` 一致，但在流式中**多次出现且每次只带一部分字段**。

每个元素常见字段：

| 字段 | 说明 |
|------|------|
| `index` | **整数**，表示这是第几个工具调用（从 `0` 起）。**合并时的主键** |
| `id` | 工具调用 ID；**常在首个含该 index 的片段中出现**，后续片段可能省略 |
| `type` | 一般为 **`function`** |
| `function` | 对象，含 `name`、`arguments`（均为**可选且分片到达**） |

**合并算法（务必实现）：**

1. 维护一张表，以 **`index`** 为键（或定长数组，长度为当前见到的最大 index+1）。
2. 对每一个到达的 `delta.tool_calls[]` 元素：
   - 读取 `index`；
   - 若出现 `id`、`type`，写入对应槽位；
   - 对 `function.name`：若本片段带有非空 `name`，写入槽位；
   - 对 `function.arguments`：**按字符串追加**到该 index 的参数字符串缓冲区（JSON 文本会跨多 chunk）。
3. 流结束后（`finish_reason` 已出现或收到 `[DONE]`），对每个槽位：
   - 将 **`arguments` 拼接结果**解析为 JSON 对象（建议 `JSON.parse` 前校验括号闭合；无效则按业务降级）；
   - 得到完整结构：`{ id, type: "function", function: { name, arguments: <parsed> } }`。

**多工具并行**：不同 `index` 对应不同调用，各自独立拼接 `arguments`。

**与正文的关系**：模型可能先输出可见 `content`，再输出 `tool_calls`；也可能几乎无 `content` 而以 `finish_reason: "tool_calls"` 结束（见 **`model_reponse_demo.md`** 末尾）。

### D. `finish_reason` 与结束语义

常见取值（与 [OpenAI 文档](https://platform.openai.com/docs/api-reference/chat/streaming) 一致）：

| 值 | 含义 |
|----|------|
| `null` | 仍在生成 |
| `stop` | 自然停止 |
| `length` | 达到最大长度等上限 |
| `tool_calls` | 模型选择调用工具；此时应已在 delta 中尽量收齐各 `tool_calls` 片段 |
| `content_filter` | 内容被过滤 |
| `function_call` | 旧版函数调用停止原因（兼容） |

最后一包可能带有 **`delta.content` 为空字符串** 且 **`finish_reason`** 非空（示例见 `model_reponse_demo.md`）；**必须以 `finish_reason` 与 `[DONE]` 综合判断结束**，不要仅依赖正文非空。

部分实现还会在 choice 上带 **`stop_reason`**（扩展）；可仅作展示或忽略。

### E. 仅含 `usage` 或 `choices: []` 的包

当请求或上游启用了用量回传时，可能出现：

- `choices` 为 **空数组**，仅含 `usage`；
- 或最后一包在 `choices` 中带 `finish_reason` 的同时再次带 `usage`。

客户端应：**不假设** `choices[0]` 始终存在；访问前判断数组长度。

### F. 客户端状态机建议（极简）

1. 初始化缓冲区：`content_buffer`、`reasoning_buffer`（若需）、`tool_calls_by_index: Map<number, …>`。
2. 每读一行：若是 JSON chunk，合并各 delta 字段；若是 `[DONE]`，收尾并触发「流完成」回调。
3. 流完成后：若存在未闭合的 tool call 缓冲区，尝试 `JSON.parse(arguments)`；失败则报错或重试请求。
4. UI：可同时展示「推理折叠区」（`reasoning_content`）与「助手回复区」（`content`），二者独立滚动与复制。

### G. 官方与扩展对照小结

| 能力 | OpenAI Chat Completions 流式 | 本服务 / Workers AI 常见表现 |
|------|------------------------------|------------------------------|
| SSE `data:` + `[DONE]` | 标准 | 一致 |
| `delta.content` | 标准 | 一致 |
| `delta.tool_calls` + index 合并 | 标准 | 一致 |
| `delta.reasoning_content` | **扩展**（官方 chunk 文档未必列出） | Qwen 等模型常见，见 **`model_reponse_demo.md`** |
| 每 chunk 附带 `usage` | 依 `stream_options` 等 | 可能与 OpenAI 默认略有差异，勿强依赖 |

更完整的原始 trace 见仓库根目录 **`model_reponse_demo.md`**（含推理流式 + `tool_calls` + `finish_reason: "tool_calls"`）。

---

## 八、其他路径行为

- **`OPTIONS /api/*`**：预检成功一般为 **`204`**。  
- **未定义的 `/api/...`**：返回 **`404`**，`{ "error": "Not Found" }`。  
- **非 `/api` 路径**：由静态资源或前端资源策略处理（与 API 文档无关时可忽略）。

---

## 八点五、Vectorize 工具路由运维说明

- 索引创建（需与 embedding 维度一致）：`npx wrangler vectorize create llm-chat-tools-index --dimensions=768 --metric=cosine`
- 建议创建 metadata index（最多 10 个）：
  - `npx wrangler vectorize create-metadata-index llm-chat-tools-index --property-name=enabled --type=boolean`
  - `npx wrangler vectorize create-metadata-index llm-chat-tools-index --property-name=tool_group --type=string`
  - `npx wrangler vectorize create-metadata-index llm-chat-tools-index --property-name=risk_level --type=string`
- Worker 通过 `wrangler.jsonc` 绑定：
  - `ai.binding = "AI"`
  - `vectorize[].binding = "TOOL_INDEX"`
- 召回关键配置（`vars`）：
  - `TOOL_EMBED_MODEL`（默认 `@cf/baai/bge-base-en-v1.5`）
  - `TOOL_RETRIEVAL_TOP_N`（默认 `2`）
  - `TOOL_RETRIEVAL_TOP_K`（默认 `20`）
  - `TOOL_RETRIEVAL_SCORE_THRESHOLD`（默认 `0.45`）
  - `TOOL_VECTORIZE_AUTO_SYNC`（建议 `false`，避免首个用户触发同步）
  - `TOOL_INDEX_INIT_KEY`（手动初始化接口密钥）
- 手动初始化接口（推荐部署后执行一次）：
  - `POST /api/admin/tool-index/init`
  - Header: `x-admin-init-key: <TOOL_INDEX_INIT_KEY>`
  - 成功返回 `mutationId` 与 `toolCount`
- 初始化状态检查接口：
  - `GET /api/admin/tool-index/status`
  - Header: `x-admin-init-key: <TOOL_INDEX_INIT_KEY>`
  - 返回 `vectorCount`、`dimensions`、`metric`、`expectedToolCount`、`ready`

---

## 九、客户端接入顺序建议

1. **冷启动**  
   - 若产品允许匿名：在客户端完成 Turnstile，将 token 与持久化 `device_id` 一并提交到 **`POST /api/guest/session`**，保存 `accessToken`、`userId`、`credits`。  
   - 若必须登录：展示登录页（登录前同样完成 Turnstile），成功后保存令牌与用户信息。

2. **注册**  
   - 调 **`POST /api/auth/sign-up/email`**（请求头带 **`x-captcha-response`**），保存返回的令牌与 `user.id`（即业务上的 `userId`）。

3. **已登录用户再次进入**  
   - 调 **`POST /api/auth/sign-in/username`**（请求头带 **`x-captcha-response`**）刷新令牌；本地令牌失效时重复此步。

4. **对话**  
   - 所有 **`POST /api/chat`** 请求携带 `Authorization: Bearer <accessToken>`。  
   - 读取 SSE；根据 `X-Credits-Remaining` 更新本地展示的积分。

5. **令牌失效**  
   - 收到 **`401`**：清除本地令牌，走登录或游客会话重新获取，再重试业务请求（**不要**再调用已移除的 refresh 接口）。

6. **监控 / 发布验证**  
   - 可对 **`GET /api/auth/ok`** 做轻量探活。

---

## 十、Curl 示例

将 `BASE` 换成你的环境根地址。

```bash
BASE="https://你的域名"
# 将下列占位换成 Turnstile 校验通过后得到的 token（本地 dummy 测试可用 XXXX.DUMMY.TOKEN.XXXX + dummy secret）
CAPTCHA="XXXX.DUMMY.TOKEN.XXXX"

# 健康检查
curl -sS "$BASE/api/auth/ok"

# 游客会话（须带 turnstile_token；值与 CAPTCHA 同源）
curl -sS -X POST "$BASE/api/guest/session" \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"d_mydevice_12345678\",\"turnstile_token\":\"$CAPTCHA\"}"

# 注册（邮箱请按产品规则填写）
curl -sS -D - -X POST "$BASE/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -H "x-captcha-response: $CAPTCHA" \
  -d '{"name":"Alice","email":"alice@example.com","password":"Yourpass12","username":"alice"}'

# 登录
curl -sS -X POST "$BASE/api/auth/sign-in/username" \
  -H "Content-Type: application/json" \
  -H "x-captcha-response: $CAPTCHA" \
  -d '{"username":"alice","password":"Yourpass12"}'

# 聊天（将 TOKEN 换为 accessToken 或响应中的 token）
curl -N --max-time 60 -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"messages":[{"role":"user","content":"hello"}]}'
```

---

## 十一、与旧版文档的差异摘要

| 旧版 | 现行 |
|------|------|
| `POST /api/register` / `/api/login` / `/api/refresh` | 使用 **`/api/auth/sign-up/email`**、**`/api/auth/sign-in/username`**；**无 refresh 路径**，过期重新登录或重新游客会话 |
| JWT + refreshToken 双令牌 | **会话令牌**；从响应头或 JSON 读取，Bearer 使用方式不变 |
| 游客响应含 `refreshToken` | 游客仅返回 **`accessToken`**（及 `userId`、`credits` 等） |
| 游客可 Bearer 升级注册 | 当前版本**不提供**该业务接口；正式账号请单独注册 |
| 无 Turnstile | 注册 / 用户名登录 / 游客会话须配合 **Cloudflare Turnstile**（请求头 **`x-captcha-response`** 或游客 **`turnstile_token`**）；服务端 **`TURNSTILE_SECRET_KEY`** |

若你维护多环境，请同时确认**线上部署版本**与本文档一致（发布前的检查项由团队内部清单另行维护即可）。**切勿**在仓库或聊天中泄露 Turnstile **Secret Key**；若已泄露请在 Cloudflare 控制台**轮换密钥**。
