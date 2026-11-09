# Security boundaries

English | [简体中文](SECURITY.md)

This is a communication library, not an authorization system or security agent. MIT licensing does not imply an independent security audit or suitability for every environment; no such audit is claimed.

## Data and network

- Importing and creating a Feishu client are offline and do not read environment credentials, application configuration or system keyrings. Explicit sends/API calls transmit content; Feishu `start()` initiates network reception, while `sendMessage`/`replyMessage`/`updateMessage` use HTTP without requiring startup. Service-side retention is outside this library's control.
- The Telegram factory fixes its official HTTPS base and limits methods. Generic JSON transport and Feishu Webhook configuration are **not URL access controls**. Hosts must validate schemes, destination domains, recipients and links; never pass untrusted external URLs directly.
- Default transport preserves runtime TLS verification, rejects redirects, defaults to 10 seconds and 1 MiB, and checks UTF-8 and JSON objects. Limits are configurable; weakened settings or substituted transports require their own review.
- The Feishu client adds the official MIT-licensed runtime dependency `@larksuiteoapi/node-sdk`, pinned to `1.76.0` and lazy-loaded. It manages app tokens, the binary protocol, framing, heartbeats and reconnection. SDK HTTP is independently configured with a 10-second timeout, 1 MiB limit and no redirects. **SDK WebSocket frames are outside `createTransport`'s 1 MiB JSON-response guarantee**; do not extend that guarantee to all SDK traffic.
- Proxy configuration belongs to the host. Default fetch behavior depends on Node startup and network settings; unconditional proxy bypass is not promised.
- Built-in safe error summaries omit original URLs, response bodies and underlying network exception text. This is not general content redaction: titles, bodies, footers, buttons, custom translators, injected transports and callbacks can contain sensitive data.
- `NotifyConfig` is a type contract, not account validation or exhaustive runtime schema validation. Hosts and services must handle missing, invalid or revoked credentials.

## Receiving and authorization

- Telegram `getUpdates` is a request API, not a background receiver, Webhook server, offset store, deduplicator or sender authorization system.
- A Telegram Bot must have one update consumer. The library does not delete Webhooks, take over other consumers or automatically execute backlogged actions.
- Only Feishu self-built apps can explicitly `start()` a long connection for `im.message.receive_v1`. Webhook URLs/secrets cannot receive events; card-action callbacks are unsupported. Hosts must enable the bot, configure long-connection event subscriptions, request send/receive permissions, publish a version and restrict app availability (see the [README setup](README.en.md#feishu-self-built-apps-websocket-reception-and-http-replies)).
- Incoming messages remain untrusted business input. Hosts own `event_id`/`message_id` deduplication, user/chat authorization, bot self-reply prevention and a durable queue for slow work. Reception is not permission to execute commands. Disconnects/redelivery provide no exactly-once guarantee; multiple clients for one app receive in cluster mode, not broadcast mode.
- `reply.users` selects recipients shown buttons; it grants no permission to submit callbacks. Hosts must verify user/chat/request identities, lengths, expiry and routing.

## Retries and state

- A timeout may follow server acceptance; delivery may be unknown. Exactly-once or atomic multipart delivery is not promised.
- Feishu `updateMessage(messageId, content)` uses the official SDK's `im.v1.message.patch` to update the original card, without creating a new message or changing recipients. It needs no long connection and never automatically retries or falls back to sending/replying. Check the original message after an unknown outcome; blindly resending can duplicate notifications or overwrite newer card state.
- Updates only validate non-blank message-ID/card-JSON strings, not the card schema, message ownership or host authorization; the platform enforces permissions, update windows and format limits. Hosts must authorize the target rather than treat an arbitrary incoming message ID as update permission. Success means `code === 0`, without requiring response `data` or a message ID; errors retain only an optional safe-integer `code`. Legacy custom adapters without the optional update method fail safely, with no fallback to the real SDK or resending.
- Explicit rate-limit or format rejection can trigger bounded retries/fallbacks, not repeated application-side effects.
- `onSent` runs after reported delivery; a callback failure cannot undo the message. Do not blindly resend a whole plan because `ok` is false.
- Feishu `onMessage` is awaited and must finish within 3 seconds. Failure is safely reported to `onError`, then a safe error is thrown so the SDK returns a failure ACK, potentially causing redelivery. `FeishuError extends NotifyError`; `operation` is `configuration`, `connection`, `stopped`, `send`, `reply`, `update` or `handler`, and optional `code` is numeric, without SDK text. Throws/rejections from `onError` are isolated; SDK logs and original callback exceptions are not output by default. Hosts must still sanitize their own logs.
- Feishu startup waits up to 10000 ms by default for actual WS readiness; timeout/fatal errors reject, and repeated startup is idempotent. Synchronous `stop()` closes the connection, disables reconnection and rejects pending startup; restarting is supported. It does not wait for or cancel callbacks/HTTP requests in progress and cannot undo business actions.
- The library does not persist queues, tokens, content, offsets or logs. Application storage, logs, backups, permissions and updates require separate assessment.

## Reporting vulnerabilities

Source repository: [QueCue/notify-core](https://github.com/QueCue/notify-core). GitHub private vulnerability reporting is not claimed to be enabled, and no dedicated public security email is currently specified.

Prefer a private report if the Security page offers one. Otherwise, open a non-sensitive issue requesting a private contact, without publishing exploit details or secrets. Never include tokens, Webhooks or private chat content in a public issue. Revoke/rotate exposed credentials first; deleting text does not undo exposure.

Include the affected version, reproduction conditions, expected/actual behavior and sanitized evidence. For ordinary contributions, see [CONTRIBUTING.md](CONTRIBUTING.md).
