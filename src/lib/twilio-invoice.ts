import twilio from 'twilio';
import type { SmsDelivery } from '@/types';
import { toE164 } from './stripe';

let _client: ReturnType<typeof twilio> | null = null;

export function getTwilio() {
  if (!_client) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set');
    _client = twilio(sid, token);
  }
  return _client;
}

export function fromNumber(): string {
  const f = process.env.TWILIO_FROM_NUMBER;
  if (!f) throw new Error('TWILIO_FROM_NUMBER not set');
  return f;
}

// Send a single SMS. Returns delivery metadata to persist on the invoiceActivity.
export async function sendSms(opts: {
  to: string;
  body: string;
}): Promise<SmsDelivery> {
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
    deliveredAt: null,
  };
}

// Compose the standard tuition invoice SMS body.
export function composeInvoiceSms(opts: {
  parentFirstName: string;
  monthLabel: string; // "May 2026"
  amount: number;
  hostedUrl: string;
}): string {
  const lines = [
    `Hi ${opts.parentFirstName}, AZ Flight Hoops ${opts.monthLabel} tuition is ready.`,
    `Amount: $${opts.amount.toFixed(2)}`,
    `Pay here: ${opts.hostedUrl}`,
    `Reply STOP to opt out.`,
  ];
  return lines.join('\n');
}

export type SmsBatchItem = {
  to: string;
  body: string;
  parentId: string;
  month: string;
};

export type SmsBatchResult = {
  parentId: string;
  month: string;
  ok: boolean;
  delivery?: SmsDelivery;
  error?: string;
};

// Bulk send. Concurrency-limited to avoid Twilio rate-limits + per-message error handling.
// Individual failures do not abort the batch.
//
// onItemComplete fires synchronously after each send (success or fail) so the caller can persist
// to Firestore as we go — fix for SHOULD-FIX (board QA 2026-05-03): persisting at end-of-batch
// risks losing delivery status if the function times out mid-write.
//
// NOTE on concurrency: the cursor++ is safe in Node (single-threaded event loop, increment is
// synchronous between awaits), but explicitly DO NOT run this on a multi-threaded JS runtime
// without porting to an atomic counter.
export async function sendSmsBatch(
  items: SmsBatchItem[],
  onItemComplete?: (result: SmsBatchResult) => Promise<void> | void,
): Promise<SmsBatchResult[]> {
  const results: SmsBatchResult[] = [];
  const concurrency = 5;
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      // SAFE: cursor++ is synchronous; no other worker can interleave between read and increment.
      const idx = cursor++;
      const item = items[idx];
      let result: SmsBatchResult;
      try {
        const delivery = await sendSms({ to: item.to, body: item.body });
        result = { parentId: item.parentId, month: item.month, ok: true, delivery };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result = { parentId: item.parentId, month: item.month, ok: false, error: message };
      }
      results[idx] = result;
      if (onItemComplete) {
        try {
          await onItemComplete(result);
        } catch (persistErr) {
          // Persistence failure should not crash the batch; log and continue.
          console.warn(`[sms.batch] persist callback failed for ${item.parentId}:`, persistErr);
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}
