# notify-core

English | [简体中文](README.md)

A small Node.js library for Telegram and Feishu: message planning, a Markdown rendering subset, Unicode-safe splitting, bounded JSON transport, and an injectable Telegram API. **It does not implement application-specific workflows.**

Originally extracted from [dev-notify](https://github.com/QueCue/dev-notify) and maintained independently at [QueCue/notify-core](https://github.com/QueCue/notify-core).

- ESM with TypeScript declarations; Node.js 22 or later.
- No third-party runtime dependencies; uses built-in `fetch` and `crypto`.
- Telegram message sending and selected query/button APIs; Feishu custom-bot Webhook sending, **not Feishu inbound events or card callbacks**.
- Importing does not read credentials, application configuration or keyrings, start polling, or perform network requests.

## Status and installation

MIT-licensed source; npm package name: `@quecue/notify-core`. The registry is authoritative for available versions:

```sh
npm view @quecue/notify-core version --registry=https://registry.npmjs.org/
npm install @quecue/notify-core@0.1.0
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
npm install /path/to/quecue-notify-core-0.1.0.tgz
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

## Errors and delivery semantics

- Built-in transport-generated safe errors omit original URLs, response bodies and underlying network exception text. `NotifyError` is the base class for `TransportError`, `HttpError` and `TelegramApiError`. Custom translators, transports and callbacks are outside this guarantee and must sanitize their own errors.
- `HttpError.status` describes an already-parsed HTTP failure. Invalid JSON or UTF-8 may first produce `TransportError`; not every HTTP 401 is guaranteed to become the same error type.
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
