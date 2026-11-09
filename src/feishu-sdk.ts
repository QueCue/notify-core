import type { FeishuAdapter, FeishuCredentials } from './feishu.js';

type Sdk = typeof import('@larksuiteoapi/node-sdk');
/** 内部适配层；SDK 懒加载，导入 notify-core 或创建客户端都不会建立连接。 */
export async function createFeishuSdkAdapter(credentials: FeishuCredentials,
  loadSdk: () => Promise<Sdk> = () => import('@larksuiteoapi/node-sdk')): Promise<FeishuAdapter> {
  const sdk = await loadSdk();
  // 不使用 SDK 默认日志，避免连接 URL、凭据、事件正文或底层异常进入控制台。
  const quiet = () => {};
  const logger = { error: quiet, warn: quiet, info: quiet, debug: quiet, trace: quiet };
  const httpInstance = sdk.defaultHttpInstance.create({ timeout: 10000, maxRedirects: 0,
    maxContentLength: 1024 * 1024, maxBodyLength: 1024 * 1024, responseType: 'json',
    transitional: { silentJSONParsing: false } });
  // SDK 的长连接发现请求自带 timeout，仍统一收紧到本库的 HTTP 边界。
  httpInstance.interceptors.request.use(request => { request.timeout = 10000; return request; });
  httpInstance.interceptors.response.use(response => response.data);
  // SDK 的 HttpInstance 返回响应正文；Axios 类型不会随上述拦截器改变。
  type SdkHttpInstance = NonNullable<ConstructorParameters<Sdk['Client']>[0]['httpInstance']>;
  const config = { ...credentials, appType: sdk.AppType.SelfBuild, domain: sdk.Domain.Feishu,
    logger, httpInstance: httpInstance as unknown as SdkHttpInstance };
  const client = new sdk.Client(config);
  let connection: InstanceType<Sdk['WSClient']> | undefined;
  return {
    start(handlers) {
      connection = new sdk.WSClient({ ...config, autoReconnect: true, handshakeTimeoutMs: 10000,
        onReady: handlers.onReady, onError: handlers.onError,
        onReconnecting: handlers.onReconnecting, onReconnected: handlers.onReconnected });
      const eventDispatcher = new sdk.EventDispatcher({ logger }).register({
        'im.message.receive_v1': handlers.onMessage,
      });
      return connection.start({ eventDispatcher });
    },
    close() {
      const active = connection;
      connection = undefined;
      active?.close({ force: true });
    },
    sendMessage(message) {
      return client.im.v1.message.create({ params: { receive_id_type: message.receiveIdType ?? 'chat_id' },
        data: { receive_id: message.receiveId, msg_type: message.msgType, content: message.content,
          ...(message.uuid === undefined ? {} : { uuid: message.uuid }) } });
    },
    replyMessage(messageId, message) {
      return client.im.v1.message.reply({ path: { message_id: messageId },
        data: { msg_type: message.msgType, content: message.content,
          ...(message.replyInThread === undefined ? {} : { reply_in_thread: message.replyInThread }),
          ...(message.uuid === undefined ? {} : { uuid: message.uuid }) } });
    },
    updateMessage(messageId, content) {
      return client.im.v1.message.patch({ path: { message_id: messageId }, data: { content } });
    },
  };
}
