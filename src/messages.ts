const defaults = {
  'channels.emptyTitle': '通知标题不能为空。',
  'channels.telegramTooLong': 'Telegram 分段后仍然超过消息长度限制。',
  'channels.feishuTooLong': '飞书分段后仍然超过请求大小限制。',
  'channels.noResponse': '服务端没有返回内容。',
  'channels.responseTooLarge': '服务端响应过大，已停止读取。',
  'channels.notJsonObject': '服务端返回的不是 JSON 对象。',
  'channels.network': '网络请求失败或响应无效。为避免重复通知，不会自动重发；这条消息可能没有送达。',
  'channels.rejected': '渠道拒绝了这次发送。请检查凭据、接收人授权、签名和频率限制。',
  'channels.sendFailed': '发送失败，这条消息可能没有送达。',
  'channels.feishuReplyButton': '在 Telegram 回复',
  'channels.telegramReplyButton': '回复',
  'format.noSpace': '可用空间不足，无法分段。',
  'format.oneChar': '可用空间连一个字符都放不下。',
  'format.telegramHeader': 'Telegram 标题或底部信息太长，没有剩余空间放正文。',
  'format.feishuHeader': '飞书标题或底部信息太长，没有剩余空间放正文。'
} as const;
export type TranslationKey = keyof typeof defaults;
export type Translator = (key: TranslationKey) => string;
export const defaultTranslate: Translator = key => defaults[key];
export class NotifyError extends Error {}
