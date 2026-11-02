// Sends web push notifications. The database calls this (see push_to() in
// schema.sql) with who to notify and what to say; it looks up their browsers
// and delivers. Deploy: supabase functions deploy push --no-verify-jwt
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_SECRET.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
);

Deno.serve(async (req) => {
  // Only the database knows the secret
  if (req.method !== 'POST' || req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) {
    return new Response('Forbidden', { status: 403 });
  }

  const { users, title, body, url, tag } = await req.json();
  if (!Array.isArray(users) || users.length === 0) return Response.json({ sent: 0 });

  const { data: subs, error } = await supabase.from('push_subscriptions').select('endpoint, p256dh, auth').in('user_id', users);
  if (error) return new Response(error.message, { status: 500 });

  const payload = JSON.stringify({ title, body, url, tag });
  const gone: string[] = [];
  let sent = 0;

  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
        sent += 1;
      } catch (err) {
        // The browser unsubscribed or the subscription expired
        if (err?.statusCode === 404 || err?.statusCode === 410) gone.push(s.endpoint);
        else console.error('push failed', err?.statusCode, err?.body ?? err);
      }
    })
  );

  if (gone.length) await supabase.from('push_subscriptions').delete().in('endpoint', gone);
  return Response.json({ sent, removed: gone.length });
});
