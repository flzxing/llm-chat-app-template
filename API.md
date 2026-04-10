# LLM Chat App API 接口文档

本文档基于当前后端实现整理，适用于 App 侧联调接入。

## 基础信息

- Base URL（本地）: `http://127.0.0.1:8787`
- Base URL（线上）: 你的 Worker 域名
- 数据格式: JSON（除 `/api/chat` 成功返回为 SSE 流）
- 字符编码: UTF-8
- 鉴权方式: `Authorization: Bearer <accessToken>`
- CORS:
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: GET, POST, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, Authorization`

## Token 机制

- `accessToken`:
  - JWT（HS256）
  - 有效期约 `15 分钟`
  - 用于访问受保护接口（如 `/api/chat`）
- `refreshToken`:
  - 随机 UUID 字符串
  - 服务端保存哈希，默认有效期 `7 天`
  - 用于换新 token（`/api/refresh`）

## 通用状态码约定

- `200` 成功
- `204` OPTIONS 预检成功
- `400` 参数错误 / 业务前置校验失败
- `401` 未授权 / token 无效
- `402` 积分不足
- `403` 禁止访问（账号禁用、模型权限不满足等）
- `404` 接口不存在
- `405` 方法不允许
- `409` 资源冲突（如用户名重复、升级冲突）
- `500` 服务端错误

---

## 1) 游客会话

### POST `/api/guest/session`

按 `device_id` 幂等创建或恢复游客会话，并返回 token。

#### 请求头

```http
Content-Type: application/json
```

#### 请求体

```json
{
  "device_id": "d_3f9fd9adf0a9439a9f6d7e1f7f1a8b20"
}
```

#### 字段说明

- `device_id`:
  - 必填
  - 长度 `8-128`
  - 仅允许 `[a-zA-Z0-9_-]`

#### 成功响应（200）

```json
{
  "accessToken": "<jwt_access_token>",
  "refreshToken": "<refresh_token>",
  "userId": "u_0b2b4cb4f1f3469a8f5c6d7e8f9a0b1c",
  "isGuest": true,
  "credits": 100
}
```

#### 失败响应示例

- `400` 参数非法

```json
{
  "error": "device_id required: 8-128 chars, [a-zA-Z0-9_-]"
}
```

- `403` 该设备已绑定正式账号

```json
{
  "error": "This device is linked to a registered account; please log in"
}
```

- `403` 账号不可用

```json
{
  "error": "Account disabled"
}
```

- `500`

```json
{
  "error": "Guest session failed"
}
```

---

## 2) 注册

### POST `/api/register`

支持两种模式：

1. **普通注册**（不带 Authorization）: 新建正式用户  
2. **游客升级注册**（带游客 `accessToken`）: 在原用户行升级为正式账号（保留 `userId`、积分、`device_id`）

#### 请求头

```http
Content-Type: application/json
Authorization: Bearer <accessToken>   // 可选，仅游客升级时传
```

#### 请求体

```json
{
  "username": "alice",
  "password": "secret12",
  "device_info": "ios-17.4-iphone15"
}
```

#### 字段说明

- `username`: 必填，唯一
- `password`: 必填，最少 6 位
- `device_info`: 可选，会记录到 refresh token 记录中

#### 成功响应（200）

- 普通注册：

```json
{
  "accessToken": "<jwt_access_token>",
  "refreshToken": "<refresh_token>",
  "userId": "u_3f0b13f57e584ad4b0c776913e467ddd",
  "username": "alice",
  "upgraded": false
}
```

- 游客升级：

```json
{
  "accessToken": "<jwt_access_token>",
  "refreshToken": "<refresh_token>",
  "userId": "u_3f0b13f57e584ad4b0c776913e467ddd",
  "username": "alice",
  "upgraded": true
}
```

#### 失败响应示例

- `400`

```json
{
  "error": "Username and password (min 6 chars) are required"
}
```

- `400`（Bearer 但用户已是正式账号）

```json
{
  "error": "Already registered"
}
```

- `401`

```json
{
  "error": "Unauthorized"
}
```

- `409` 用户名冲突

```json
{
  "error": "Username already exists"
}
```

- `409` 升级冲突

```json
{
  "error": "Upgrade failed"
}
```

- `500`

```json
{
  "error": "Registration failed"
}
```

---

## 3) 登录

### POST `/api/login`

用户名密码登录，返回新 token 对。

#### 请求头

```http
Content-Type: application/json
```

#### 请求体

```json
{
  "username": "alice",
  "password": "secret12",
  "device_info": "android-14-pixel8"
}
```

#### 成功响应（200）

```json
{
  "accessToken": "<jwt_access_token>",
  "refreshToken": "<refresh_token>",
  "userId": "u_3f0b13f57e584ad4b0c776913e467ddd"
}
```

#### 失败响应示例

- `400`

```json
{
  "error": "Missing credentials"
}
```

- `401`

```json
{
  "error": "Invalid username or password"
}
```

- `403`

```json
{
  "error": "Account disabled"
}
```

- `500`

```json
{
  "error": "Login failed"
}
```

---

## 4) 刷新 Token

### POST `/api/refresh`

用 `refreshToken` 换取新 token 对。旧 refresh token 会被撤销（支持短暂宽限期）。

#### 请求头

```http
Content-Type: application/json
```

#### 请求体

```json
{
  "refreshToken": "4f35c19d-f3e2-4eca-8b9b-f99ea0de9c34",
  "device_info": "ios-17.4-iphone15"
}
```

#### 成功响应（200）

```json
{
  "accessToken": "<jwt_access_token>",
  "refreshToken": "<new_refresh_token>"
}
```

#### 失败响应示例

- `401`

```json
{
  "error": "Invalid refresh request"
}
```

- `403`

```json
{
  "error": "Session expired"
}
```

---

## 5) 聊天（SSE）

### POST `/api/chat`

受保护接口。校验 token 后，根据模型配置扣积分并返回流式响应。

#### 请求头

```http
Content-Type: application/json
Authorization: Bearer <accessToken>
```

#### 请求体

```json
{
  "model_id": "llama-3.1-8b",
  "messages": [
    { "role": "user", "content": "你好，给我一句简短问候。" }
  ]
}
```

#### 字段说明

- `model_id`: 可选，默认 `llama-3.1-8b`
- `messages`: 可选数组（建议必传），元素结构：
  - `role`: `system | user | assistant`
  - `content`: 文本内容

> 若 `messages` 中没有 `system` 消息，服务端会自动补一条默认 system prompt。

#### 成功响应（200）

- `Content-Type`: `text/event-stream; charset=utf-8`
- 关键响应头：
  - `X-Credits-Remaining`: 本次请求后的剩余积分
  - `X-Chat-Reference-Id`: 本次聊天计费流水关联 ID

SSE 示例（片段）：

```text
data: {"response":"你好！"}

data: {"response":"很高兴见到你。"}

```

#### 失败响应示例

- `401`（未带 token）

```json
{
  "error": "Unauthorized"
}
```

- `401`（token 无效或过期）

```json
{
  "error": "Token expired"
}
```

- `400`（模型不存在或未启用）

```json
{
  "error": "Unknown or inactive model"
}
```

- `402`（积分不足）

```json
{
  "error": "Insufficient credits"
}
```

- `403`（账号禁用）

```json
{
  "error": "Account disabled"
}
```

- `403`（模型要求 Pro）

```json
{
  "error": "This model requires an active Pro subscription"
}
```

- `500`

```json
{
  "error": "Failed to process request"
}
```

---

## 6) 预检请求（CORS）

### OPTIONS `/api/*`

所有 `/api/` 路径都支持 OPTIONS 预检。

#### 成功响应

- 状态码: `204`
- 含 CORS 头

---

## 7) 兜底行为

- 任意不存在的 API 路径：返回 `404`

```json
{
  "error": "Not Found"
}
```

- `/api/chat` 使用非 `POST` 方法：返回 `405`

```text
Method not allowed
```

---

## 8) App 接入建议（推荐顺序）

1. 首次启动先调用 `/api/guest/session`（携带本地持久化 `device_id`）
2. 保存 `accessToken`、`refreshToken`、`userId`
3. 调用 `/api/chat` 时在头里带 `Authorization`
4. 收到 `401` 时调用 `/api/refresh`，成功后重试原请求
5. 用户注册时：
   - 游客态：带 `Bearer <guest_accessToken>` 调 `/api/register`（升级）
   - 非游客态：直接 `/api/register`（普通注册）

---

## 9) Curl 快速示例

### 9.1 创建游客会话

```bash
curl -X POST "$BASE_URL/api/guest/session" \
  -H "Content-Type: application/json" \
  -d '{"device_id":"d_3f9fd9adf0a9439a9f6d7e1f7f1a8b20"}'
```

### 9.2 游客 token 调聊天

```bash
curl -N -X POST "$BASE_URL/api/chat" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{"messages":[{"role":"user","content":"hello"}]}'
```

### 9.3 刷新 token

```bash
curl -X POST "$BASE_URL/api/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}"
```

