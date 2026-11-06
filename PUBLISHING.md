# npm 发布流程

本说明面向 [QueCue/notify-core](https://github.com/QueCue/notify-core) 维护者。源码公开与 npm 发布是独立操作；修改文件或推送普通分支不会自动发布 npm。

## 包和发布边界

- 包名 `@quecue/notify-core`，MIT 许可证，公开 npm 包；package.json 配置公共 registry 和 `access: public`，不含 `private: true`。
- 保留从 [dev-notify](https://github.com/QueCue/dev-notify) 提取代码的版权声明。没有第三方运行时依赖，开发工具由 package-lock 固定。
- 当前不配置自动发布工作流或共享其他项目的发布身份。首次发布及后续版本需维护者明确认证和执行，不将 npm Token 放入仓库、命令行或聊天记录。
- GitHub 私密漏洞报告和认证状态不能从本地配置推定；应根据实际设置完善 [SECURITY.md](SECURITY.md)。

## 发行前检查

1. 检查源码、Git 待提交文件、历史和生成包，避免包含 Token、Webhook、私聊内容、真实配置、本机路径或无关资料；忽略规则不会清除既有提交。
2. 核对版本、CHANGELOG、中文／英文 README、API／类型声明、安全边界及仓库元数据。版本已存在且内容不同则必须换新版本，不能覆盖或重打旧标签。
3. 执行：

   ```sh
   npm ci --ignore-scripts
   npm test
   npm pack --dry-run
   node -e "require('node:fs').mkdirSync('releases', {recursive: true})"
   npm pack --pack-destination releases
   ```

4. 检查 tarball 仅含 dist 运行时／类型、公开文档和许可证。在独立空项目安装这个已生成的包，验证 ESM 导入、TypeScript 类型及 README 离线示例；不要只依赖本仓库的 node_modules。
5. 在发布前提交已检查源码，并核对 GitHub 版本标签对应的提交。测试通过不等于全部平台、代理和真实服务完成验收。

## 首次及手动发布

维护者通过 `npm login --registry=https://registry.npmjs.org/` 完成浏览器／二次认证，再用 `npm whoami` 核对账户。认证材料不应交给其他人代填。

首次 0.1.0 的命令示例（后续版本应替换文件名）：

```sh
npm publish releases/quecue-notify-core-0.1.0.tgz --access public --tag latest --ignore-scripts --registry=https://registry.npmjs.org/
```

发布的是已经测试的 tarball，而不是临时重新构建另一份包。不要仅看到网络超时就重复上传；先只读查询目标版本。如果以后使用 Trusted Publishing，应为本包单独配置，不假定自动继承其他包的权限。

## 发布后核验

```sh
npm view @quecue/notify-core@0.1.0 version dist.integrity --json --registry=https://registry.npmjs.org/
npm view @quecue/notify-core dist-tags --json --registry=https://registry.npmjs.org/
```

将 registry 的 `dist.integrity` 与本地 `npm pack --json` 结果比对，再从 registry 安装到独立项目验证。区分服务端接受、版本实际可见和标签更新；失败或结果未知时不盲目重发，不以本地文件存在证明已经发布。

正式发行通常使用 `latest`，预发布选用单独标签。0.x 同样需要说明破坏性 API 变化。

## 应用升级

应用应声明正常的 npm 运行时依赖，例如 `"@quecue/notify-core": "0.1.0"`，更新自己的锁文件并运行集成测试。用户安装应用时由 npm 自动处理依赖，不需要同时检出本仓库、保存 vendor tarball 或复制通讯运行时。

官方参考：

- [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish)
- [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack)
- [Trusted Publishing](https://docs.npmjs.com/trusted-publishers)
