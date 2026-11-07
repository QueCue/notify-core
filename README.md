# notify-core

简体中文 | [English](README.en.md)

面向 Node.js 的轻量 Telegram／飞书通讯库：消息规划、Markdown 子集渲染、Unicode 安全分段、HTTP 边界和可注入的 Telegram API。**不绑定具体业务或应用。**

代码最初提取自 [dev-notify](https://github.com/QueCue/dev-notify)，在 [QueCue/notify-core](https://github.com/QueCue/notify-core) 独立维护。

- ESM，提供 TypeScript 类型，要求 Node.js 22 或更新版本。
- Webhook／Telegram 传输使用 Node 内置 `fetch` 和 `crypto`；飞书客户端新增官方 MIT 许可 SDK `@larksuiteoapi/node-sdk`，运行时依赖固定为 `1.76.0`。
- Telegram：发送消息，以及有限的查询／按钮 API；飞书：自定义机器人 Webhook 发送，以及自建应用 WebSocket 收消息、HTTP API 发送／回复；**不支持卡片动作回调**。
- 不读取环境变量或配置文件来取得凭据，不访问系统凭据库，不自动启动轮询或长连接。导入和创建飞书客户端均不联网，SDK 懒加载；显式 `start()` 才启动接收。

## 当前状态与安装

源码使用 MIT 许可证，npm 包名为 `@quecue/notify-core`。从 `0.2.0` 起提供下述飞书自建应用客户端，版本变化见[变更记录](CHANGELOG.md)。实际可用版本以 registry 为准：

```sh
npm view @quecue/notify-core version --registry=https://registry.npmjs.org/
npm install @quecue/notify-core@0.2.0
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
npm install /path/to/quecue-notify-core-0.2.0.tgz
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
| `createFeishuClient({appId,appSecret}, options)` | 同步创建自建应用客户端；显式 `start()` 接收消息，`sendMessage`／`replyMessage` 通过 HTTP 发送 |

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

### 飞书自建应用：长连接接收与 HTTP 回复

此入口独立于现有 Webhook `makePlan`／`deliver`，`NotifyConfig` 不变。**只有自建应用支持长连接；自定义机器人 Webhook 地址和 `secret` 不能用于接收。** WebSocket 仅接收 `im.message.receive_v1` 消息事件，发送／回复走 HTTP API，不支持卡片动作回调，也不需要宿主提供公网回调地址。

先在飞书开放平台完成配置：

1. 创建自建应用并启用机器人能力。
2. 在“事件与回调”选择长连接模式，订阅 `im.message.receive_v1`。
3. 申请发送权限 `im:message:send_as_bot`，按需申请私聊接收权限 `im:message.p2p_msg:readonly`、群聊 @机器人接收权限 `im:message.group_at_msg:readonly`；具体权限、审批及可见范围以平台为准。
4. 发布应用版本，并确保使用账号在应用可用范围内；运行环境需能访问飞书公网服务。

最小接收并回复示例（只允许宿主指定的用户，生产环境还需去重和完整授权）：

```js
import { createFeishuClient } from '@quecue/notify-core';

// 凭据及授权名单仍由宿主读取；不要把真实值写进源码。
const allowedOpenId = process.env.FEISHU_ALLOWED_OPEN_ID ?? '';
const client = createFeishuClient({
  appId: process.env.FEISHU_APP_ID ?? '',
  appSecret: process.env.FEISHU_APP_SECRET ?? '',
}, {
  onMessage: async (event) => {
    // 防止机器人自回复，并验证发送者；不要对所有入站消息自动执行业务。
    if (event.sender.sender_type !== 'user' || !allowedOpenId ||
        event.sender.sender_id?.open_id !== allowedOpenId) return;
    if (event.message.message_type !== 'text') return;
    const content = JSON.parse(event.message.content);
    if (typeof content.text !== 'string') return;
    await client.replyMessage(event.message.message_id, {
      msgType: 'text',
      content: JSON.stringify({ text: '收到你的文本消息' }),
    });
  },
  onError: (error) => console.error('飞书操作失败', error.operation),
  startTimeoutMs: 10_000,
}); // 同步返回，不联网。

process.once('SIGINT', () => client.stop());
await client.start(); // 主动联网；实际 WebSocket ready 后才完成。
```

`onMessage` 收到 SDK 原格式 `FeishuMessageEvent`，不是包含额外 `event` 层的包装：`event.event_id?`、`event.sender.sender_id.open_id?`、`event.sender.sender_type`，以及 `event.message` 的 `message_id`、`chat_id`、`chat_type`、`message_type`、`content`。`content` 是 JSON 字符串，可用 `JSON.parse`；非文本消息不要假设存在 `text` 字段。

客户端约定：

- `createFeishuClient({appId,appSecret}, {onMessage, onError?, startTimeoutMs?, adapterFactory?})` 同步返回客户端。`adapterFactory` 用于离线测试或自定义 SDK 适配器；自定义实现须自行维护网络和脱敏边界。
- `await client.start()` 等待实际 WS ready，默认超时 `10000` 毫秒；超时或致命错误使 Promise 拒绝，重复 `start()` 幂等。`client.state` 为 `idle`／`connecting`／`connected`／`reconnecting`／`failed`／`stopped`。
- `client.stop()` 同步关闭长连接并禁用重连，取消正在等待的 `start()`（其 Promise 拒绝）；之后可再次 `start()`。它**不等待或取消**已执行中的消息回调或 HTTP 请求。
- `onMessage` 会被 await，必须在 **3 秒内结束**。失败会先安全报告给 `onError`，再抛安全错误，让 SDK 返回失败 ACK。`onError` 自身抛错或拒绝会被库隔离，不输出原日志。HTTP 请求的 10 秒超时不是消息回调的时间预算。
- 宿主负责按 `event_id`／`message_id` 去重、发送者／会话授权、防机器人自回复，并将耗时任务放入持久队列。断线与重推不保证恰好一次，重试回调可能重复业务副作用；上例未实现持久去重。相同应用的多个长连客户端按集群模式接收，不是广播。

主动发送不要求先 `start()`，会直接通过 HTTP 联网：

```js
const sent = await client.sendMessage({
  receiveId: 'oc_EXAMPLE', // 换成宿主验证过的接收人。
  receiveIdType: 'chat_id', // 可省略，默认 chat_id。
  msgType: 'text',
  content: JSON.stringify({ text: '主动发送' }),
  // uuid: '由宿主提供的请求标识',
});
// sent: { messageId, chatId? }
```

`client.replyMessage(messageId, {msgType, content, replyInThread?, uuid?})` 同样返回 `{messageId,chatId?}`，`content` 使用相应消息类型的 JSON 字符串；这两个方法不经过消息规划或自动分段。

官方 MIT 许可 SDK `@larksuiteoapi/node-sdk@1.76.0` 负责应用 token、二进制协议、分帧、心跳和重连；默认不输出 SDK 日志。SDK HTTP 独立配置为 10 秒超时、1 MiB 上限、禁止重定向；**WebSocket 帧不适用 `createTransport` 的 1 MiB JSON 响应保证**，也不通过该传输的 `request`／`fetcher` 注入。

参考：[官方 SDK 长连接接收事件](https://github.com/larksuite/node-sdk#receive-events-by-websocket-connection)。

## 错误、重试与投递语义

- 内置传输不把底层 URL、响应原文或网络异常原文放进它生成的安全错误。`NotifyError` 是公共基类，`TransportError`、`HttpError`、`TelegramApiError` 和 `FeishuError` 可按类型处理。自定义翻译／传输及业务回调自身的输出不在此保证内，调用方须自行脱敏。
- `HttpError.status` 是已解析响应的 HTTP 状态；无效 JSON／UTF-8 等可能先表现为 `TransportError`。不要假设所有 HTTP 401 都必然映射为某一种错误。
- `FeishuError extends NotifyError`：`operation` 区分 `configuration`／`connection`／`stopped`／`send`／`reply`／`handler`，`code?` 为数值；生成的错误不包含 SDK 原文。消息处理失败会被包装为安全错误，不会把业务回调原异常交给 SDK 或 `onError`。
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
