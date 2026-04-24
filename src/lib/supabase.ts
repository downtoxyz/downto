import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'implicit',
  },
});

// supabase-js tries to refresh on boot; if the refresh token is stale (session
// rotated out, db reset in dev, etc.) the refresh rejects with an AuthApiError
// that bubbles up as an unhandled rejection. The client already handles it
// correctly — it clears the session and emits SIGNED_OUT — so the throw is
// leaked noise. Eat it so the Next dev overlay and console stay quiet.
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const err = event.reason;
    if (!err || typeof err !== 'object') return;
    const name = (err as { name?: unknown }).name;
    const message = (err as { message?: unknown }).message;
    if (name === 'AuthApiError' && typeof message === 'string' && message.includes('Refresh Token Not Found')) {
      event.preventDefault();
    }
  });
}
