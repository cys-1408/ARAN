exports.handler = async function handler(context, event, callback) {
  try {
    const apiKey = context.ARAN_SOS_API_KEY;
    if (apiKey && event.apiKey !== apiKey) {
      return callback(null, { ok: false, error: 'Unauthorized' });
    }

    const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
    if (!payload || !Array.isArray(payload.contacts) || !payload.contacts.length) {
      return callback(null, { ok: false, error: 'Invalid payload' });
    }

    const client = context.getTwilioClient();
    const from = context.TWILIO_FROM_NUMBER;
    if (!from) {
      return callback(null, { ok: false, error: 'TWILIO_FROM_NUMBER missing' });
    }

    const body = [
      'EMERGENCY ALERT - ARAN',
      `Person: ${payload.userName}`,
      `Trigger: ${payload.trigger}`,
      `Location: ${payload.location?.mapsLink ?? 'Unavailable'}`,
      payload.commitmentHash ? `ZKP Ref: ${String(payload.commitmentHash).slice(0, 24)}...` : '',
    ].filter(Boolean).join('\n');

    const results = await Promise.all(payload.contacts.map(async (contact) => {
      try {
        const msg = await client.messages.create({
          to: String(contact.phone).replace(/\s+/g, ''),
          from,
          body,
        });
        return { phone: contact.phone, ok: true, sid: msg.sid };
      } catch (error) {
        return { phone: contact.phone, ok: false, error: error.message };
      }
    }));

    const successCount = results.filter((r) => r.ok).length;
    callback(null, {
      ok: successCount > 0,
      successCount,
      total: results.length,
      results,
    });
  } catch (error) {
    callback(null, { ok: false, error: error.message });
  }
};
