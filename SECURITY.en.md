# Security boundaries

English | [简体中文](SECURITY.md)

This is a communication library, not an authorization system or security agent. MIT licensing does not imply an independent security audit or suitability for every environment; no such audit is claimed.

## Data and network

- Importing does not access the network, environment credentials, application configuration or system keyrings. Explicit sends/API calls transmit selected content to the configured service, whose retention is outside this library's control.
- The Telegram factory fixes its official HTTPS base and limits methods. Generic JSON transport and Feishu Webhook configuration are **not URL access controls**. Hosts must validate schemes, destination domains, recipients and links; never pass untrusted external URLs directly.
- Default transport preserves runtime TLS verification, rejects redirects, defaults to 10 seconds and 1 MiB, and checks UTF-8 and JSON objects. Limits are configurable; weakened settings or substituted transports require their own review.
- Proxy configuration belongs to the host. Default fetch behavior depends on Node startup and network settings; unconditional proxy bypass is not promised.
- Built-in safe error summaries omit original URLs, response bodies and underlying network exception text. This is not general content redaction: titles, bodies, footers, buttons, custom translators, injected transports and callbacks can contain sensitive data.
- `NotifyConfig` is a type contract, not account validation or exhaustive runtime schema validation. Hosts and services must handle missing, invalid or revoked credentials.

## Receiving and authorization

- `getUpdates` is a request API, not a background receiver, Webhook server, offset store, deduplicator or sender authorization system. Feishu supports custom-bot Webhook sending only, not inbound events.
- A Bot must have one update consumer. The library does not delete Webhooks, take over other consumers or automatically execute backlogged actions.
- `reply.users` selects recipients shown buttons; it grants no permission to submit callbacks. Hosts must verify user/chat/request identities, lengths, expiry and routing.

## Retries and state

- A timeout may follow server acceptance; delivery may be unknown. Exactly-once or atomic multipart delivery is not promised.
- Explicit rate-limit or format rejection can trigger bounded retries/fallbacks, not repeated application-side effects.
- `onSent` runs after reported delivery; a callback failure cannot undo the message. Do not blindly resend a whole plan because `ok` is false.
- The library does not persist queues, tokens, content, offsets or logs. Application storage, logs, backups, permissions and updates require separate assessment.

## Reporting vulnerabilities

Source repository: [QueCue/notify-core](https://github.com/QueCue/notify-core). GitHub private vulnerability reporting is not claimed to be enabled, and no dedicated public security email is currently specified.

Prefer a private report if the Security page offers one. Otherwise, open a non-sensitive issue requesting a private contact, without publishing exploit details or secrets. Never include tokens, Webhooks or private chat content in a public issue. Revoke/rotate exposed credentials first; deleting text does not undo exposure.

Include the affected version, reproduction conditions, expected/actual behavior and sanitized evidence. For ordinary contributions, see [CONTRIBUTING.md](CONTRIBUTING.md).
