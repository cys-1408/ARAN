# ARAN Production Backend Setup

## 1) Supabase Edge Function (Twilio relay)

Function file: `supabase/functions/sos-dispatch/index.ts`

Required secrets:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `ARAN_SOS_API_KEY` (optional but recommended)

Deploy:

1. `supabase login`
2. `supabase link --project-ref <project-ref>`
3. `supabase secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM_NUMBER=... ARAN_SOS_API_KEY=...`
4. `supabase functions deploy sos-dispatch`

Frontend `.env`:

- `VITE_SOS_ENDPOINT=https://<project-ref>.supabase.co/functions/v1/sos-dispatch`
- `VITE_SOS_API_KEY=<same-as-ARAN_SOS_API_KEY>`

## 2) Twilio Serverless Alternative

Function file: `twilio/functions/sos-dispatch.js`

Required vars:

- `TWILIO_FROM_NUMBER`
- `ARAN_SOS_API_KEY` (optional)

Expose HTTPS endpoint and set `VITE_SOS_ENDPOINT` to it.

## 3) Heatmap API

Set:

- `VITE_HEATMAP_API_ENDPOINT=https://<your-api>/safety/heatmap`

Expected response:

```json
{
  "points": [
    { "lat": 12.9, "lng": 80.22, "risk": 0.3, "crowd": 0.7, "lighting": 0.8 }
  ],
  "fetchedAt": "2026-03-01T00:00:00.000Z"
}
```
