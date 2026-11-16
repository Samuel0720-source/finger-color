// POST /api/chat  (a Vercel serverless function)
// The browser never sees the Gemini key: it lives in the GEMINI_API_KEY environment variable on
// Vercel and is only read here, on the server. All the rules are in server/chat-core.js.

import { GoogleGenAI } from '@google/genai';
import { handleChat, createRateLimiter, LIMITS, RESPONSE_SCHEMA } from '../server/chat-core.js';

const limiter = createRateLimiter({
  perMinute: Number(process.env.CHAT_PER_MINUTE) || LIMITS.perMinute,
  perDay: Number(process.env.CHAT_PER_DAY) || LIMITS.perDay,
  globalPerDay: Number(process.env.CHAT_GLOBAL_PER_DAY) || LIMITS.globalPerDay,
});

let client = null;
async function generate({ model, systemInstruction, contents, signal }) {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await client.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction,
      temperature: 0.3,
      maxOutputTokens: LIMITS.maxOutputTokens,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      abortSignal: signal,
    },
  });
  return response.text;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  // Only this site's own pages may call the endpoint from a browser.
  const origin = req.headers.origin;
  if (origin) {
    let host = '';
    try {
      host = new URL(origin).host;
    } catch {
      /* not a URL */
    }
    if (host !== req.headers.host) return res.status(403).json({ error: 'forbidden' });
  }
  if (!String(req.headers['content-type'] || '').includes('application/json')) return res.status(415).json({ error: 'json_only' });

  const visitor = String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const out = await handleChat({ body: req.body, visitor, env: process.env, limiter, generate });
  if (out.json.retryAfter) res.setHeader('Retry-After', String(out.json.retryAfter));
  return res.status(out.status).json(out.json);
}
