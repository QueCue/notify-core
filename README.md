# notify-core

简体中文 | [English](README.en.md)

面向 Node.js 的轻量 Telegram／飞书通讯库：消息规划、Markdown 子集渲染、Unicode 安全分段、HTTP 边界和可注入的 Telegram API。**不绑定具体业务或应用。**

代码最初提取自 [dev-notify](https://github.com/QueCue/dev-notify)，在 [QueCue/notify-core](https://github.com/QueCue/notify-core) 独立维护。

- ESM，提供 TypeScript 类型，要求 Node.js 22 或更新版本。
- 无第三方运行时依赖；使用 Node 内置 `fetch` 和 `crypto`。
- Telegram：发送消息，以及有限的查询／按钮 API；飞书：自定义机器人 Webhook 发送，**不包含飞书消息或卡片回调接收服务**。
- 不读取环境变量或配置文件来取得凭据，不访问系统凭据库，不启动轮询或后台服务；单纯导入不会联网。

## 当前状态与安装

源码使用 MIT 许可证，npm 包名为 `@quecue/notify-core`。实际可用版本以 registry 为准：

```sh
npm view @quecue/notify-core version --registry=https://registry.npmjs.org/
npm install @quecue/notify-core@0.1.0
```

应用可将它声明为普通运行时依赖，npm 会自动安装，不需要用户检出本仓库、复制 vendor 包或手工嵌入通讯源码。ESM／类型入口均通过 `@quecue/notify-core` 导入。

如需从源码构建或测试尚未发布的修改，也可生成本地候选包：

```sh
npm ci --ignore-scripts
npm test
node -e "require('node:fs').mkdirSync('releases', {recursive: true})"
npm pack --pack-destination releases
```

在你的 Node.js 项目中安装生成的文件（将路径换为实际位置）：

```sh
npm install /path/to/quecue-notify-core-0.1.0.tgz
```

`npm ci` 需要完整源码检出，包括锁文件；不需要同时检出其他项目。运行时只支持本包声明的 ESM 入口，不保证 `require()` 或浏览器环境兼容性。

## 快速开始：双渠道消息规划

```js
import { makePlan, deliver } from '@quecue/notify-core';

// 环境变量由应用主动读取；库本身不发现、保存或验证你的凭据来源。
const config = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN ?? '',
    chatIds: [process.env.TELEGRAM_CHAT_ID ?? ''],
  },
  feishu: {
    webhook: process.env.FEISHU_WEBHOOK ?? '',
    secret: process.env.FEISHU_SECRET ?? '',
  },
};
const message = {
  title: '构建完成',
  content: '**结果**：通过\n\n' + '完整输出\n'.repeat(1000),
  footer: '来自 CI',
  level: 'success',
};

// makePlan 只规划，不联网。由应用先校验渠道凭据和接收人，再明确发送。
const plan = makePlan('telegram', message, config);
console.log(`准备发送 ${plan.items.length} 段`);
// const result = await deliver(plan, config); // 取消注释会向 Telegram 真实发送。
// if (!result.ok) console.error(result.error);
```

飞书改用 `makePlan('feishu', message, config)`；`secret` 非空时按飞书自定义机器人协议签名。`enabled`、默认渠道、环境变量优先级和接收人授权都是应用职责，不是 `NotifyConfig` 的字段。接口使用结构类型；不要把非空字符串误认为已经验证了 Token 或 Webhook。

### 离线模拟投递

```js
import { makePlan, deliver } from '@quecue/notify-core';
const config = {
  telegram: { token: '123:TEST_ONLY', chatIds: ['111'] },
  feishu: { webhook: '', secret: '' },
};
const plan = makePlan('telegram', {
  title: '离线示例', content: '不会联网', footer: '', level: 'info',
}, config);
const result = await deliver(plan, config, async () => ({
  ok: true, result: { message_id: 1 },
}));
console.log(result.ok); // true；使用注入传输，没有真实发送。
```

## 核心接口

| 接口 | 用途与默认边界 |
| --- | --- |
| `createChannels(translate?)` | 创建消息规划／投递实例；翻译只作用于该实例 |
| `makePlan(channel, message, config)` | 生成发送计划，不联网、不检查账号真实有效性 |
| `deliver(plan, config, request?, sleep?)` | 顺序投递，返回 `{channel,sent,planned,ok,error?}`；失败后停止该接收人的后续分段，其他接收人继续 |
| `createFormatting(translate?)` | 创建 Markdown 子集解析与分段函数；不是完整 CommonMark 实现 |
| `splitPlainText(text, limit = 4000)` | 按 UTF-16 单元预算分段，不切断代理对；保持正文，不保证不拆开组合字形或整条消息原子投递 |
| `createTransport(options?)` | 10 秒超时、1 MiB 响应上限、禁止重定向、严格 UTF-8／JSON 对象检查；返回可注入 `fetcher` 的请求函数 |
| `createTelegramApi(token, options?)` | 固定 Telegram 方法集合，不启动轮询、不持久化 offset、不提供身份授权 |

Markdown 支持标题、引用、列表、内联强调、代码和表格的可读渲染，链接地址保留在可见文字中。Telegram 解析失败可回退纯文本；飞书卡片组件被拒绝时可尝试兼容组件。过长标题／footer 等不能安全分段时明确失败，不悄悄截断。

`reply` 是可选展示信息：`{token,url,users,callbackData?}`，分别用于按钮标识、飞书跳转 URL、展示 Telegram 按钮的接收人列表及自定义回调数据。默认回调数据为 `reply:` 加 `token`。**这些字段不授予权限**；宿主仍须校验用户、回调长度、过期时间、会话路由和接收端身份。

### 传输与代理

公共库不内置代理地址配置。需要代理时，应用通过 `request` 或 `fetcher` 注入自己的 HTTP 客户端，并保留超时、TLS 校验、禁止重定向和响应大小限制。默认 `fetch` 的代理行为受 Node 运行时及启动配置影响；库不会承诺无条件直连。

`createTransport({timeoutMs,maxResponseBytes,translate})` 返回的函数签名为 `(url,payload,fetcher?)`。它是通用 JSON 传输，**不限制目标 URL**；应用必须验证目标域名、协议和接收人，不能直接接受外部不可信 URL。

### Telegram 查询与按钮

```js
import { createTelegramApi, TelegramApiError } from '@quecue/notify-core';
const api = createTelegramApi(process.env.TELEGRAM_BOT_TOKEN ?? '', {
  maxRateLimitWaitSeconds: 0, // 交由应用决定何时再请求；不会忽略限流错误。
});
// const bot = await api('getMe', {}); // 明确调用才联网。
```

允许的方法仅为 `sendMessage`、`editMessageReplyMarkup`、`answerCallbackQuery`、`getMe`、`getUpdates` 和 `getWebhookInfo`。不会删除现有 Webhook。`getUpdates` 与 Webhook 互斥，同一个 Bot 只能有一个更新消费者；offset、去重、积压消息、业务授权和进程互斥由应用管理。

## 错误、重试与投递语义

- 内置传输不把底层 URL、响应原文或网络异常原文放进它生成的安全错误。`NotifyError` 是公共基类，`TransportError`、`HttpError` 和 `TelegramApiError` 可按类型处理。自定义翻译／传输／回调不在此保证内，调用方须自行脱敏。
- `HttpError.status` 是已解析响应的 HTTP 状态；无效 JSON／UTF-8 等可能先表现为 `TransportError`。不要假设所有 HTTP 401 都必然映射为某一种错误。
- `TelegramApiError` 提供 `code`、`retryAfterSeconds`、`fatal`；`fatal` 只对 401／404／409 为真，是供宿主参考的标记，不会自动退出进程。
- `createTelegramApi` 默认对一次 429 进行至多一次等待重试，等待阈值为 60 秒；`maxRateLimitWaitSeconds: 0` 关闭内层等待。其余网络失败不自动重发。
- `deliver` 有自己的策略：Telegram 明确 429 且有效 `retry_after` 在 60 秒内时有限重试；格式兼容回退只处理当前分段；飞书成功分段间等待 250 毫秒。上述回退叠加时不能理解为整个调用只会发生两次 HTTP 请求。
- 服务端可能已接受消息，但响应丢失，投递结果会未知；**不保证恰好一次、离线补发或整个长消息的原子性**。
- `onSent` 在服务端报告成功后调用。若映射／回调失败，`sent` 仍可能大于零而 `ok` 为 false；不要因此重发整条计划，否则可能重复通知。

## 开发、版本与安全

当前自动化测试使用模拟网络，不代表已完成全部 Node 版本、代理环境或真实平台验收。复用库源码不代表共享应用的凭据或系统权限。

- [安全边界与报告方式](SECURITY.md)
- [贡献与本地验证](CONTRIBUTING.md)
- [发布前检查与版本包更新](PUBLISHING.md)
- [变更记录](CHANGELOG.md)
- [MIT 许可证](LICENSE)
