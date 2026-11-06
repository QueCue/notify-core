import { setTimeout as delay } from 'node:timers/promises';
import { defaultTranslate, NotifyError, type Translator } from './messages.js';
export type Request = (url: string, payload: Record<string, any>) => Promise<Record<string, any>>;
export class TransportError extends NotifyError {}
export class HttpError extends TransportError {
  constructor(public readonly status: number) { super(`HTTP 请求失败（状态码 ${status}）。`); }
}
export interface TransportOptions { translate?: Translator; timeoutMs?: number; maxResponseBytes?: number }
export function createTransport(options: TransportOptions = {}) {
  const t = options.translate ?? defaultTranslate;
  const timeoutMs = options.timeoutMs ?? 10000, maximum = options.maxResponseBytes ?? 1024 * 1024;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(maximum) || maximum < 1)
    throw new NotifyError('传输边界配置无效。');
  return async function requestJson(url: string, payload: Record<string, any>, fetcher: typeof fetch = fetch): Promise<Record<string, any>> {
    try {
      const response = await fetcher(url, { method: 'POST', body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
      if (!response.body) throw new TransportError(t('channels.noResponse'));
      const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > maximum) { await reader.cancel(); throw new TransportError(t('channels.responseTooLarge')); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new TransportError(t('channels.notJsonObject'));
      // 保留渠道的明确拒绝包供 429 等策略处理；HTTP 失败绝不能因正文声称成功而算投递成功。
      if (!response.ok && result.ok !== false && !(Number.isInteger(result.code) && result.code !== 0)) throw new HttpError(response.status);
      return result;
    } catch (error) {
      if (error instanceof TransportError) throw error;
      throw new TransportError(t('channels.network'));
    }
  };
}
export const requestJson = createTransport();
export type TelegramMethod = 'sendMessage' | 'editMessageReplyMarkup' | 'answerCallbackQuery' | 'getMe' | 'getUpdates' | 'getWebhookInfo';
const methods = new Set<string>(['sendMessage', 'editMessageReplyMarkup', 'answerCallbackQuery', 'getMe', 'getUpdates', 'getWebhookInfo']);
export class TelegramApiError extends NotifyError {
  readonly fatal: boolean;
  constructor(public readonly code: number, public readonly retryAfterSeconds = 5) {
    super(`Telegram API 调用失败（错误码 ${code}）。`);
    this.fatal = [401, 404, 409].includes(code);
  }
}
export interface TelegramClientOptions { request?: Request; sleep?: (ms: number) => Promise<unknown>; maxRateLimitWaitSeconds?: number }
export function createTelegramApi(token: string, options: TelegramClientOptions = {}) {
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new NotifyError('Telegram Token 格式无效。');
  const request = options.request ?? requestJson, sleep = options.sleep ?? delay;
  const maxWait = options.maxRateLimitWaitSeconds ?? 60;
  return async (method: string, payload: Record<string, unknown>): Promise<any> => {
    if (!methods.has(method)) throw new NotifyError('不允许的 Telegram API 方法。');
    for (let attempt = 0; ; attempt++) {
      let response: Record<string, any>;
      try { response = await request(`https://api.telegram.org/bot${token}/${method}`, payload); }
      catch (error) { if (error instanceof HttpError) throw new TelegramApiError(error.status); throw error; }
      if (response.ok === true) {
        if (!Object.hasOwn(response, 'result')) throw new NotifyError('Telegram 返回缺少结果。');
        return response.result;
      }
      const code = Number.isSafeInteger(response.error_code) ? response.error_code : 0;
      const rawWait = response.parameters?.retry_after;
      const wait = typeof rawWait === 'number' && Number.isFinite(rawWait) && rawWait > 0 ? rawWait : 5;
      if (code === 429 && attempt === 0 && wait <= maxWait) { await sleep(wait * 1000); continue; }
      throw new TelegramApiError(code, Math.max(1, Math.min(300, Math.ceil(wait))));
    }
  };
}
export function splitPlainText(text: string, limit = 4000): string[] {
  if (!Number.isSafeInteger(limit) || limit < 2 || limit > 4096) throw new NotifyError('消息分段上限无效。');
  const parts: string[] = []; let part = '';
  for (const ch of text) { if (part.length + ch.length > limit) { parts.push(part); part = ''; } part += ch; }
  if (part || !parts.length) parts.push(part);
  return parts;
}
