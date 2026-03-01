// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

interface Contact {
  name: string;
  phone: string;
  relationship: string;
}

interface DispatchRequest {
  contacts: Contact[];
  userName: string;
  location: {
    latitude: number | null;
    longitude: number | null;
    mapsLink: string;
  };
  trigger: string;
  timestamp: string;
  commitmentHash?: string;
  app: string;
  idempotencyKey: string;
}

type StoredResponse = { expiresAt: number; payload: unknown };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,x-api-key,x-idempotency-key',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

const E164_PATTERN = /^\+?[1-9]\d{7,14}$/;
const processed = new Map<string, StoredResponse>();
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000;

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function pruneProcessedStore() {
  const now = Date.now();
  for (const [key, value] of processed.entries()) {
    if (value.expiresAt <= now) processed.delete(key);
  }
}

function isISODate(value: string) {
  return !Number.isNaN(Date.parse(value));
}

function isFiniteNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function validateRequest(body: any): body is DispatchRequest {
  if (!body || typeof body !== 'object') return false;
  if (!Array.isArray(body.contacts) || body.contacts.length < 1 || body.contacts.length > 20) return false;
  if (typeof body.userName !== 'string' || !body.userName.trim() || body.userName.length > 80) return false;
  if (!body.location || typeof body.location !== 'object') return false;
  if (!isFiniteNumberOrNull(body.location.latitude)) return false;
  if (!isFiniteNumberOrNull(body.location.longitude)) return false;
  if (typeof body.location.mapsLink !== 'string' || body.location.mapsLink.length > 300) return false;
  if (typeof body.trigger !== 'string' || !body.trigger.trim() || body.trigger.length > 40) return false;
  if (typeof body.timestamp !== 'string' || !isISODate(body.timestamp)) return false;
  if (typeof body.app !== 'string' || !body.app.trim() || body.app.length > 40) return false;
  if (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.length < 8 || body.idempotencyKey.length > 128) return false;

  return body.contacts.every((contact: any) =>
    typeof contact.name === 'string' &&
    contact.name.trim().length > 0 &&
    contact.name.length <= 80 &&
    typeof contact.phone === 'string' &&
    E164_PATTERN.test(contact.phone.replace(/\s+/g, '')) &&
    typeof contact.relationship === 'string' &&
    contact.relationship.length <= 40
  );
}

function formatSmsMessage(req: DispatchRequest) {
  return [
    'EMERGENCY ALERT - ARAN',
    `Person: ${req.userName}`,
    `Trigger: ${req.trigger}`,
    `Time: ${req.timestamp}`,
    `Location: ${req.location.mapsLink}`,
    req.commitmentHash ? `ZKP Ref: ${req.commitmentHash.slice(0, 24)}...` : '',
  ].filter(Boolean).join('\n');
}

async function sendTwilioSms(to: string, body: string) {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
  const token = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
  const from = Deno.env.get('TWILIO_FROM_NUMBER') ?? '';
  if (!sid || !token || !from) {
    throw new Error('Twilio env missing');
  }

  const auth = btoa(`${sid}:${token}`);
  const form = new URLSearchParams({ To: to, From: from, Body: body });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twilio SMS failed (${response.status}): ${text}`);
  }
  return await response.json();
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const expectedApiKey = Deno.env.get('ARAN_SOS_API_KEY');
  if (expectedApiKey) {
    const provided = request.headers.get('x-api-key');
    if (!provided || provided !== expectedApiKey) return json(401, { error: 'Unauthorized' });
  }

  let payload: DispatchRequest;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON payload' });
  }

  if (!validateRequest(payload)) {
    return json(422, { error: 'Payload validation failed' });
  }

  const headerIdempotency = request.headers.get('x-idempotency-key');
  if (headerIdempotency && headerIdempotency !== payload.idempotencyKey) {
    return json(422, { error: 'Idempotency key mismatch' });
  }

  pruneProcessedStore();
  const existing = processed.get(payload.idempotencyKey);
  if (existing && existing.expiresAt > Date.now()) {
    return json(200, { ok: true, replayed: true, ...(existing.payload as Record<string, unknown>) });
  }

  const message = formatSmsMessage(payload);
  const recipients = payload.contacts.map((c) => c.phone.replace(/\s+/g, ''));
  const results: Array<{ phone: string; ok: boolean; sid?: string; error?: string }> = [];

  await Promise.all(recipients.map(async (phone) => {
    try {
      const twilioResponse = await sendTwilioSms(phone, message);
      results.push({ phone, ok: true, sid: twilioResponse.sid });
    } catch (error) {
      results.push({ phone, ok: false, error: (error as Error).message });
    }
  }));

  const successCount = results.filter((r) => r.ok).length;
  const responsePayload = {
    successCount,
    total: results.length,
    results,
  };
  processed.set(payload.idempotencyKey, {
    expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
    payload: responsePayload,
  });

  return json(200, { ok: successCount > 0, replayed: false, ...responsePayload });
});
