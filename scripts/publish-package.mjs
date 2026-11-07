import { readFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';

// 只由显式正式发布任务调用，不读取或设置 npm Token。
if (process.argv.length !== 3 || process.env.GITHUB_ACTIONS !== 'true' ||
    process.env.GITHUB_REPOSITORY !== 'QueCue/notify-core' || !process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
  throw new Error('正式发布只允许本仓库有 OIDC 权限的 GitHub Actions 任务。');
}
const name = '@quecue/notify-core';
const version = process.env.RELEASE_VERSION;
const filename = process.env.RELEASE_FILENAME;
const tag = process.env.RELEASE_DIST_TAG;
const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/.exec(version || '');
if (!match || tag !== (match[4] || 'latest') || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.tgz$/.test(filename || '')) {
  throw new Error('发布版本、标签或文件名无效。');
}
const artifact = path.resolve(process.argv[2], filename);
const integrity = 'sha512-' + createHash('sha512').update(readFileSync(artifact)).digest('base64');
if (integrity !== process.env.RELEASE_INTEGRITY) throw new Error('下载后的候选包与验证任务完整性不同。');
async function registry(suffix = '') {
  const response = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}${suffix}?t=${Date.now()}`,
    { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'Cache-Control': 'no-cache, no-store', Accept: 'application/json' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`registry 查询失败（HTTP ${response.status}），不猜测发布状态。`);
  return response.json();
}
function remoteIntegrity(value) {
  if (value === null) return null;
  if (typeof value.dist?.integrity !== 'string' || !value.dist.integrity) throw new Error('registry 版本缺少完整性字段。');
  return value.dist.integrity;
}
const existing = remoteIntegrity(await registry(`/${version}`));
if (existing !== null && existing !== integrity) throw new Error('此版本已存在且内容不同，禁止覆盖，请使用新版本。');
if (existing === null) {
  // npm 尚不支持为不存在的包预配置信任；明确失败，不用另一项目身份或 Token 绕过。
  if (await registry() === null) throw new Error('npm 包尚未初始化。账户所有者须先建立包，再配置本仓库 Trusted Publisher；仅有工作流不能首次创建信任。');
  const result = spawnSync('npm', ['publish', artifact, '--access', 'public', '--tag', tag, '--provenance',
    '--ignore-scripts', '--registry=https://registry.npmjs.org/'], { stdio: 'inherit', timeout: 120000 });
  if (result.error || result.status !== 0) throw new Error('发布失败或结果未知；请检查 npm 信任配置及直接发布权限，不会自动重发。');
} else console.log('同内容版本已存在，跳过上传，仅核验完整性及标签。');
let confirmed = existing !== null;
const deadline = Date.now() + 600000;
while (!confirmed && Date.now() < deadline) {
  const actual = remoteIntegrity(await registry(`/${version}`));
  if (actual !== null) {
    if (actual !== integrity) throw new Error('远端版本完整性与候选包不同。');
    confirmed = true;
  } else await delay(Math.min(10000, Math.max(0, deadline - Date.now())));
}
if (!confirmed) throw new Error('上传后尚未确认远端版本；不要盲目重发，请稍后只读核验。');
let tags;
const tagDeadline = Date.now() + 60000;
do {
  tags = (await registry())?.['dist-tags'];
  if (tags?.[tag] === version) break;
  if (Date.now() >= tagDeadline) throw new Error('版本已存在，但标签未匹配；不会自动改动既有标签。');
  await delay(5000);
} while (true);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
  `## npm 发布核验通过\n\n- 版本：\`${name}@${version}\`\n- 标签：\`${tag}\`\n- SHA512：\`${integrity}\`\n`);
console.log('远端版本、完整性和发布标签核验通过。');
