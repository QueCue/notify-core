import { NotifyError } from './messages.js';
import { createFeishuSdkAdapter } from './feishu-sdk.js';

export interface FeishuCredentials { appId: string; appSecret: string }
export interface FeishuUserId { open_id?: string; user_id?: string; union_id?: string }
/** 飞书 SDK 分发的消息事件；content 保持平台原始 JSON 字符串。 */
export interface FeishuMessageEvent {
  event_id?: string;
  event_type?: string;
  create_time?: string;
  tenant_key?: string;
  sender: { sender_id?: FeishuUserId; sender_type: string; tenant_key?: string };
  message: {
    message_id: string; chat_id: string; chat_type: string; message_type: string; content: string;
    create_time: string; update_time?: string; root_id?: string; parent_id?: string; thread_id?: string;
    mentions?: { key: string; id: FeishuUserId; name: string; tenant_key?: string }[];
  };
}
export type FeishuReceiveIdType = 'chat_id' | 'open_id' | 'user_id' | 'union_id' | 'email';
export interface FeishuOutgoingMessage { msgType: string; content: string; uuid?: string }
export interface FeishuSendMessage extends FeishuOutgoingMessage { receiveId: string; receiveIdType?: FeishuReceiveIdType }
export interface FeishuReplyMessage extends FeishuOutgoingMessage { replyInThread?: boolean }
export interface FeishuMessageResult { messageId: string; chatId?: string }
export type FeishuState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'stopped';
export type FeishuOperation = 'configuration' | 'connection' | 'stopped' | 'send' | 'reply' | 'update' | 'handler';
const errors: Record<FeishuOperation, string> = {
  configuration: '飞书应用客户端配置无效。',
  connection: '飞书长连接建立失败、超时或已终止。',
  stopped: '飞书长连接启动已取消。',
  send: '飞书消息发送失败，结果可能未知；不会自动重发。',
  reply: '飞书消息回复失败，结果可能未知；不会自动重发。',
  update: '飞书卡片更新失败，结果可能未知；不会自动重试或重发。',
  handler: '飞书消息处理失败。',
};
export class FeishuError extends NotifyError {
  constructor(public readonly operation: FeishuOperation, public readonly code?: number) {
    super(errors[operation]);
    this.name = 'FeishuError';
  }
}
export interface FeishuConnectionHandlers {
  onReady(): void;
  onError(): void;
  onReconnecting(): void;
  onReconnected(): void;
  onMessage(event: FeishuMessageEvent): Promise<void>;
}
export interface FeishuApiResponse { code?: number; data?: { message_id?: string; chat_id?: string } }
/** 工厂及 start 之前的适配器必须无网络副作用；close 必须终止重连。 */
export interface FeishuAdapter {
  start(handlers: FeishuConnectionHandlers): void | Promise<void>;
  close(): void;
  sendMessage(message: FeishuSendMessage): Promise<FeishuApiResponse>;
  replyMessage(messageId: string, message: FeishuReplyMessage): Promise<FeishuApiResponse>;
  /** 可选以兼容旧适配器；缺失时客户端更新安全失败，不退回发送。 */
  updateMessage?(messageId: string, content: string): Promise<FeishuApiResponse>;
}
export interface FeishuClientOptions {
  onMessage?: (event: FeishuMessageEvent) => void | Promise<void>;
  onError?: (error: FeishuError) => void | Promise<void>;
  startTimeoutMs?: number;
  adapterFactory?: (credentials: FeishuCredentials) => FeishuAdapter | Promise<FeishuAdapter>;
}
export interface FeishuClient {
  readonly state: FeishuState;
  start(): Promise<void>;
  /** 关闭长连接，但不取消已经执行的业务回调或 HTTP 发送。 */
  stop(): void;
  sendMessage(message: FeishuSendMessage): Promise<FeishuMessageResult>;
  replyMessage(messageId: string, message: FeishuReplyMessage): Promise<FeishuMessageResult>;
  /** 通过 HTTP 更新已发送卡片；content 为卡片 JSON 字符串，不改变接收人。 */
  updateMessage(messageId: string, content: string): Promise<void>;
}
interface Session {
  promise: Promise<void>;
  resolve(): void;
  reject(error: FeishuError): void;
  timer?: ReturnType<typeof setTimeout>;
}
const receiveIdTypes = new Set<string>(['chat_id', 'open_id', 'user_id', 'union_id', 'email']);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export function createFeishuClient(credentials: FeishuCredentials, options: FeishuClientOptions = {}): FeishuClient {
  const startTimeoutMs = options.startTimeoutMs ?? 10000;
  if (!credentials || typeof credentials.appId !== 'string' || !/^cli_[0-9a-fA-F]{16}$/.test(credentials.appId) ||
      !nonempty(credentials.appSecret) || !Number.isSafeInteger(startTimeoutMs) || startTimeoutMs < 1 || startTimeoutMs > 2147483647 ||
      (options.onMessage !== undefined && typeof options.onMessage !== 'function') ||
      (options.onError !== undefined && typeof options.onError !== 'function') ||
      (options.adapterFactory !== undefined && typeof options.adapterFactory !== 'function')) throw new FeishuError('configuration');
  const config = { appId: credentials.appId, appSecret: credentials.appSecret };
  const { onMessage, onError, adapterFactory = createFeishuSdkAdapter } = options;
  let state: FeishuState = 'idle', session: Session | undefined;
  let adapter: FeishuAdapter | undefined, initializing: Promise<FeishuAdapter> | undefined;

  function report(error: FeishuError): void {
    // 错误观察回调不能破坏连接状态机或产生未处理的 Promise 拒绝。
    void Promise.resolve().then(() => onError?.(error)).catch(() => {});
  }
  function getAdapter(): Promise<FeishuAdapter> {
    if (!initializing) initializing = Promise.resolve().then(() => adapterFactory({ ...config }))
      .then(value => { adapter = value; return value; })
      .catch(() => { initializing = undefined; throw new FeishuError('configuration'); });
    return initializing;
  }
  function closeAdapter(): void {
    try { adapter?.close(); } catch { report(new FeishuError('connection')); }
  }
  function fail(active: Session, error: FeishuError): void {
    if (session !== active) return;
    session = undefined;
    clearTimeout(active.timer);
    state = 'failed';
    closeAdapter();
    active.reject(error);
    report(error);
  }
  function start(): Promise<void> {
    if (session) return session.promise;
    if (!onMessage) return Promise.reject(new FeishuError('configuration'));
    let resolve!: () => void, reject!: (error: FeishuError) => void;
    const active: Session = { promise: new Promise<void>((ok, no) => { resolve = ok; reject = no; }),
      resolve: () => resolve(), reject: error => reject(error) };
    session = active;
    state = 'connecting';
    active.timer = setTimeout(() => fail(active, new FeishuError('connection')), startTimeoutMs);
    const ready = () => {
      if (session !== active) return;
      clearTimeout(active.timer);
      state = 'connected';
      active.resolve();
    };
    void getAdapter().then(value => {
      if (session !== active) return;
      return value.start({
        onReady: ready,
        onError: () => fail(active, new FeishuError('connection')),
        onReconnecting: () => { if (session === active) state = 'reconnecting'; },
        onReconnected: ready,
        onMessage: async event => {
          if (session !== active) return;
          try { await onMessage(event); }
          catch {
            const error = new FeishuError('handler');
            report(error);
            // 交给 SDK 发送失败 ACK，而不是把失败处理伪装为已成功消费。
            throw error;
          }
        },
      });
    }).catch(() => fail(active, new FeishuError('connection')));
    return active.promise;
  }
  function stop(): void {
    const active = session;
    session = undefined;
    state = 'stopped';
    if (active) { clearTimeout(active.timer); active.reject(new FeishuError('stopped')); }
    closeAdapter();
  }
  async function send(operation: 'send' | 'reply', message: FeishuSendMessage | FeishuReplyMessage,
    messageId?: string): Promise<FeishuMessageResult> {
    if (!message || !nonempty(message.msgType) || !nonempty(message.content) ||
        (message.uuid !== undefined && !nonempty(message.uuid))) throw new FeishuError('configuration');
    if (operation === 'send') {
      const target = message as FeishuSendMessage;
      if (!nonempty(target.receiveId) || !receiveIdTypes.has(target.receiveIdType ?? 'chat_id')) throw new FeishuError('configuration');
    } else if (!nonempty(messageId) ||
      ((message as FeishuReplyMessage).replyInThread !== undefined && typeof (message as FeishuReplyMessage).replyInThread !== 'boolean'))
      throw new FeishuError('configuration');
    let response: FeishuApiResponse;
    try {
      const value = await getAdapter();
      response = operation === 'send' ? await value.sendMessage({ ...message } as FeishuSendMessage) :
        await value.replyMessage(messageId!, { ...message });
    } catch { throw new FeishuError(operation); }
    if (response?.code !== 0 || !nonempty(response.data?.message_id))
      throw new FeishuError(operation, Number.isSafeInteger(response?.code) ? response.code : undefined);
    return { messageId: response.data.message_id, ...(nonempty(response.data.chat_id) ? { chatId: response.data.chat_id } : {}) };
  }
  async function updateMessage(messageId: string, content: string): Promise<void> {
    if (!nonempty(messageId) || !nonempty(content)) throw new FeishuError('configuration');
    let code: unknown;
    try {
      const value = await getAdapter();
      const response = await value.updateMessage?.(messageId, content);
      code = response?.code;
    } catch { throw new FeishuError('update'); }
    if (code !== 0) throw new FeishuError('update', typeof code === 'number' && Number.isSafeInteger(code) ? code : undefined);
  }
  return { get state() { return state; }, start, stop, updateMessage,
    sendMessage: message => send('send', message), replyMessage: (messageId, message) => send('reply', message, messageId) };
}
