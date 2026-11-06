# 贡献与本地验证

本库仅维护 Telegram／飞书通用通讯，不接收应用专属命令、会话业务或授权策略。源码与贡献入口为 [QueCue/notify-core](https://github.com/QueCue/notify-core)。

## 开发环境

- Node.js 22 或更高版本、npm。
- 在本仓库执行 `npm ci --ignore-scripts`、`npm test`。
- 测试默认禁止真实网络，使用虚假凭据和注入的 HTTP／等待函数；不应要求贡献者提供个人 Bot Token 或 Webhook。
- 修改 API 时同步 `.d.ts` 构建、中文／英文 README、错误边界和变更记录。不要手工编辑 `dist`。

建议为限流、超时、格式回退、Unicode 分段、部分投递、自定义回调失败和错误脱敏补测试。保持默认导入无网络或配置副作用。传输与授权的边界应写清楚，不要使用测试通过来替代真实平台兼容承诺。

## 提交范围

不要提交 `.env`、Token、Webhook、真实接收人、消息原文、日志、node_modules 或包含这些内容的安装包。使用明显的假值，例如 `123:TEST_ONLY`；issue 和截图也需脱敏。

MIT 许可证及从 [dev-notify](https://github.com/QueCue/dev-notify) 提取的既有版权声明应保留。新增依赖、复制外部代码或改变发布方式前，请说明来源、许可证、目的及测试范围。

## 版本包

当前为 0.x API，不承诺跨版本不变；破坏性变化必须在变更记录和版本中明确体现。生成包前执行测试及 `npm pack --dry-run`，检查 [PUBLISHING.md](PUBLISHING.md)。相同版本号的正式发布包不可覆盖，不应以手改 tarball 的方式绕开版本更新。

安全问题按 [SECURITY.md](SECURITY.md) 处理，不在公开 issue 中附秘密或完整攻击细节。仓库地址、权限和实际发布状态以维护者公开配置为准。
