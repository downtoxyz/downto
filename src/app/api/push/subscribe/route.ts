import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const body = await request.json();
  const { platform, deviceToken, endpoint, p256dh, auth: authKey, userAgent } = body;

  // Native push (iOS / Android)
  if (platform === 'ios' || platform === 'android') {
    if (!deviceToken) {
      return NextResponse.json({ error: 'Missing deviceToken for native push' }, { status: 400 });
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          platform,
          device_token: deviceToken,
          endpoint: `${platform}://${deviceToken}`, // synthetic endpoint for uniqueness
          p256dh: null,
          auth: null,
        },
        { onConflict: 'user_id,device_token' }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If this user has a Safari-on-iOS PWA web push row, the iPhone they just
    // registered the native app on is the same physical device that registered
    // that row. Without this, every push fans out to both the PWA and the
    // native app — duplicate banners on one phone. Mac Safari PWA + Android
    // PWA stay untouched (different UAs).
    if (platform === 'ios') {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('platform', 'web')
        .or('user_agent.ilike.*iPhone*,user_agent.ilike.*iPad*,user_agent.ilike.*iPod*');
    }

    return NextResponse.json({ ok: true });
  }

  // Web push (existing behavior)
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: 'Missing subscription fields' }, { status: 400 });
  }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint,
        p256dh,
        auth: authKey,
        platform: 'web',
        user_agent: typeof userAgent === 'string' ? userAgent : null,
      },
      { onConflict: 'user_id,endpoint' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const body = await request.json();
  const { endpoint, deviceToken } = body;

  if (deviceToken) {
    // Native push unsubscribe
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('device_token', deviceToken);
  } else if (endpoint) {
    // Web push unsubscribe
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint);
  } else {
    return NextResponse.json({ error: 'Missing endpoint or deviceToken' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
