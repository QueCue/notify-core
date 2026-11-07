# 更新记录

简体中文 | [English](CHANGELOG.en.md)

## 0.2.0

- 新增独立的飞书自建应用 `createFeishuClient`：显式启动 WebSocket 接收 `im.message.receive_v1`，通过 HTTP 发送／回复，不支持卡片动作回调；现有 Webhook `makePlan`／`deliver` 和 `NotifyConfig` 不变。
- 同步创建不联网，SDK 懒加载；启动等待实际 ready，默认超时 10000 毫秒，重复启动幂等。支持连接状态、停止取消待启动／禁用重连和重启；停止不等待或取消已执行的回调／HTTP 请求，发送无需先启动。
- 新增 `FeishuError` 安全错误和离线／自定义 `adapterFactory`；消息回调被 await，失败安全报告后返回失败 ACK，`onError` 失败被隔离，默认不输出 SDK 日志。回调须在 3 秒内结束；宿主负责去重、授权、防自回复和持久队列，不保证断线／重推恰好一次。
- 新增官方 MIT 许可运行时依赖 `@larksuiteoapi/node-sdk`，固定为 `1.76.0`，负责应用 token、二进制协议、分帧心跳和重连；SDK HTTP 独立限制 10 秒／1 MiB／禁止重定向，WebSocket 帧不适用 `createTransport` 的 JSON 响应保证。
- 同步中英文接收／回复用法、安全边界、贡献与发布说明，明确安装 SDK 会访问 npm registry。

## 0.1.0

首次独立发行；实际发布状态和可用版本以 npm registry 为准。

- 从 [dev-notify](https://github.com/QueCue/dev-notify) 提取独立的双渠道消息规划、格式化、分段和投递能力。
- 提供可注入的有界 JSON 传输、有限 Telegram API、安全错误类型及纯文本分段。
- 不包含应用配置、凭据库、更新接收循环、授权或业务状态；允许宿主注入翻译和传输。
- 补充中文／英文使用说明、安全边界和公开发布检查表；13 项公共 API 测试使用模拟网络，另有 8 项发行校验测试，不代表全平台或真实服务验收。
- 新增手动触发的 GitHub Actions npm 发行：默认仅验证，正式模式使用独立 OIDC 身份及 provenance，上传同次验证的候选包并核对远端完整性；npm 包初始化和信任配置须先由账户所有者完成。
