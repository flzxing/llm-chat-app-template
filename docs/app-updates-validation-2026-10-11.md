# 免费 Worker APK 自更新验收记录

日期：2026-10-11。方案：Workers Free + 现有 D1 / 私有 R2 + Mac 本地 Android SDK 校验及独立 P-256 签名报告。无 Workers Paid、Containers、校验 Queue 或自建 Linux 依赖。

## 已验证的范围

- 服务端 62 项测试，5 个测试文件通过。覆盖策略签名、版本选择、灰度、强制兼容性、撤回、Range、权限、幂等、报告签名 / 绑定 / 过期 / 文件替换与运营深链接。
- 本地发布工具 2 项 Node 测试、3 项 Python SDK 解析测试通过。
- 运营台 22 项单测、11 项 Playwright 功能测试通过，包括待本地校验命令、发布凭证、强制确认、失败恢复。按用户要求不再进行视觉验收。
- TypeScript、运营台构建和生产干净检出 dry-run 通过。部署的代码来自已提交的干净检出，不混入客户端改动。
- D1 0006 迁移已应用到 staging 与 production。旧制品验证不再作为新方案授权。

## 隔离线上真实制品验证

[APK 校验报告](evidence/planb-staging-apk-verification.json)、[发布链路结果](evidence/planb-staging-flow.json)。

真实 `.updateqa` APK，versionCode 1009，99,374,791 bytes，non-debuggable，API 26+ / arm64。通过线上 16 MiB 分片上传，再从私有 R2 回读至 Mac，使用 build-tools 36.0.0 的真实 apksigner / aapt2 校验。完整 SHA-256：`a2afd25b735db62eef22bce28d38baf64ee9ba903565d9e480de7b5cf2f5bcc9`。

已验证：签名报告服务端验签、草稿、编辑者无发布权限、定时隐藏、全量发布、带安装身份绑定的策略验签、HEAD、真实字节 Range、稳定下载地址、最低版本绕过灰度、暂停保留已选目标授权、撤回阻止下载及安装授权、匿名事件与审计。

QA 制品 ID：`c1f183bd-5f92-4ef0-b94a-c4eb9e69e14f`；QA 发布 ID：`94533609-d21e-4c7d-a275-f97546a4ca79`。验收完成后版本已撤回，不面向正式用户。

新增 1009 打包最初因 ReTerminal 上游 `libtalloc_2.4.3_aarch64.deb` 返回 404 失败；随后保留现有构建缓存，排除 `:core:main:prepareEmbeddedTerminalRuntime` 完成 QA 打包。没有修改 vendor。该 QA 包用于本次服务端真实 APK 发布链路，不宣称对重建终端运行时的新包完成了实机验收。

## 生产线上验证

[生产 API 结果](evidence/planb-production-flow.json)、[生产浏览器结果](evidence/planb-production-browser.json)。

生产验证使用无效的三字节制品，未发布任何正式版本。验证签名策略、命名编辑会话、分片转发、完成上传、私有回读、未校验不能公开下载或创建草稿；实际 Android SDK 拒绝文件后，签名拒绝报告被生产 Worker 接收。测试对象已删除，取消后的私有源不可再访问。

运营台使用真实命名编辑凭证完成登录，验证版本中心、升级表现和操作轨迹。浏览器初测发现 `/ops/releases` 被静态资源 `index.html` canonicalization 307 到首页；已改为内部请求 `/ops/`，增加服务端回归测试并重新部署。最终使用不跟随重定向的 HTTP 检查与真实浏览器重复确认。

官方稳定入口当前无正式基线，返回 404 是预期；没有用 QA / debug / 无效 APK 伪造正式发布成功。

## 清理与外部前置条件

[云端清理结果](evidence/planb-cloud-cleanup.json)：四个旧校验队列、staging verifier Worker 残留、两环境旧 HMAC secret 已删除。保留 D1 历史表、私有 R2 和版本审计，不删除原有产品数据。

模拟器未重新启动；结束时确认没有 emulator / qemu 进程。已连接的实体手机保持原状。本轮没有启动 Docker / Colima，也没有执行付费套餐开通。

客户端代码按用户要求没有提交。本轮仅同步客户端发布说明，不修改客户端实现。先前 API 26 / 33 / 36 及 API 35 的真实覆盖升级、数据保留与新版本启动确认记录，保存在客户端 `docs/releases/validation-2026-10-11.md` 及其 evidence 目录；本轮不重复实机安装，也不把旧容器验证描述为当前云端架构。

首个面向正式用户的 APK 仍需产品方提供正式 RevenueCat Android key、完成签名材料加密离线备份及首次官方安装验收。服务与发布工具已上线；这些是实际首发前置项，不能通过 debug 签名或测试支付 key 绕过。

免费额度依旧是有限额度。8 GiB 制品配额仅约束本功能，不是全账户绝对零账单开关，主题等已有 R2 用量需共同预算。完整操作说明见 [发布运营手册](app-updates-runbook.md)。

部署代码与最终版本信息另见 [部署清单](evidence/planb-deployment.json)。
