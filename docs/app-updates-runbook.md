# LuckyTool 官方 APK 发布与升级运营手册

适用版本：2026-10-11，免费 Worker + D1 + R2 + Mac 本地可信校验。本文替代此前 Containers / HMAC 校验方案。只支持完整 APK，差分包尚未实现，也没有可用的差分发布按钮。

## 1. 入口与职责

| 入口 | 用途 |
| --- | --- |
| https://luckyaitool.com/ops/releases | 正式版本运营台 |
| https://luckyaitool.com/download/luckytool.apk | 最新已通过校验、已发布且 100% 放量的正式 APK |
| https://luckyaitool.com/v1/app-updates/check | App 主动检查版本，不要求用户登录 |
| `scripts/app-release.mjs` | Mac 发布工具，上传 / 回读 APK / SDK 校验 / 签署校验报告 |
| `scripts/app-release-smoke.mjs` | 工程验收工具；仅允许 staging 发布，生产只执行无效制品测试并清理 |

客户端仓库：`/Users/zhouxing/Developer/Android/LuckyTool`。

Worker 与运营台仓库：`/Users/zhouxing/Developer/Backend/CFWorkers/llm-chat-app-template`。

正式发布链路：

```text
正式签名 APK → 运营台分片上传 → Mac 回读云端 APK 并校验
→ Worker 验证签名报告 → 创建版本草稿 → 编辑中英文内容
→ 配置灰度 / 时间 / 最低版本 → 预览与复核 → 独立凭证发布
→ App 检查 → 提醒 → 下载 → 再次校验 → 用户确认安装 → 新版启动确认
```

不需要 Linux、Docker、付费容器或常驻发布电脑。Mac 仅在制品校验时在线；校验完成后，提醒、下载、定时发布和统计均由 Worker 服务提供。

## 2. 免费方案的信任边界

Worker 不运行 Android SDK，不对完整 APK 进行 CPU 密集型哈希计算。分片请求使用固定长度流转发到私有 R2，浏览器提供的分片 SHA-256 只用来恢复时核对本地文件，**不是云端已经验证文件完整性的证明**。

Mac 必须从私有云端接口下载上传完成的实际对象，再使用 Android SDK build-tools 36.0.0 的 `apksigner verify --verbose --print-certs`、`aapt2 dump badging` 检查它。校验包含完整 SHA-256、真实 APK 签名、证书、包名、versionCode、versionName、SDK、ABI、debuggable 与 ZIP 原生库结构。工具不执行 APK 中的代码。

本地工具用独立 P-256 校验私钥签署报告。报告绑定：环境 origin、制品 ID、R2 对象 version、服务端生成的 challenge nonce、签发时间与真实校验结果。Worker 验证固定公钥、五分钟时间窗、挑战值、对象版本、大小及预登记的正式 APK 身份。不通过就不能创建发布草稿。重放、跨环境复用或替换文件不能授权另一份制品。

校验私钥仅存放在发布 Mac，不进入浏览器或 Worker；Worker 只有它的公钥。APK 签名私钥、策略签名私钥、校验报告私钥是三个不同身份。客户端会独立检查下载文件的哈希与包身份；安装前还要在线复核撤回状态。

之前的容器校验与 HMAC 回调已退出当前方案。旧校验记录保留历史数据但不再作为新方案的可分发制品授权，旧待校验制品应重新上传。无需删除 D1 历史表来完成迁移。

## 3. 首次正式发布前准备

### 3.1 正式 APK 身份

当前正式材料位于仓库外 `~/.config/luckytool-release/`，目录 0700，私密文件 0600。已有身份必须复用，不要重新执行初始化覆盖它。

| 文件 | 用途 / 保密要求 |
| --- | --- |
| `luckytool-official.p12` | 正式 APK keystore，严禁上传运营台或 Worker |
| `signing.properties` | 本机构建密码与签名设置，保密 |
| `certificate-sha256.txt`、`official-certificate.der` | 正式证书公开身份 |
| `policy-private.pem` | 客户端策略签名私钥，Worker 需要，保密 |
| `policy-public.der`、`policy-public-base64.txt` | App 内置策略公钥 |
| `attestation-private.pem` | Mac 校验报告私钥，只在发布机保存 |
| `release-config.json` | 本地工具配置，含编辑凭证，保密 |
| `attestation-worker-secrets.json` | Worker 校验公钥映射，不含校验私钥 |
| `worker-production-secrets.json` | Worker 密钥配置与编辑 / 发布凭证，保密 |

**正式签名已建立，不代表已完成异地备份。** 第一次真实发包前，将 keystore、密码配置、策略私钥、校验私钥、公开证书和本地配置做加密离线备份，并验证能恢复。密码另行安全保存，不能把同一磁盘上的复制当成备份。正式 APK 签名身份丢失会导致老用户无法正常覆盖升级。

正式 RevenueCat Android SDK key 仍需由产品方提供。现有 test-store key 不能放进正式 non-debuggable 包。配置到客户端仓库 `local.properties` 的 `revenuecat.android.api.key`，或外部 `signing.properties` 的 `revenueCatApiKey`。缺少正式 key 时构建应失败，不能为了出包退回 debug 签名或测试支付 key。

### 3.2 发布机要求

- Node.js 22 或更高（内置 fetch、流、P-256 签名；发布工具无第三方 npm 依赖）。
- Python 3、Java 17 和 Android SDK build-tools 36.0.0。
- 默认工具目录：`~/Library/Android/sdk/build-tools/36.0.0`；可用 `ANDROID_HOME`、`ANDROID_BUILD_TOOLS` 或 `--build-tools` 指定。
- 正式 Worker 的编辑凭证；发布凭证只在运营台最终复核时输入。

已有本机配置可直接使用。新机器迁移时从安全备份恢复原校验私钥和配置，检查路径与权限，**不要无意生成新身份**。

仅首次初始化新的校验身份时运行：

```bash
cd /Users/zhouxing/Developer/Backend/CFWorkers/llm-chat-app-template
node scripts/app-release.mjs --init
npx wrangler secret bulk "$HOME/.config/luckytool-release/attestation-worker-secrets.json"
```

初始化默认读取同目录 `worker-production-secrets.json`，已有 `release-config.json` 或私钥时拒绝覆盖。第二条命令把公钥配置写入 Worker。初始化不是日常发包步骤。

`release-config.json` 字段为 origin、packageName、certificateSha256、editorToken、keyId、privateKeyFile。正式 origin 必须是 `https://luckyaitool.com`，packageName 必须是 `com.flzxing.lucky`。文件权限过宽时工具拒绝运行。不要截图、提交 Git 或复制到聊天中。

### 3.3 Worker 配置

| 配置 | 说明 |
| --- | --- |
| `APP_RELEASES` | 私有 R2：`lucky-app-releases`，不能开启公开桶绕过发布状态检查 |
| `DB` | 现有 D1：`kmp-ai-db` |
| `UPDATE_RELEASE_CERT_SHA256` | 预登记正式证书 SHA-256，不能从第一个上传包自动学习 |
| `UPDATE_POLICY_PRIVATE_KEY` / `UPDATE_POLICY_KEY_ID` | 策略签名；客户端必须内置对应公钥，当前 key ID `official-v1` |
| `UPDATE_ATTESTATION_PUBLIC_KEYS_JSON` | 校验 key ID 到 P-256 SPKI 公钥的 JSON 映射 |
| `UPDATE_EDITORS_JSON` | 命名编辑凭证 JSON，允许上传和草稿编辑 |
| `UPDATE_PUBLISHERS_JSON` | 命名发布凭证 JSON，允许发布 / 暂停 / 撤回 / 已发布修订 |
| `UPDATE_PACKAGE_NAME` | 正式默认 `com.flzxing.lucky`；staging 明确为 `.updateqa` |

新部署应用迁移 0004、0005、0006。定时任务每五分钟执行定时发布、未完成上传清理、事件与限流记录清理。没有 Queue、Containers 或 Docker 部署步骤。

## 4. 每次发布：推荐的运营台流程

### 第一步：构建正式包

在 Android 仓库执行：

```bash
cd /Users/zhouxing/Developer/Android/LuckyTool
./gradlew :composeApp:assembleRelease \
  -Plucky.versionCode=1 \
  -Plucky.versionName=1.0.0
```

`1` / `1.0.0` 是首版示例。后续 versionCode 必须高于全部已发布、暂停或撤回版本。versionName 只用于展示，不参与升级比较。构建输出在 `composeApp/build/outputs/apk/release/`，使用真实签名后的 APK，不上传 unsigned 包。

正式构建缺少 keystore、显式版本号、策略公钥或正式支付 key 时会失败，不会回退 debug 签名。首个正式 APK 必须已经内置本次升级模块、正式服务地址和正确策略公钥。

当前开发包与正式签名不同，不能跨签名覆盖。不要卸载开发包来伪装同签名升级成功。首次官方安装是建立正式基线；以后的正式版本才从这个基线覆盖升级。

### 第二步：登录并上传

打开 https://luckyaitool.com/ops/releases，使用现有运营登录凭证或命名编辑凭证登录。编辑凭证可以打开发布中心，但不等于正式发布权限。本机负责人可从 `release-config.json` 的 `editorToken` 取得登录口令；独立发布口令在 `worker-production-secrets.json` 的 `UPDATE_PUBLISHERS_JSON` 中，解码该 JSON 字符串后取对应人员的值，不是复制整个 JSON。请安全交接单个角色凭证，不要把整个生产密钥文件发给普通运营。

拖入 APK 或点击“选择 APK”。最大 1 GiB，16 MiB 分片，最多三路并发，失败分片自动重试。上传可以取消，取消清理云端分片。

刷新后重选原 APK 可恢复，会逐片核对已上传摘要，不能只凭文件名和大小续传。该摘要用于防止误选文件；最终安全校验仍由 Mac 回读实际对象完成。未完成上传会话保留 24 小时。

上传完成看到“等待本地校验”是正常状态，此时还不能创建草稿，APK 也不能公开下载。

### 第三步：在 Mac 执行页面给出的命令

切到 Worker 仓库，复制对应制品卡片上的命令：

```bash
cd /Users/zhouxing/Developer/Backend/CFWorkers/llm-chat-app-template
node scripts/app-release.mjs --verify --artifact 实际制品ID
```

工具从 R2 回读实际 APK，完成 SDK 校验并提交签名报告。成功时输出包名、版本和 SHA-256。回到运营台刷新，状态应变成“校验通过”，包名 / 版本 / 证书均只读。

网络中断但未提交报告时，可以对同一制品重新运行上述命令。已经通过的制品不会重复校验或重复提交。APK 身份或真实签名校验失败时标记拒绝；修正构建后上传新的制品，不能手动改字段把错误包变成正式包。

如需保存本次公开校验证据：

```bash
node scripts/app-release.mjs --verify --artifact 实际制品ID \
  --evidence /安全归档目录/release-verification.json
```

证据不包含编辑凭证或私钥。工具运行需要足够空间放置一份回读 APK，结束后清理临时文件。

### 第四步：创建草稿并编辑内容

点击“创建草稿”。简体中文和英文的标题、摘要、完整日志必填。亮点每种语言最多三条，建议每条讲一个用户能理解的变化，不写内部实现术语。

可选上传不超过 400 KB 的 WebP 主视觉；不上传则使用默认极光晶体。不要把版本号、正文和按钮烘焙进图片。图片失败不影响更新操作。

保存草稿，再检查深浅主题、普通 / 强制、下载中 / 待安装预览。离开未保存内容时有确认提示。发布过程中如出现修订冲突，刷新并核对其他人的修改，不能用旧 revision 覆盖。

### 第五步：配置策略

- **首次正式基线**：首次安装验收后可选择 100%，官方稳定下载地址才有可下载包。
- **后续普通版本**：建议 1% → 5% → 25% → 100% 手动放量。匿名安装 ID 稳定分桶，同一设备不会每次检查随机换人群。
- **最低可用 versionCode**：默认 0，表示不强制。设置为 N 后，低于 N 的兼容设备必须更新，不受普通灰度比例限制；它不是目标版本号的展示字段。
- **定时发布**：留空立即发布；输入时间按运营台当前电脑时区解释并转换为时间戳。到期由五分钟定时任务或下一次检查激活，因此不能承诺精确到秒。

不要为了提高安装率随意启用强制升级。强制目标需要兼容全部支持设备；当前 API 26+ / arm64，服务端拒绝以高于 API 26 的制品作为统一强制目标。

### 第六步：发布复核

核对版本、目标系统 / ABI、灰度、最低版本和时间，填写清楚的操作原因，再输入独立发布凭证。强制策略还需要单独勾选确认。

发布凭证仅用于本次提交，不写浏览器持久存储。编辑者凭证不能代替发布凭证。发布后调整内容或比例会产生新的修订与审计；APK 本身不能覆盖。

### 第七步：观察并放量

在“升级表现”检查曝光、下载开始、下载完成、安装发起与实际升级成功，并看失败分类。“操作轨迹”可以查操作者、原因、时间与前后值。

每一阶段统计匿名设备数，转化率以前一阶段为分母。事件可延迟或跨日到达，短时比率可能超过 100%。打开系统安装器不代表成功；新版实际启动确认 versionCode 后才算真实升级。

观察窗口和样本量由实际用户规模决定，不能把没有错误的几次请求等同于足够灰度样本。无异常后再逐档放量；达到 100% 后官方稳定下载入口自动指向该版本。

## 5. 快捷方式：一条命令上传并校验

开发者发包可以省去浏览器上传步骤：

```bash
cd /Users/zhouxing/Developer/Backend/CFWorkers/llm-chat-app-template
node scripts/app-release.mjs --upload \
  --apk /绝对路径/LuckyTool-release.apk \
  --evidence /安全归档目录/release-verification.json
```

工具先校验本地正式 APK，然后分片上传，再回读云端对象重复校验，并核对本地 / 云端完整 SHA-256。此命令**不会发布版本**；内容和最终发布仍在运营台完成。

上传开始会打印制品 ID。若所有分片完成且进入待校验后中断，可用 `--verify --artifact ID` 继续。CLI 不提供断点上传恢复；浏览器上传提供刷新恢复。CLI 中途未完成的会话 24 小时清理，可重新上传。

## 6. 客户端何时收到更新

这是 **App 主动检查**，没有新增推送服务。用户没有打开 App 时，不会仅因运营发布而立即弹窗。

1. 主进程冷启动异步检查；回到前台且距上次检查超过六小时再检查。设置中的“检查更新”可随时检查。
2. 服务端根据真实 versionCode、系统、ABI、官方渠道和匿名安装 ID 返回适用策略；客户端验证签名、绑定关系和有效期。
3. 普通提示等待首屏稳定并避让引导、登录 / 权限弹层和录音。普通同版本自动提示最多每 24 小时一次。“稍后提醒”抑制 24 小时，“忽略此版本”持续到下一版本。
4. 手动检查绕过提醒频控，但不能绕过灰度、兼容性或服务端撤回。开发者设计预览使用隔离数据，不会下载假 APK 或跳过真实校验。
5. 用户点击下载后，DownloadManager 在后台处理网络恢复和下载。弹窗可以收起；更新中心和系统通知可返回。移动网络先确认包大小，Wi-Fi 自动下载默认关闭。取消后清理文件，不会立刻被自动预下载重新拉起。
6. 下载完成展示“安装更新”，不会后台突然启动安装器。客户端检查完整长度 / SHA-256、包名、版本、系统 / ABI 和证书。
7. 用户授权“允许来自此来源”后继续；安装前在线复核版本。若有 Agent 或终端任务，等待结束，或由用户明确确认结束并完成持久化后安装。
8. 系统要求确认时由用户完成。新版下次启动确认真实 versionCode 后上报成功。用户取消安装不计成功。

强制升级只依据有效且验签通过的策略启用门禁；缓存最长 24 小时。没有可验证有效策略时放行并重试，避免服务故障把 App 永久锁住。安装授权仍需在线复核。

## 7. 暂停、撤回与修复

| 操作 | 实际影响 |
| --- | --- |
| 暂停曝光 | 停止新增更新选择；已经选中制品的用户仍可下载和复核安装 |
| 撤回 | 停止曝光、下载和后续安装授权；不可恢复该版本 |
| 修复 | 同一 APK 签名，构建更高 versionCode 的修复包，重新走完整流程 |

已提交系统安装器的请求无法保证追回。Android 降级不是回滚策略，不能把旧版本号重新发布覆盖已经安装的新版本。

发现问题先暂停阻止新增曝光，判断是否制品错误；确认有风险则撤回。记录原因、错误分类和影响范围。稳定下载地址会选择仍有效的最高全量正式版本；没有有效正式版本时返回 404，不会指向测试包或拒绝的包。

## 8. 常见问题

| 问题 | 处理顺序 |
| --- | --- |
| 等待本地校验 | 在 Mac 对该制品运行 `--verify --artifact ID`，完成后刷新 |
| SDK 工具失败 | 检查 Java 17、Python 3、build-tools 36.0.0；使用 `--build-tools` 指定实际路径 |
| 包身份被拒绝 | 检查是否上传 debug / `.updateqa` 包、是否正式证书、是否 non-debuggable；重新构建，不放宽校验 |
| 报告过期 / wrong origin | 校准系统时间，确认 config 的环境，重新执行校验命令 |
| 对象绑定不一致 | 重新获取正确制品；云端对象发生变化时不能复用旧报告 |
| 上传恢复失败 | 重选原 APK，确认文件没有重新打包；必要时取消旧会话重新上传 |
| 8 GiB 配额满 | 清理未发布的取消 / 拒绝 / 废弃制品；被版本引用的 APK 不允许直接删除 |
| 不能发布 | 检查独立发布凭证、操作原因、内容必填项、revision、递增版本与兼容性 |
| 手机没提示 | 检查包名 / 版本、已发布状态、兼容性、灰度、六小时检查间隔、24 小时提醒或忽略记录；先手动检查 |
| 安装失败 | 查更新中心错误：空间、来源权限、用户取消、系统阻止、签名冲突或文件损坏；不能仅看安装发起事件 |
| 稳定下载 404 | 没有通过校验且已发布 100% 的正式包；首次正式基线尚未发布时属于预期 |

删除未被版本引用的制品使用受编辑凭证保护的 `DELETE /v1/admin/app-updates/uploads/{artifactId}`。先列出并核对 ID；不要把凭证明文拼在 Shell 命令中或写入日志。现有发布工具不提供批量删除历史版本的命令。

## 9. 成本与容量边界

此升级功能不依赖 Workers Paid，不使用付费 Containers 或任何自建服务器。免费 Worker 的 CPU / 请求限额以及 D1 / R2 的免费额度仍然适用，不能承诺无限用户和无限存储永远零费用。

R2 免费标准存储为 10 GB-month，免费 Class A / B 操作分别为每月 100 万 / 1000 万，直接 R2 出站免费。额度按账户计算，**主题桶与 APK 桶共享免费额度**。当前升级功能有独立 8 GiB 制品预约配额；它不是 Cloudflare 账户的绝对零账单开关，也不能替代对主题数据、临时分片和实际月用量的监测。参考 [R2 官方价格](https://developers.cloudflare.com/r2/pricing/) 和 [Workers 限额](https://developers.cloudflare.com/workers/platform/limits/)。

保留有意义的正式版本，及时清理废弃上传。事件保存 30 天，不收集聊天、文件或终端内容。记录匿名事件去重、限流；每日请求额度仍需在 Cloudflare Dashboard 查看。若逼近免费额度，优先降低非必要遥测与清理存储，再决定后续方案；不会自动开通付费服务。

## 10. 工程部署与验证

```bash
npm run test:services
npm run test:release-tools
npx tsc --noEmit
npm --prefix ops test
npm --prefix ops run test:e2e
npm --prefix ops run build
npx wrangler deploy --dry-run
npx wrangler d1 migrations apply kmp-ai-db --remote
npx wrangler deploy
```

先在隔离 staging 应用迁移、部署并上传 `.updateqa` 真包，完成发布、Range、暂停、强制策略、撤回验收，再部署正式 Worker。不要拿 `.updateqa` 或 debug 包填充正式下载入口。

上线证据和本次部署信息见 [免费方案验收记录](app-updates-validation-2026-10-11.md)。Android 原有实机 / 模拟器验证证据位于客户端 `docs/releases/validation-2026-10-11.md`；历史容器记录是旧方案历史，不代表当前线上依赖容器。

## 11. 密钥轮换与交接

- APK 签名身份不能随意轮换；先保住长期覆盖升级能力。
- 校验报告公钥支持 key ID 映射。受控新增发布机时生成新校验密钥，把新公钥加入 Worker；确认新机工作后移除旧公钥，保留审计身份。私钥丢失时撤销相应公钥，不能改为无签名报告。
- 策略签名公钥内置 App，不能只换 Worker 私钥；需要先设计客户端公钥兼容与迁移。
- 编辑与发布凭证分开保存，按角色交接；不要把整个生产 secrets 文件给普通运营人员。
- 交接时演练一次上传、校验、草稿保存和隔离发布 / 撤回，并验证签名材料的备份恢复。
