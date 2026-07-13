// Server-side Telegram notifier — reuses the existing "Giles" bot.
// Token + chat id come from env (never hardcoded): set TELEGRAM_BOT_TOKEN and
// TELEGRAM_CHAT_ID on the Netlify site and in .env.local for local dev.
// Best-effort: callers should not fail their main operation if this returns { ok:false }.

const DEFAULT_CHAT_ID = '8745237088'; // Jonas — fallback only; prefer TELEGRAM_CHAT_ID env

export async function sendTelegram(text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || DEFAULT_CHAT_ID;
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
    if (!res.ok || !j.ok) return { ok: false, error: `telegram ${res.status} ${JSON.stringify(j)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
