import { mkdir, writeFile, realpath } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.length !== 4) throw new Error('用法：node scripts/smoke-package.mjs <候选包> <新隔离目录>');
const archive = path.resolve(process.argv[2]);
const consumer = path.resolve(process.argv[3]);
// 已存在即拒绝，避免覆盖调用者的文件或采用陈旧安装结果。
await mkdir(consumer);
await writeFile(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }) + '\n');
const args = ['install', archive, '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org/'];
if (process.platform === 'win32') {
  const cli = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  execFileSync(process.execPath, [cli, ...args], { cwd: consumer, stdio: 'inherit', windowsHide: true });
} else execFileSync('npm', args, { cwd: consumer, stdio: 'inherit' });
const entry = path.join(consumer, 'node_modules/@quecue/notify-core/dist/index.js');
const imported = await import(pathToFileURL(await realpath(entry)).href);
for (const name of ['NotifyError', 'TransportError', 'HttpError', 'TelegramApiError', 'createChannels',
  'createFormatting', 'createTransport', 'createTelegramApi', 'splitPlainText', 'createFeishuClient', 'FeishuError']) {
  if (typeof imported[name] !== 'function') throw new Error('公共 ESM 导出缺失。');
}
const feishu = imported.createFeishuClient({ appId: 'cli_0123456789abcdef', appSecret: 'TEST_ONLY' });
if (typeof feishu.updateMessage !== 'function' || feishu.state !== 'idle') throw new Error('飞书卡片更新入口缺失。');
const example = path.join(consumer, 'example.mts');
await writeFile(example, `import { createChannels, createTelegramApi, createTransport, splitPlainText, NotifyError, type Message } from '@quecue/notify-core';
const message: Message = { title: '测试', content: '正文', footer: '', level: 'info' };
const plan = createChannels().makePlan('telegram', message, { telegram: { token: '', chatIds: ['123'] }, feishu: { webhook: '', secret: '' } });
const api = createTelegramApi('TEST_ONLY');
const request = createTransport();
const parts: string[] = splitPlainText('😀正文', 2);
const error: Error = new NotifyError('安全摘要');
import { createFeishuClient, FeishuError, type FeishuMessageEvent, type FeishuClient, type FeishuAdapter, type FeishuOperation } from '@quecue/notify-core';
const feishu: FeishuClient = createFeishuClient({ appId: 'cli_0123456789abcdef', appSecret: 'TEST_ONLY' }, {
  onMessage: async (event: FeishuMessageEvent) => {
    if (event.sender.sender_type === 'user') await feishu.replyMessage(event.message.message_id, {
      msgType: 'text', content: JSON.stringify({ text: '离线类型检查' }), replyInThread: true,
    });
  },
  onError: (error: FeishuError) => { const operation: string = error.operation; },
});
const state: string = feishu.state;
const operation: FeishuOperation = 'update';
function updateCard(): Promise<void> {
  return feishu.updateMessage('om_TEST_ONLY', JSON.stringify({ elements: [{ tag: 'markdown', content: '离线类型检查' }] }));
}
// 旧适配器无需实现新增的可选更新方法。
const legacyAdapter: FeishuAdapter = {
  start() {}, close() {},
  async sendMessage() { return { code: 0, data: { message_id: 'om_TEST_ONLY' } }; },
  async replyMessage() { return { code: 0, data: { message_id: 'om_TEST_ONLY' } }; },
};
const updateAdapter: FeishuAdapter = { ...legacyAdapter, async updateMessage(messageId, content) { return { code: 0 }; } };
`);
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict',
  '--target', 'ES2022', '--module', 'NodeNext', example], { cwd: root, stdio: 'inherit' });
console.log('同一候选包隔离安装、ESM 导出和 TypeScript 类型验证通过；未连接真实消息服务。');
