# Changelog

English | [简体中文](CHANGELOG.md)

## 0.2.1

- Add root-entry `FeishuClient.updateMessage(messageId, content): Promise<void>` to update app-sent card JSON by its original message ID using the official SDK's `im.v1.message.patch`. It creates no new message, changes no recipient and does not require a long connection.
- Update success requires only `code === 0`, not `data.message_id`. Invalid arguments fail safely; platform rejection/exceptions use the new `update` operation on `FeishuError`, retaining only safe-integer codes with no automatic retry or fallback to sending/replying.
- Make `FeishuAdapter.updateMessage` optional for legacy custom-adapter compatibility; missing update support fails safely. Keep SDK `1.76.0` without new dependencies; lazy loading, lifecycle, Webhook/`NotifyConfig` and HTTP limits remain unchanged.
- Synchronize bilingual usage/security guidance and offline tests for success without `data`, redacted failures, no retries, SDK PATCH mapping and HTTP limits. Simulated automation is not real-Feishu or exhaustive environment acceptance.

## 0.2.0

- Add a separate Feishu self-built app `createFeishuClient`: explicitly start WebSocket reception of `im.message.receive_v1`, with HTTP sending/replies and no card-action callbacks. Existing Webhook `makePlan`/`deliver` and `NotifyConfig` remain unchanged.
- Synchronous creation is offline and the SDK is lazy-loaded. Startup waits for actual readiness, defaults to a 10000 ms timeout and is idempotent. Support connection states, stopping with pending-start cancellation/reconnection disabled, and restart. Stop does not wait for or cancel callbacks/HTTP requests in progress; sending does not require startup.
- Add safe `FeishuError` errors and offline/custom `adapterFactory` injection. Message handlers are awaited; failure is safely reported before returning a failure ACK. Isolate `onError` failures and disable SDK logs by default. Handlers must finish within 3 seconds; hosts own deduplication, authorization, self-reply prevention and durable queues, with no exactly-once guarantee across disconnects/redelivery.
- Add the official MIT-licensed runtime dependency `@larksuiteoapi/node-sdk`, pinned to `1.76.0`, for app tokens, the binary protocol, framing, heartbeats and reconnection. SDK HTTP separately enforces 10 seconds/1 MiB/no redirects; WebSocket frames are outside `createTransport`'s JSON-response guarantee.
- Synchronize Chinese/English receive/reply examples, security boundaries, contribution and release guidance, including npm registry access when installing the SDK.

## 0.1.0

First standalone release; the npm registry is authoritative for actual publication status and available versions.

- Extract independent Telegram/Feishu planning, formatting, splitting and delivery from [dev-notify](https://github.com/QueCue/dev-notify).
- Provide injectable bounded JSON transport, selected Telegram APIs, safe error types and plain-text splitting.
- Exclude application configuration, keyrings, polling loops, authorization and business state; hosts can inject translation and transport.
- Add Chinese/English usage and security documentation plus a publication checklist. There are 13 public API tests using simulated network responses and 8 release-validation tests, not exhaustive platform or real-service acceptance.
- Add a manually dispatched GitHub Actions npm release workflow: verification-only by default, separate OIDC identity and provenance for publishing, delivery of the same verified artifact, and remote integrity checks. The account owner must first initialize the npm package and configure trust.
