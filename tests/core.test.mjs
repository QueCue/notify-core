import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTransport, HttpError, TransportError, NotifyError, createTelegramApi, TelegramApiError,
  splitPlainText, makePlan, deliver, createChannels, telegramParts, parseMarkdown, visibleText } from '../dist/index.js';
globalThis.fetch = async () => { throw new Error('测试禁止真实网络'); };
const cfg = { telegram: { token: '123:FAKE_ONLY', chatIds: ['111'] }, feishu: { webhook: 'https://open.feishu.cn/open-apis/bot/v2/hook/FAKE_ONLY', secret: '' } };

test('公共包不依赖 CLI 配置即可规划双渠道消息', () => {
  for (const channel of ['telegram', 'feishu']) {
    const plan = makePlan(channel, { title: '状态', content: '中文😀'.repeat(5000), footer: '', level: 'info' }, cfg);
    assert.ok(plan.items.length > 1);
  }
});
test('工厂翻译互相隔离，不使用全局语言状态', () => {
  const first = createChannels(key => 'A:' + key), second = createChannels(key => 'B:' + key);
  const msg = { title: '', content: '', footer: '', level: 'info' };
  assert.throws(() => first.makePlan('telegram', msg, cfg), /A:channels.emptyTitle/);
  assert.throws(() => second.makePlan('telegram', msg, cfg), /B:channels.emptyTitle/);
});
test('公共按钮数据由调用方提供，不固定开发会话协议', () => {
  const plan = makePlan('telegram', { title: '状态', content: '正文', footer: '', level: 'info',
    reply: { users: ['111'], url: '', token: 'request1', callbackData: 'machine:request1' } }, cfg);
  assert.equal(plan.items[0].payload.reply_markup.inline_keyboard[0][0].callback_data, 'machine:request1');
});
test('纯文本分段完整保留 Markdown 字面量和 Unicode，不切断代理对', () => {
  const text = '**不要解析**\n😀<&>'.repeat(2000), parts = splitPlainText(text, 100);
  assert.equal(parts.join(''), text);
  assert.ok(parts.every(part => part.length <= 100 && !/[\uD800-\uDBFF]$/.test(part)));
});
test('Markdown 渲染迁移不丢失正文', () => {
  const blocks = parseMarkdown('```text\n' + '正文😀<&>\n'.repeat(1000) + '```');
  assert.equal(telegramParts(blocks, 1000).map(part => part.plain).join(''), visibleText(blocks));
});
test('HTTP 状态失败即使业务正文声称成功也不能误报成功', async () => {
  const request = createTransport();
  await assert.rejects(request('https://example.invalid', {}, async () => new Response('{"ok":true,"result":{}}', { status: 500 })),
    error => error instanceof HttpError && error.status === 500);
});
test('HTTP 429 明确拒绝包保留给渠道限流处理', async () => {
  const result = await createTransport()('https://example.invalid', {}, async () => new Response(
    '{"ok":false,"error_code":429,"parameters":{"retry_after":3}}', { status: 429 }));
  assert.equal(result.error_code, 429);
});
test('传输超时边界、响应上限、重定向及异常脱敏', async () => {
  const request = createTransport({ timeoutMs: 300, maxResponseBytes: 32 });
  await assert.rejects(request('https://example.invalid/SECRET', {}, async (_url, options) => {
    assert.equal(options.redirect, 'error'); assert.ok(options.signal); throw new Error('SECRET');
  }), error => error instanceof TransportError && !String(error).includes('SECRET'));
  await assert.rejects(request('https://example.invalid', {}, async () => new Response('x'.repeat(33))), /过大/);
  await assert.rejects(request('https://example.invalid', {}, async () => new Response('[]')), /JSON 对象/);
});
test('通知和回复 API 共用安全异常基类', () => {
  assert.ok(new TransportError('安全错误') instanceof NotifyError);
  assert.ok(new TelegramApiError(401) instanceof NotifyError);
});
test('Telegram 429 对回复方法同样仅重试一次，不回显服务端描述', async () => {
  let calls = 0; const waits = [];
  const api = createTelegramApi('123:FAKE_ONLY', { sleep: async ms => { waits.push(ms); }, request: async () => {
    calls++; return { ok: false, error_code: 429, description: 'SECRET', parameters: { retry_after: 2 } };
  } });
  await assert.rejects(api('answerCallbackQuery', {}), error => error instanceof TelegramApiError && error.code === 429 && !String(error).includes('SECRET'));
  assert.equal(calls, 2); assert.deepEqual(waits, [2000]);
});
test('网络结果未知不自动重发，API 不允许任意方法或删除 webhook', async () => {
  let calls = 0;
  const api = createTelegramApi('123:FAKE_ONLY', { request: async () => { calls++; throw new TransportError('失败'); } });
  await assert.rejects(api('sendMessage', {})); assert.equal(calls, 1);
  await assert.rejects(api('deleteWebhook', {})); assert.equal(calls, 1);
});
test('Telegram 冲突和认证错误可由宿主安全识别', async () => {
  for (const code of [401, 404, 409]) {
    const api = createTelegramApi('123:FAKE_ONLY', { request: async () => ({ ok: false, error_code: code, description: 'SECRET' }) });
    await assert.rejects(api('getUpdates', {}), error => error.fatal && error.code === code && !String(error).includes('SECRET'));
  }
});
test('投递回调失败不重发已经发出的分段', async () => {
  const plan = makePlan('telegram', { title: '状态', content: '正文', footer: '', level: 'info' }, cfg);
  let calls = 0; plan.onSent = async () => { throw new Error('SECRET'); };
  const result = await deliver(plan, cfg, async () => { calls++; return { ok: true, result: { message_id: 1 } }; });
  assert.equal(calls, 1); assert.equal(result.ok, false); assert.equal(result.sent, 1); assert.ok(!result.error.includes('SECRET'));
});
