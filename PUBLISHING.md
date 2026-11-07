# npm 发布流程

本说明面向 [QueCue/notify-core](https://github.com/QueCue/notify-core) 维护者。正式 npm 发行使用本仓库的 [GitHub Actions 工作流](https://github.com/QueCue/notify-core/actions/workflows/publish-npm.yml)，不共享其他项目的发布身份。普通分支推送或版本标签推送均不会自动发布。

## 包和发布边界

- 包名 `@quecue/notify-core`，MIT 许可证，公开 npm 包。保留从 [dev-notify](https://github.com/QueCue/dev-notify) 提取代码的版权声明。
- 飞书客户端新增官方 MIT 许可运行时依赖 `@larksuiteoapi/node-sdk`，固定为 `1.76.0`；本库不再是无运行时依赖。直接版本由 package.json 固定，开发工具及依赖树由 package-lock 固定；发行前核对 SDK 和传递依赖的来源、许可证及锁文件。npm 包仅含 dist 运行时／类型、公开说明、package.json 和许可证，不含测试、CI 脚本或应用凭据。
- GitHub Actions 使用托管 Ubuntu runner、Node.js 24 和 npm 11.21.0；只有正式发布任务拥有 `id-token: write`。不需要 `NPM_TOKEN`、`NODE_AUTH_TOKEN` secret 或本机 npm 登录。
- GitHub 仓库公开、工作流存在和测试通过，都不能证明 npm 账户侧信任已配置，也不等于包已经发布。

## 首次建立 npm 包与信任

**npm 官方要求配置 Trusted Publisher 的包已经存在于 registry。** 尚不存在的包不能仅凭本工作流建立首次信任。账户所有者需先通过 npm 支持的认证流程初始化包，然后在该包的 npm 设置配置以下身份；不要把本机登录凭据或其他包的授权复制到 Actions。

| 字段 | 值 |
| --- | --- |
| Provider | GitHub Actions |
| Organization or user | `QueCue` |
| Repository | `notify-core` |
| Workflow filename | `publish-npm.yml`，不含目录 |
| Environment | 留空，本工作流不使用 environment |
| Publishing permission | 允许直接 `npm publish` |

阶段发布也是 npm 提供的初始化方式，但会产生公开的 `0.0.0-stage` 占位版本，并需账户认证和后续审核；本工作流不会擅自创建该额外版本。具体初始化操作应由维护者明确选择及执行。若首次已直接发布 `0.1.0`，Actions 不会覆盖它或把不同 tarball 当作同一次发行，应使用下一版本验证后续 OIDC 发行。

新建且尚未成功发布的信任配置会在两天后过期；请在包和工作流准备好后配置。成功发行会验证绑定，不能把它理解为所有已绑定配置每两天失效。本流程不自动改 dist-tag，不要求额外的标签管理权限。

## 日常发行

1. 检查待公开源码、历史、版本、CHANGELOG、中英文 README 和安全说明，避免 Token、Webhook、真实配置、本机路径及无关内容。
2. 修改 package.json 和 package-lock 的版本。npm 已有且内容不同的版本必须换版本，不覆盖或重打历史版本。
3. 本地执行 `npm ci --ignore-scripts`、`npm test`。当前回归包含模拟网络的公共 API 测试及发行校验测试，不代表全部平台、代理或真实服务验收。
4. 将已审核的源码、锁文件和工作流推送到 GitHub。进入 Actions → **Publish npm** → **Run workflow**，选择待发行分支或提交所在分支，填写与 package.json 完全一致的 `version`。
5. 保持 `verify_only=true` 先运行验证：安装锁定依赖、编译、测试、生成 tarball、校验精确文件白名单／元数据／SHA512，再隔离安装同一个 tarball，核对 ESM 导出及 TypeScript 类型。下载 `npm-package` artifact 检查。
6. 确认 npm 信任已建立且版本可发行后，对**同一提交**再次运行，设置 `verify_only=false`。正式运行会重新验证，并只上传本次验证任务保存的同一 tarball；不是直接上传之前某次运行或本机目录中的包。

隔离安装本地 tarball **仍会联网 npm registry 下载 SDK 及其传递依赖**，不是完全离线检查；`npm ci --ignore-scripts` 也需要可用的 registry／缓存。安装忽略脚本不等于禁止网络，隔离目录不等于网络沙箱。库导入／客户端创建不联网、SDK 懒加载的承诺仅指运行时，不覆盖 npm 安装；冒烟验证应保持使用虚假凭据和离线适配器，不执行真实 `start()` 或发送。检查新客户端的 ESM 导出和类型、启动／停止／错误边界，以及 Webhook／`NotifyConfig` 未变；SDK HTTP 的 10 秒／1 MiB／禁止重定向保护不代表 WebSocket 帧也有 `createTransport` 的 JSON 响应保证。

工作流仅通过 `workflow_dispatch` 触发。正式版本映射 `latest`；`alpha.N`、`beta.N`、`rc.N` 映射对应预发布标签。不会让预发布额外覆盖 `latest`。手动表单通过环境变量传给脚本，不直接拼接到 shell。

## 发布与失败核验

- 正式任务核对下载包 SHA512，使用 OIDC 执行带 provenance 的 `npm publish`，再只读核对 registry 版本、integrity 和 dist-tag。
- 包尚未初始化、查询失败或认证失败：停止，不回退到长期 Token，不借用其他仓库身份。
- 已有版本仅在 SHA512 与本次包一致时跳过上传；不同内容立即停止，不能覆盖。构建环境或文档变化也可能产生不同 tarball。
- 上传失败或结果未知不自动重发；先查询 registry。上传成功后版本可见性最多等待约 10 分钟，标签最多约 1 分钟；超时不能当作未发布。
- 不自动修正既有标签。若版本已存在但标签不匹配，应由维护者核实影响后单独处理。
- 测试或仅验证任务成功不表示发布成功。以正式发布任务结果和 registry 状态为准：

```sh
npm view @quecue/notify-core@0.2.0 version dist.integrity --json --registry=https://registry.npmjs.org/
npm view @quecue/notify-core dist-tags --json --registry=https://registry.npmjs.org/
```

应用应声明正常的 npm 运行时依赖，如 `"@quecue/notify-core": "0.2.0"`，在版本可用后更新锁文件并回归；无需保存 vendor tarball、复制通讯运行时或检出兄弟仓库。

## 官方参考

- [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm trust：包必须已存在的前置条件](https://docs.npmjs.com/cli/v11/commands/npm-trust/)
- [阶段发布及首次包占位行为](https://docs.npmjs.com/staged-publishing/)
- [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish)
