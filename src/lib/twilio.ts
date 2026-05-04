import twilio from 'twilio';
import { teamConfig } from './team-config';
import type { Communication } from './types';

let _client: ReturnType<typeof twilio> | null = null;

export function getTwilio() {
  if (!_client) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set');
    }
    _client = twilio(sid, token);
  }
  return _client;
}

export function fromNumber(): string {
  const f = process.env.TWILIO_FROM_NUMBER;
  if (!f) throw new Error('TWILIO_FROM_NUMBER not set');
  return f;
}

export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (phone.startsWith('+')) return phone;
  return `+1${digits}`;
}

export type SmsDelivery = {
  twilioSid: string;
  to: string;
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'undelivered';
  errorCode: string | null;
  errorMessage: string | null;
  sentAt: string;
};

export async function sendSms(opts: { to: string; body: string }): Promise<SmsDelivery> {
  const client = getTwilio();
  const to = toE164(opts.to);
  const msg = await client.messages.create({
    from: fromNumber(),
    to,
    body: opts.body,
  });
  return {
    twilioSid: msg.sid,
    to,
    status: (msg.status as SmsDelivery['status']) ?? 'queued',
    errorCode: msg.errorCode ? String(msg.errorCode) : null,
    errorMessage: msg.errorMessage ?? null,
    sentAt: new Date().toISOString(),
  };
}

export function brandedSms(opts: {
  parentFirstName: string;
  body: string;
  includeOptOut?: boolean;
}): string {
  const lines = [
    `${teamConfig.teamName}:`,
    `Hi ${opts.parentFirstName},`,
    opts.body,
  ];
  if (opts.includeOptOut !== false) {
    lines.push('Reply STOP to opt out.');
  }
  return lines.join('\n');
}

export type SmsBatchItem = {
  to: string;
  body: string;
  familyId: string;
  playerId?: string;
};

export type SmsBatchResult = {
  familyId: string;
  playerId?: string;
  ok: boolean;
  delivery?: SmsDelivery;
  error?: string;
};

export async function sendSmsBatch(
  items: SmsBatchItem[],
  onItemComplete?: (result: SmsBatchResult, item: SmsBatchItem) => Promise<void> | void,
): Promise<SmsBatchResult[]> {
  const results: SmsBatchResult[] = [];
  const concurrency = 5;
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      let result: SmsBatchResult;
      try {
        const delivery = await sendSms({ to: item.to, body: item.body });
        result = { familyId: item.familyId, playerId: item.playerId, ok: true, delivery };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = { familyId: item.familyId, playerId: item.playerId, ok: false, error: message };
      }
      results[idx] = result;
      if (onItemComplete) {
        try {
          await onItemComplete(result, item);
        } catch (persistErr) {
          console.warn(`[sms.batch] persist callback failed for ${item.familyId}:`, persistErr);
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

export function commFromDelivery(opts: {
  familyId: string;
  playerId?: string;
  body: string;
  delivery?: SmsDelivery;
  error?: string;
}): Omit<Communication, 'id' | 'createdAt'> {
  const now = new Date().toISOString();
  return {
    familyId: opts.familyId,
    playerId: opts.playerId,
    timestamp: now,
    channel: 'sms',
    direction: 'outbound',
    summary: opts.delivery
      ? `SMS sent (${opts.delivery.status})`
      : `SMS failed: ${opts.error ?? 'unknown error'}`,
    body: opts.body,
    twilioSid: opts.delivery?.twilioSid,
    twilioStatus: opts.delivery?.status,
    twilioErrorCode: opts.delivery?.errorCode ?? null,
  };
}
