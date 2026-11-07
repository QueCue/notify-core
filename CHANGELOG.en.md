# Changelog

English | [简体中文](CHANGELOG.md)

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
