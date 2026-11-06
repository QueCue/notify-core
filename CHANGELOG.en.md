# Changelog

English | [简体中文](CHANGELOG.md)

## 0.1.0

First standalone release; the npm registry is authoritative for actual publication status and available versions.

- Extract independent Telegram/Feishu planning, formatting, splitting and delivery from [dev-notify](https://github.com/QueCue/dev-notify).
- Provide injectable bounded JSON transport, selected Telegram APIs, safe error types and plain-text splitting.
- Exclude application configuration, keyrings, polling loops, authorization and business state; hosts can inject translation and transport.
- Add Chinese/English usage and security documentation plus a publication checklist. The current 13 automated tests use simulated network responses, not exhaustive platform or real-service acceptance.
