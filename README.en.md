# notify-core

English | [简体中文](README.md)

A small Node.js library for Telegram and Feishu: message planning, a Markdown rendering subset, Unicode-safe splitting, bounded JSON transport, and an injectable Telegram API. **It does not implement application-specific workflows.**

Originally extracted from [dev-notify](https://github.com/QueCue/dev-notify) and maintained independently at [QueCue/notify-core](https://github.com/QueCue/notify-core).

- ESM with TypeScript declarations; Node.js 22 or later.
- Webhook/Telegram transport uses built-in `fetch` and `crypto`; the Feishu client adds the official MIT-licensed `@larksuiteoapi/node-sdk`, pinned to `1.76.0` as a runtime dependency.
- Telegram sending and selected query/button APIs; Feishu custom-bot Webhook sending plus self-built app WebSocket message reception and HTTP sending/replies; **no card-action callbacks**.
- No credential discovery from environment variables, application configuration or keyrings, and no automatic polling or long connections. Importing and creating a Feishu client are offline; the SDK is lazy-loaded, and reception requires an explicit `start()`.

## Status and installation

MIT-licensed source; npm package name: `@quecue/notify-core`. The Feishu self-built app client below is available starting with `0.2.0`; see the [changelog](CHANGELOG.en.md). The registry is authoritative for available versions:

```sh
npm view @quecue/notify-core version --registry=https://registry.npmjs.org/
npm install @quecue/notify-core@0.2.0
```

Applications can declare it as a normal runtime dependency. npm installs it automatically, without a source checkout, vendor archive or embedded copy. Import the ESM API and declarations through `@quecue/notify-core`.

For source development or unpublished changes, build a local candidate package:

```sh
npm ci --ignore-scripts
npm test
node -e "require('node:fs').mkdirSync('releases', {recursive: true})"
npm pack --pack-destination releases
```

Install the generated file in your own Node.js application, replacing the path:

```sh
npm install /path/to/quecue-notify-core-0.2.0.tgz
```

No other project needs to be checked out. Use the declared ESM entry; CommonJS `require()` and browser compatibility are not guaranteed.

## Quick start

```js
import { makePlan, deliver } from '@quecue/notify-core';

// The application reads and validates credentials; the library does not discover them.
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
  title: 'Build completed',
  content: '**Result**: passed\n\n' + 'Full output\n'.repeat(1000),
  footer: 'From CI',
  level: 'success',
};

// Planning is offline. Validate credentials and recipients before choosing to send.
const plan = makePlan('telegram', message, config);
console.log(`Planned ${plan.items.length} parts`);
// const result = await deliver(plan, config); // Uncommenting performs a real send.
// if (!result.ok) console.error(result.error);
```

For Feishu, use `makePlan('feishu', message, config)`; a non-empty `secret` enables custom-bot signing. Channel enablement, credential precedence and authorization belong to the application, not `NotifyConfig`. A non-empty string does not prove that a credential or destination is valid.

### Offline delivery example

```js
import { makePlan, deliver } from '@quecue/notify-core';
const config = {
  telegram: { token: '123:TEST_ONLY', chatIds: ['111'] },
  feishu: { webhook: '', secret: '' },
};
const plan = makePlan('telegram', {
  title: 'Offline example', content: 'No network', footer: '', level: 'info',
}, config);
const result = await deliver(plan, config, async () => ({
  ok: true, result: { message_id: 1 },
}));
console.log(result.ok); // true; the injected transport performs no real request.
```

## API and boundaries

| API | Behavior |
| --- | --- |
| `createChannels(translate?)` | Per-instance message planner and delivery functions |
| `makePlan(channel, message, config)` | Offline planning, without credential or account validation |
| `deliver(plan, config, request?, sleep?)` | Sequential delivery returning `{channel,sent,planned,ok,error?}`; stops remaining parts for a failed recipient while continuing others |
| `createFormatting(translate?)` | Markdown subset parsing and splitting, not full CommonMark |
| `splitPlainText(text, limit = 4000)` | UTF-16-unit budget without splitting surrogate pairs; not grapheme-cluster or atomic-delivery protection |
| `createTransport(options?)` | Defaults to a 10-second timeout, 1 MiB response limit, no redirects, strict UTF-8 and JSON-object checks; supports an injected fetcher |
| `createTelegramApi(token, options?)` | Selected API methods, without a polling loop, offset persistence or authorization |
| `createFeishuClient({appId,appSecret}, options)` | Synchronously creates a self-built app client; explicit `start()` receives messages, while `sendMessage`/`replyMessage` use HTTP |

Markdown supports readable headings, quotations, lists, emphasis, code and tables. Link addresses remain visible. Telegram parse rejection can fall back to plain text; Feishu can retry using compatible card components. Metadata that cannot fit safely is rejected instead of silently truncated.

Optional `reply` metadata is `{token,url,users,callbackData?}`: an identifier, a Feishu link, recipients shown Telegram buttons, and optional callback data. The default callback data is `reply:` plus `token`. **This does not grant input permission**; the host must validate identities, callback length, expiry, routing and authorization.

### Transport and proxies

There is no built-in proxy URL setting. Inject an application-owned `request` or `fetcher` when required, preserving timeout, TLS, redirect and response-size protections. Default `fetch` proxy behavior depends on Node and startup configuration; unconditional direct connectivity is not guaranteed.

`createTransport({timeoutMs,maxResponseBytes,translate})` returns `(url,payload,fetcher?)`. This generic transport **does not restrict destination URLs**. Applications must validate schemes, domains and recipients rather than passing untrusted external URLs directly.

### Telegram methods

```js
import { createTelegramApi, TelegramApiError } from '@quecue/notify-core';
const api = createTelegramApi(process.env.TELEGRAM_BOT_TOKEN ?? '', {
  maxRateLimitWaitSeconds: 0, // Let the application schedule retries; errors remain visible.
});
// const bot = await api('getMe', {}); // An explicit call performs network I/O.
```

Allowed methods: `sendMessage`, `editMessageReplyMarkup`, `answerCallbackQuery`, `getMe`, `getUpdates`, `getWebhookInfo`. The library never deletes a Webhook. `getUpdates` and Webhooks are mutually exclusive; only one consumer may receive a Bot's updates. The application owns offsets, deduplication, backlogs and process coordination.

### Feishu self-built apps: WebSocket reception and HTTP replies

This client is separate from existing Webhook `makePlan`/`deliver`; `NotifyConfig` is unchanged. **Only self-built apps support long connections; custom-bot Webhook URLs and secrets cannot receive events.** WebSocket receives only `im.message.receive_v1` message events; sends/replies use HTTP APIs. Card-action callbacks are unsupported, and the host does not need a public callback endpoint.

Configure the app in the Feishu developer console first:

1. Create a self-built app and enable its bot capability.
2. Select long-connection mode under events and callbacks, and subscribe to `im.message.receive_v1`.
3. Request `im:message:send_as_bot` for sending, and as needed `im:message.p2p_msg:readonly` for private messages and `im:message.group_at_msg:readonly` for group mentions. The platform is authoritative for permissions, approvals and visibility.
4. Publish an app version and ensure the user account is within its availability scope. The runtime needs outbound access to Feishu services.

Minimal receive-and-reply example (host-selected user only; production also needs deduplication and full authorization):

```js
import { createFeishuClient } from '@quecue/notify-core';

// The host still reads credentials and the allowlist; never hard-code real values.
const allowedOpenId = process.env.FEISHU_ALLOWED_OPEN_ID ?? '';
const client = createFeishuClient({
  appId: process.env.FEISHU_APP_ID ?? '',
  appSecret: process.env.FEISHU_APP_SECRET ?? '',
}, {
  onMessage: async (event) => {
    // Avoid bot self-replies and check the sender before executing any business action.
    if (event.sender.sender_type !== 'user' || !allowedOpenId ||
        event.sender.sender_id?.open_id !== allowedOpenId) return;
    if (event.message.message_type !== 'text') return;
    const content = JSON.parse(event.message.content);
    if (typeof content.text !== 'string') return;
    await client.replyMessage(event.message.message_id, {
      msgType: 'text',
      content: JSON.stringify({ text: 'Received your text message' }),
    });
  },
  onError: (error) => console.error('Feishu operation failed', error.operation),
  startTimeoutMs: 10_000,
}); // Synchronous, offline creation.

process.once('SIGINT', () => client.stop());
await client.start(); // Explicit network access; resolves only when WebSocket is ready.
```

`onMessage` receives the SDK-shaped `FeishuMessageEvent`, not a wrapper with an extra `event` layer: `event.event_id?`, `event.sender.sender_id.open_id?`, `event.sender.sender_type`, and `event.message` fields `message_id`, `chat_id`, `chat_type`, `message_type`, `content`. `content` is a JSON string suitable for `JSON.parse`; do not assume non-text messages have a `text` field.

Client contract:

- `createFeishuClient({appId,appSecret}, {onMessage, onError?, startTimeoutMs?, adapterFactory?})` returns synchronously. `adapterFactory` supports offline tests or a custom SDK adapter; custom implementations own their network and redaction boundaries.
- `await client.start()` waits for actual WS readiness, with a default `10000` ms timeout. Timeout or fatal errors reject the Promise; repeated `start()` is idempotent. `client.state` is `idle`, `connecting`, `connected`, `reconnecting`, `failed` or `stopped`.
- `client.stop()` synchronously closes the connection and disables reconnection, canceling a pending `start()` by rejecting its Promise; the client can be started again. It **does not wait for or cancel** callbacks or HTTP requests already in progress.
- `onMessage` is awaited and must finish within **3 seconds**. Failure is safely reported to `onError`, then a safe error is thrown so the SDK returns a failure ACK. Throws/rejections from `onError` are isolated without logging the original error. The 10-second HTTP timeout is not the callback time budget.
- The host owns `event_id`/`message_id` deduplication, sender/chat authorization, bot self-reply prevention and a durable queue for slow work. Disconnects/redelivery provide no exactly-once guarantee; callback retries can repeat business effects. The example does not implement durable deduplication. Multiple long-connected clients for one app receive in cluster mode, not broadcast mode.

Sending does not require `start()` and makes an HTTP request directly:

```js
const sent = await client.sendMessage({
  receiveId: 'oc_EXAMPLE', // Replace with a host-validated recipient.
  receiveIdType: 'chat_id', // Optional; defaults to chat_id.
  msgType: 'text',
  content: JSON.stringify({ text: 'Proactive message' }),
  // uuid: 'host-provided-request-id',
});
// sent: { messageId, chatId? }
```

`client.replyMessage(messageId, {msgType, content, replyInThread?, uuid?})` also returns `{messageId,chatId?}`; `content` is a JSON string for the selected message type. Neither method uses message planning or automatic splitting.

The official MIT-licensed `@larksuiteoapi/node-sdk@1.76.0` handles app tokens, the binary protocol, framing, heartbeats and reconnection; SDK logging is disabled by default. SDK HTTP is independently configured with a 10-second timeout, 1 MiB limit and no redirects. **WebSocket frames are not covered by `createTransport`'s 1 MiB JSON-response guarantee**, nor do they use its `request`/`fetcher` injection.

Reference: [official SDK WebSocket event reception](https://github.com/larksuite/node-sdk#receive-events-by-websocket-connection).

## Errors and delivery semantics

- Built-in transport-generated safe errors omit original URLs, response bodies and underlying network exception text. `NotifyError` is the base class for `TransportError`, `HttpError`, `TelegramApiError` and `FeishuError`. Custom translators, transports and callback-owned output are outside this guarantee and must be sanitized by the caller.
- `HttpError.status` describes an already-parsed HTTP failure. Invalid JSON or UTF-8 may first produce `TransportError`; not every HTTP 401 is guaranteed to become the same error type.
- `FeishuError extends NotifyError`: `operation` is `configuration`, `connection`, `stopped`, `send`, `reply` or `handler`; optional `code` is numeric. Generated errors omit SDK text. Handler failures are wrapped as safe errors rather than forwarding the original callback exception to the SDK or `onError`.
- `TelegramApiError` has `code`, `retryAfterSeconds` and `fatal`. `fatal` is true only for 401/404/409 and does not terminate the host process.
- `createTelegramApi` retries a 429 at most once within its default 60-second wait threshold. Set `maxRateLimitWaitSeconds: 0` to disable this internal wait. Other network failures are not automatically resent.
- `deliver` has separate handling for valid Telegram 429 waits up to 60 seconds, format fallback for the current part, and 250 ms spacing between successful Feishu parts. Combined fallback paths do not imply a two-request maximum for the whole operation.
- A timeout can occur after server acceptance: **no exactly-once delivery, durable offline queue, or multipart atomicity is promised**.
- `onSent` runs after reported server success. If mapping or the callback fails, `sent` may be positive while `ok` is false. Retrying the entire plan can duplicate messages.

Tests use simulated network responses, not exhaustive real-service, proxy or Node-version acceptance. Sharing this library does not share application credentials or permissions.

## Development

- [Security boundaries and reporting](SECURITY.en.md)
- [Contribution and local checks](CONTRIBUTING.md)
- [Release checklist](PUBLISHING.md)
- [Changes](CHANGELOG.en.md)
- [MIT license](LICENSE)
