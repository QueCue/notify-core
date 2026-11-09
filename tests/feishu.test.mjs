import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { createFeishuClient, FeishuError, NotifyError } from '../dist/index.js';
import { createFeishuSdkAdapter } from '../dist/feishu-sdk.js';

globalThis.fetch = async () => { throw new Error('测试禁止真实网络'); };
// SDK 使用 Axios／ws，不经过全局 fetch，因此同时阻断 Node HTTP(S) 入口。
for (const transport of [http, https]) mock.method(transport, 'request', () => { throw new Error('测试禁止真实网络'); });
const credentials = { appId: 'cli_0123456789abcdef', appSecret: 'FAKE_ONLY_SECRET' };
const outgoing = { msgType: 'text', content: JSON.stringify({ text: '离线回复' }) };
const card = JSON.stringify({ elements: [{ tag: 'markdown', content: '离线更新卡片' }] });
const event = {
  event_id: 'ev_FAKE_ONLY', event_type: 'im.message.receive_v1',
  sender: { sender_id: { open_id: 'ou_FAKE_ONLY' }, sender_type: 'user' },
  message: { message_id: 'om_FAKE_ONLY', chat_id: 'oc_FAKE_ONLY', chat_type: 'p2p',
    message_type: 'text', content: JSON.stringify({ text: '你好' }), create_time: '1' },
};
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(options = {}) {
  const handlers = [], sends = [], replies = [], updates = [], errors = [], events = [];
  let factories = 0, closes = 0;
  const adapter = {
    start(callbacks) { handlers.push(callbacks); },
    close() { closes++; },
    async sendMessage(message) { sends.push(message); return { code: 0, data: { message_id: 'om_sent', chat_id: 'oc_FAKE_ONLY' } }; },
    async replyMessage(messageId, message) { replies.push({ messageId, message }); return { code: 0, data: { message_id: 'om_replied' } }; },
    async updateMessage(messageId, content) { updates.push({ messageId, content }); return { code: 0 }; },
  };
  const client = createFeishuClient(credentials, { onMessage: data => { events.push(data); },
    onError: error => { errors.push(error); }, adapterFactory: () => { factories++; return adapter; }, ...options });
  return { client, adapter, handlers, sends, replies, updates, errors, events,
    get factories() { return factories; }, get closes() { return closes; } };
}
async function connect(f) {
  const starting = f.client.start();
  await flush();
  f.handlers.at(-1).onReady();
  await starting;
}
const safe = operation => error => error instanceof FeishuError && error instanceof NotifyError &&
  error.operation === operation && !String(error).includes('FAKE_ONLY_SECRET') && error.cause === undefined;

test('飞书客户端惰性初始化，HTTP发送不要求先建立长连接', async () => {
  const f = fixture();
  assert.equal(f.client.state, 'idle');
  assert.equal(f.factories, 0);
  assert.deepEqual(await f.client.sendMessage({ ...outgoing, receiveId: 'oc_FAKE_ONLY' }),
    { messageId: 'om_sent', chatId: 'oc_FAKE_ONLY' });
  assert.equal(f.factories, 1);
  assert.equal(f.handlers.length, 0);
  assert.equal(f.client.state, 'idle');
});

test('飞书凭据、回调和启动超时配置在本地校验且错误不含输入', () => {
  for (const config of [undefined, {}, { ...credentials, appId: 'FAKE_ONLY_SECRET' }, { ...credentials, appSecret: '' }])
    assert.throws(() => createFeishuClient(config), safe('configuration'));
  for (const options of [{ startTimeoutMs: 0 }, { startTimeoutMs: NaN }, { startTimeoutMs: 1.5 }, { startTimeoutMs: 2147483648 },
    { onMessage: true }, { onError: 'FAKE_ONLY_SECRET' }, { adapterFactory: false }])
    assert.throws(() => createFeishuClient(credentials, options), safe('configuration'));
});

test('未注册消息处理函数不能启动并静默消费事件', async () => {
  const f = fixture({ onMessage: undefined });
  await assert.rejects(f.client.start(), safe('configuration'));
  assert.equal(f.factories, 0);
});

test('飞书start等到真实ready且并发与重复启动幂等', async () => {
  const f = fixture();
  const first = f.client.start(), second = f.client.start();
  assert.equal(first, second);
  await flush();
  assert.equal(f.factories, 1);
  assert.equal(f.handlers.length, 1);
  assert.equal(f.client.state, 'connecting');
  let finished = false;
  void first.then(() => { finished = true; });
  await flush();
  assert.equal(finished, false);
  f.handlers[0].onReady();
  await first;
  assert.equal(f.client.state, 'connected');
  await f.client.start();
  assert.equal(f.handlers.length, 1);
  f.client.stop();
  assert.equal(f.client.state, 'stopped');
  assert.equal(f.closes, 1);
});

test('飞书重连状态由SDK回调驱动，停止后可以重新启动', async () => {
  const f = fixture();
  await connect(f);
  f.handlers[0].onReconnecting();
  assert.equal(f.client.state, 'reconnecting');
  await f.client.start();
  assert.equal(f.handlers.length, 1);
  f.handlers[0].onReconnected();
  assert.equal(f.client.state, 'connected');
  f.client.stop();
  await connect(f);
  assert.equal(f.handlers.length, 2);
  f.client.stop();
});

test('飞书启动超时关闭SDK并拒绝启动，不把start返回当成连接成功', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture({ startTimeoutMs: 100 });
  const starting = f.client.start();
  const rejected = assert.rejects(starting, safe('connection'));
  await flush();
  t.mock.timers.tick(100);
  await rejected;
  await flush();
  assert.equal(f.client.state, 'failed');
  assert.equal(f.closes, 1);
  assert.equal(f.errors[0].operation, 'connection');
  f.handlers[0].onReady();
  assert.equal(f.client.state, 'failed');
});

test('飞书致命连接错误脱敏并终止重连', async () => {
  const f = fixture();
  const starting = f.client.start();
  const rejected = assert.rejects(starting, safe('connection'));
  await flush();
  f.handlers[0].onError(new Error('FAKE_ONLY_SECRET'));
  await rejected;
  await flush();
  assert.equal(f.client.state, 'failed');
  assert.equal(f.closes, 1);
  assert.ok(safe('connection')(f.errors[0]));
});

test('飞书初始连接成功后的终止错误仍然关闭连接并可观测', async () => {
  const f = fixture();
  await connect(f);
  f.handlers[0].onError(new Error('FAKE_ONLY_SECRET'));
  await flush();
  assert.equal(f.client.state, 'failed');
  assert.equal(f.errors.length, 1);
  assert.equal(f.closes, 1);
  await connect(f);
  f.client.stop();
});

test('飞书适配器启动异常不泄露原始错误且允许再次启动', async () => {
  const f = fixture();
  f.adapter.start = async () => { throw new Error('FAKE_ONLY_SECRET'); };
  await assert.rejects(f.client.start(), safe('connection'));
  f.adapter.start = handlers => { f.handlers.push(handlers); };
  await connect(f);
  f.client.stop();
});

test('飞书适配器工厂失败后可重新初始化', async () => {
  let calls = 0;
  const f = fixture({ adapterFactory: () => {
    if (++calls === 1) throw new Error('FAKE_ONLY_SECRET');
    return f.adapter;
  } });
  await assert.rejects(f.client.start(), safe('connection'));
  await connect(f);
  assert.equal(calls, 2);
  f.client.stop();
});

test('飞书stop取消尚未完成的start，旧会话回调不能复活连接或消费事件', async () => {
  const f = fixture();
  const starting = f.client.start();
  const rejected = assert.rejects(starting, safe('stopped'));
  await flush();
  const old = f.handlers[0];
  f.client.stop();
  await rejected;
  await connect(f);
  old.onReady(); old.onReconnecting(); old.onReconnected(); old.onError();
  await old.onMessage(event);
  assert.equal(f.client.state, 'connected');
  assert.equal(f.events.length, 0);
  assert.equal(f.errors.length, 0);
  await f.handlers[1].onMessage(event);
  assert.deepEqual(f.events, [event]);
  f.client.stop();
});

test('飞书工厂初始化过程中stop及重启不会启动过期会话', async () => {
  let finish;
  const f = fixture({ adapterFactory: () => new Promise(resolve => { finish = resolve; }) });
  const first = f.client.start();
  const rejected = assert.rejects(first, safe('stopped'));
  await flush();
  f.client.stop();
  const second = f.client.start();
  finish(f.adapter);
  await rejected;
  await flush();
  assert.equal(f.handlers.length, 1);
  f.handlers[0].onReady();
  await second;
  f.client.stop();
});

test('飞书工厂在stop后才完成时不得建立连接', async () => {
  let finish;
  const f = fixture({ adapterFactory: () => new Promise(resolve => { finish = resolve; }) });
  const starting = f.client.start();
  const rejected = assert.rejects(starting, safe('stopped'));
  await flush();
  f.client.stop();
  finish(f.adapter);
  await rejected;
  await flush();
  assert.equal(f.handlers.length, 0);
  assert.equal(f.client.state, 'stopped');
});

test('飞书事件回调保留身份和正文，支持按原消息ID回复', async () => {
  const received = [];
  const f = fixture({ onMessage: async data => {
    received.push(data);
    await f.client.replyMessage(data.message.message_id, { ...outgoing, replyInThread: true, uuid: 'FAKE_ONLY_UUID' });
  } });
  await connect(f);
  await f.handlers[0].onMessage(event);
  assert.deepEqual(received, [event]);
  assert.deepEqual(f.replies, [{ messageId: event.message.message_id,
    message: { ...outgoing, replyInThread: true, uuid: 'FAKE_ONLY_UUID' } }]);
  f.client.stop();
});

test('飞书事件处理失败安全报告并抛错供SDK失败ACK，错误观察回调拒绝被隔离', async () => {
  let observed;
  const f = fixture({ onMessage: async () => { throw new Error('FAKE_ONLY_SECRET'); },
    onError: async error => { observed = error; throw new Error('FAKE_ONLY_SECRET'); } });
  await connect(f);
  await assert.rejects(f.handlers[0].onMessage(event), safe('handler'));
  await flush();
  assert.ok(safe('handler')(observed));
  assert.equal(f.client.state, 'connected');
  f.client.stop();
});

test('飞书同步错误观察回调异常不会破坏连接失败处理', async () => {
  const f = fixture({ onError: () => { throw new Error('FAKE_ONLY_SECRET'); } });
  const starting = f.client.start();
  const rejected = assert.rejects(starting, safe('connection'));
  await flush();
  f.handlers[0].onError();
  await rejected;
  await flush();
  assert.equal(f.client.state, 'failed');
});

test('飞书发送和回复返回统一结果，配置快照不受宿主后续修改影响', async () => {
  const config = { ...credentials }, options = { onMessage() {}, adapterFactory: value => {
    assert.deepEqual(value, credentials);
    return f.adapter;
  } };
  const f = fixture();
  const client = createFeishuClient(config, options);
  config.appSecret = 'CHANGED';
  options.adapterFactory = () => { throw new Error('不应使用修改后的工厂'); };
  assert.deepEqual(await client.replyMessage('om_FAKE_ONLY', outgoing), { messageId: 'om_replied' });
  assert.equal(client.state, 'idle');
  client.stop();
});

test('飞书发送与回复业务拒绝只暴露数字错误码，不自动重试', async () => {
  const f = fixture();
  let calls = 0;
  const rejected = async () => { calls++; return { code: 99991663, msg: 'FAKE_ONLY_SECRET' }; };
  f.adapter.sendMessage = rejected;
  f.adapter.replyMessage = rejected;
  await assert.rejects(f.client.sendMessage({ ...outgoing, receiveId: 'oc_FAKE_ONLY' }),
    error => safe('send')(error) && error.code === 99991663);
  await assert.rejects(f.client.replyMessage('om_FAKE_ONLY', outgoing),
    error => safe('reply')(error) && error.code === 99991663);
  assert.equal(calls, 2);
});

test('飞书发送网络结果未知和畸形成功响应不泄漏原文或自动重发', async () => {
  const f = fixture();
  let calls = 0;
  for (const response of [undefined, {}, { code: 0 }, { code: 0, data: {} }, { code: 'FAKE_ONLY_SECRET' }]) {
    f.adapter.sendMessage = async () => { calls++; return response; };
    await assert.rejects(f.client.sendMessage({ ...outgoing, receiveId: 'oc_FAKE_ONLY' }), safe('send'));
  }
  f.adapter.replyMessage = async () => { calls++; throw new Error('FAKE_ONLY_SECRET'); };
  await assert.rejects(f.client.replyMessage('om_FAKE_ONLY', outgoing), safe('reply'));
  assert.equal(calls, 6);
});

test('飞书发送参数无效时不初始化SDK也不发送', async () => {
  const f = fixture();
  for (const message of [undefined, {}, { ...outgoing, receiveId: '' }, { ...outgoing, receiveId: 'oc_FAKE_ONLY', receiveIdType: 'invalid' },
    { ...outgoing, receiveId: 'oc_FAKE_ONLY', content: '' }, { ...outgoing, receiveId: 'oc_FAKE_ONLY', uuid: '' }])
    await assert.rejects(f.client.sendMessage(message), safe('configuration'));
  await assert.rejects(f.client.replyMessage('', outgoing), safe('configuration'));
  await assert.rejects(f.client.replyMessage('om_FAKE_ONLY', { ...outgoing, replyInThread: 'yes' }), safe('configuration'));
  assert.equal(f.factories, 0);
});

test('飞书更新参数在本地校验且安全失败，不初始化适配器', async () => {
  const f = fixture();
  for (const invalid of [undefined, null, '', ' \t\n', 1, true, {}, ['FAKE_ONLY_SECRET']]) {
    await assert.rejects(f.client.updateMessage(invalid, card), safe('configuration'));
    await assert.rejects(f.client.updateMessage('om_FAKE_ONLY', invalid), safe('configuration'));
  }
  assert.equal(f.factories, 0);
  assert.deepEqual(f.updates, []);
  assert.deepEqual(f.sends, []);
  assert.deepEqual(f.replies, []);
});

test('飞书更新惰性初始化且无需长连接，code为0无需data或消息ID，原样透传', async () => {
  const f = fixture({ onMessage: undefined });
  assert.equal(f.factories, 0);
  assert.equal(await f.client.updateMessage('om_FAKE_ONLY', card), undefined);
  assert.deepEqual(f.updates, [{ messageId: 'om_FAKE_ONLY', content: card }]);
  const content = `  ${card}\n`;
  f.adapter.updateMessage = async (messageId, value) => {
    assert.equal(messageId, 'om_FAKE_ONLY');
    assert.equal(value, content);
    return { code: 0, data: {} };
  };
  assert.equal(await f.client.updateMessage('om_FAKE_ONLY', content), undefined);
  assert.equal(f.factories, 1);
  assert.equal(f.handlers.length, 0);
  assert.equal(f.client.state, 'idle');
  assert.deepEqual(f.sends, []);
  assert.deepEqual(f.replies, []);
});

test('飞书旧适配器缺少更新方法时安全失败，不降级重发，发送和回复仍可用', async () => {
  const f = fixture();
  delete f.adapter.updateMessage;
  await assert.rejects(f.client.updateMessage('om_FAKE_ONLY', card), safe('update'));
  assert.deepEqual(f.sends, []);
  assert.deepEqual(f.replies, []);
  assert.deepEqual(await f.client.sendMessage({ ...outgoing, receiveId: 'oc_FAKE_ONLY' }),
    { messageId: 'om_sent', chatId: 'oc_FAKE_ONLY' });
  assert.deepEqual(await f.client.replyMessage('om_FAKE_ONLY', outgoing), { messageId: 'om_replied' });
  assert.equal(f.factories, 1);
});

test('飞书更新业务失败仅暴露安全整数错误码，畸形响应不泄密也不重试', async () => {
  const f = fixture();
  let calls = 0;
  for (const code of [99991663, 429, undefined, 'FAKE_ONLY_SECRET', '0', NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    f.adapter.updateMessage = async () => { calls++; return { code, msg: 'FAKE_ONLY_SECRET', data: { message_id: 'om_rejected' } }; };
    await assert.rejects(f.client.updateMessage('om_FAKE_ONLY', card), error =>
      safe('update')(error) && error.code === (Number.isSafeInteger(code) ? code : undefined));
  }
  for (const response of [undefined, null, {}, { get code() { throw new Error('FAKE_ONLY_SECRET'); } }]) {
    f.adapter.updateMessage = async () => { calls++; return response; };
    await assert.rejects(f.client.updateMessage('om_FAKE_ONLY', card), safe('update'));
  }
  assert.equal(calls, 13);
  assert.deepEqual(f.sends, []);
  assert.deepEqual(f.replies, []);
  assert.equal(f.client.state, 'idle');
});

test('飞书更新同步异常、网络结果未知和工厂异常安全失败且不自动重试', async () => {
  const f = fixture();
  let calls = 0;
  for (const updateMessage of [() => { calls++; throw new Error('FAKE_ONLY_SECRET'); },
    async () => { calls++; throw new Error('FAKE_ONLY_SECRET'); }]) {
    f.adapter.updateMessage = updateMessage;
    await assert.rejects(f.client.updateMessage('om_FAKE_ONLY', card), safe('update'));
  }
  assert.equal(calls, 2);
  let factories = 0;
  const failed = fixture({ adapterFactory: () => { factories++; throw new Error('FAKE_ONLY_SECRET'); } });
  await assert.rejects(failed.client.updateMessage('om_FAKE_ONLY', card), safe('update'));
  assert.equal(factories, 1);
  assert.deepEqual(f.sends, []);
  assert.deepEqual(f.replies, []);
});

test('飞书更新不改变长连接状态，stop不取消进行中的更新，停止后仍可HTTP更新', async () => {
  const f = fixture();
  await connect(f);
  await f.client.updateMessage('om_FAKE_ONLY', card);
  assert.equal(f.client.state, 'connected');
  assert.equal(f.handlers.length, 1);
  let finish;
  f.adapter.updateMessage = () => new Promise(resolve => { finish = resolve; });
  const pending = f.client.updateMessage('om_FAKE_ONLY', card);
  await flush();
  f.client.stop();
  finish({ code: 0 });
  assert.equal(await pending, undefined);
  assert.equal(f.client.state, 'stopped');
  f.adapter.updateMessage = async () => ({ code: 0 });
  await f.client.updateMessage('om_FAKE_ONLY', card);
  assert.equal(f.client.state, 'stopped');
  assert.equal(f.factories, 1);
  assert.equal(f.handlers.length, 1);
  assert.equal(f.closes, 1);
});

function sdkFixture() {
  const clients = [], sockets = [], dispatchers = [], httpConfigs = [], responses = [], requests = [], requestInterceptors = [];
  const sdk = {
    AppType: { SelfBuild: 0 }, Domain: { Feishu: 0 },
    defaultHttpInstance: { create(config) {
      httpConfigs.push(config);
      return { interceptors: { response: { use(fn) { responses.push(fn); } },
        request: { use(fn) { requestInterceptors.push(fn); } } } };
    } },
    Client: class {
      constructor(config) {
        clients.push(config);
        this.im = { v1: { message: {
          create: async payload => { requests.push(['create', payload]); return { code: 0, data: { message_id: 'om_sent' } }; },
          reply: async payload => { requests.push(['reply', payload]); return { code: 0, data: { message_id: 'om_replied' } }; },
          patch: async payload => { requests.push(['patch', payload]); return { code: 0 }; },
        } } };
      }
    },
    WSClient: class {
      constructor(config) { this.config = config; sockets.push(this); }
      async start(payload) { this.payload = payload; }
      close(params) { this.closed = params; }
    },
    EventDispatcher: class {
      constructor(config) { this.config = config; dispatchers.push(this); }
      register(handlers) { this.handlers = handlers; return this; }
    },
  };
  return { sdk, clients, sockets, dispatchers, httpConfigs, responses, requests, requestInterceptors };
}

test('飞书SDK适配器固定官方域名、自建应用、安全HTTP配置且默认静默日志', async () => {
  const f = sdkFixture();
  await createFeishuSdkAdapter(credentials, async () => f.sdk);
  assert.equal(f.clients.length, 1);
  assert.equal(f.sockets.length, 0);
  assert.equal(f.clients[0].domain, f.sdk.Domain.Feishu);
  assert.equal(f.clients[0].appType, f.sdk.AppType.SelfBuild);
  assert.deepEqual(f.httpConfigs[0], { timeout: 10000, maxRedirects: 0,
    maxContentLength: 1024 * 1024, maxBodyLength: 1024 * 1024, responseType: 'json',
    transitional: { silentJSONParsing: false } });
  assert.deepEqual(f.responses[0]({ data: { code: 0 } }), { code: 0 });
  assert.equal(f.requestInterceptors[0]({ timeout: 15000 }).timeout, 10000);
  for (const log of Object.values(f.clients[0].logger)) assert.equal(log('FAKE_ONLY_SECRET'), undefined);
});

test('飞书SDK适配器注册消息事件，透传生命周期并强制关闭旧socket', async () => {
  const f = sdkFixture(), handled = [];
  const adapter = await createFeishuSdkAdapter(credentials, async () => f.sdk);
  const callbacks = { onReady() {}, onError() {}, onReconnecting() {}, onReconnected() {},
    async onMessage(data) { handled.push(data); } };
  await adapter.start(callbacks);
  assert.equal(f.sockets[0].config.onReady, callbacks.onReady);
  assert.equal(f.sockets[0].config.onError, callbacks.onError);
  assert.equal(f.sockets[0].config.onReconnecting, callbacks.onReconnecting);
  assert.equal(f.sockets[0].config.onReconnected, callbacks.onReconnected);
  assert.equal(f.sockets[0].config.autoReconnect, true);
  assert.equal(f.sockets[0].config.handshakeTimeoutMs, 10000);
  assert.equal(f.sockets[0].payload.eventDispatcher, f.dispatchers[0]);
  await f.dispatchers[0].handlers['im.message.receive_v1'](event);
  assert.deepEqual(handled, [event]);
  adapter.close();
  assert.deepEqual(f.sockets[0].closed, { force: true });
  adapter.close();
  await adapter.start(callbacks);
  assert.equal(f.sockets.length, 2);
  adapter.close();
});

test('真实飞书SDK离线获取token、发送、回复和PATCH卡片，复用token并保留HTTP限制', async () => {
  const sdk = await import('@larksuiteoapi/node-sdk');
  const requests = [];
  const adapter = await createFeishuSdkAdapter(credentials, async () => ({ ...sdk,
    defaultHttpInstance: { create: config => sdk.defaultHttpInstance.create({ ...config,
      adapter: async request => {
        requests.push({ url: request.url, method: request.method, params: request.params, headers: request.headers,
          data: JSON.parse(request.data), timeout: request.timeout, maxRedirects: request.maxRedirects,
          maxContentLength: request.maxContentLength, maxBodyLength: request.maxBodyLength });
        const data = request.url.includes('tenant_access_token') ?
          { code: 0, expire: 7200, tenant_access_token: 'FAKE_ONLY_TENANT_TOKEN' } : request.method === 'patch' ? { code: 0 } :
          { code: 0, data: { message_id: 'om_sdk_result', chat_id: 'oc_FAKE_ONLY' } };
        return { data, status: 200, statusText: 'OK', headers: {}, config: request };
      },
    }) },
  }));
  assert.equal(requests.length, 0);
  await adapter.sendMessage({ ...outgoing, receiveId: 'oc_FAKE_ONLY' });
  await adapter.replyMessage('om_FAKE_ONLY', outgoing);
  const client = createFeishuClient(credentials, { adapterFactory: () => adapter });
  assert.equal(await client.updateMessage('om_FAKE_ONLY', card), undefined);
  assert.equal(client.state, 'idle');
  assert.equal(requests.length, 4);
  assert.equal(requests[0].url, 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal');
  assert.deepEqual(requests[0].data, { app_id: credentials.appId, app_secret: credentials.appSecret });
  assert.equal(requests[1].url, 'https://open.feishu.cn/open-apis/im/v1/messages');
  assert.equal(requests[1].params.receive_id_type, 'chat_id');
  assert.equal(requests[1].headers.Authorization, 'Bearer FAKE_ONLY_TENANT_TOKEN');
  assert.equal(requests[2].url, 'https://open.feishu.cn/open-apis/im/v1/messages/om_FAKE_ONLY/reply');
  assert.deepEqual(requests[2].data, { msg_type: 'text', content: outgoing.content });
  assert.equal(requests[3].method, 'patch');
  assert.equal(requests[3].url, 'https://open.feishu.cn/open-apis/im/v1/messages/om_FAKE_ONLY');
  assert.deepEqual(requests[3].data, { content: card });
  assert.deepEqual(requests[3].params, {});
  assert.equal(requests[3].headers.Authorization, 'Bearer FAKE_ONLY_TENANT_TOKEN');
  assert.equal(requests[3].timeout, 10000);
  assert.equal(requests[3].maxRedirects, 0);
  assert.equal(requests[3].maxContentLength, 1024 * 1024);
  assert.equal(requests[3].maxBodyLength, 1024 * 1024);
});

test('飞书SDK适配器正确映射接收人、回复ID、线程与去重uuid，不混用Webhook格式', async () => {
  const f = sdkFixture();
  const adapter = await createFeishuSdkAdapter(credentials, async () => f.sdk);
  await adapter.sendMessage({ ...outgoing, receiveId: 'oc_FAKE_ONLY' });
  await adapter.sendMessage({ ...outgoing, receiveId: 'ou_FAKE_ONLY', receiveIdType: 'open_id', uuid: 'FAKE_ONLY_UUID' });
  await adapter.replyMessage('om_FAKE_ONLY', { ...outgoing, replyInThread: false, uuid: 'FAKE_ONLY_UUID' });
  assert.deepEqual(await adapter.updateMessage('om_FAKE_ONLY', card), { code: 0 });
  assert.deepEqual(f.requests, [
    ['create', { params: { receive_id_type: 'chat_id' }, data: { receive_id: 'oc_FAKE_ONLY', msg_type: 'text', content: outgoing.content } }],
    ['create', { params: { receive_id_type: 'open_id' }, data: { receive_id: 'ou_FAKE_ONLY', msg_type: 'text', content: outgoing.content, uuid: 'FAKE_ONLY_UUID' } }],
    ['reply', { path: { message_id: 'om_FAKE_ONLY' }, data: { msg_type: 'text', content: outgoing.content, reply_in_thread: false, uuid: 'FAKE_ONLY_UUID' } }],
    ['patch', { path: { message_id: 'om_FAKE_ONLY' }, data: { content: card } }],
  ]);
});
