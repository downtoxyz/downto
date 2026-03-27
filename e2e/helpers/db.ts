/**
 * Direct database helpers for E2E tests.
 * Uses the service role key to bypass RLS.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function headers() {
  return {
    apikey: SERVICE_ROLE,
    Authorization: `Bearer ${SERVICE_ROLE}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

async function query(path: string, options?: RequestInit) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: headers(),
    ...options,
  });
  if (!res.ok) throw new Error(`DB query failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Send a message in a squad chat as a specific user */
export async function sendSquadMessage(squadId: string, senderId: string, text: string) {
  return query("messages", {
    method: "POST",
    body: JSON.stringify({ squad_id: squadId, sender_id: senderId, text, is_system: false }),
  });
}

/** Get a user's unread notification count for a specific squad */
export async function getUnreadSquadNotifications(userId: string, squadId: string) {
  const data = await query(
    `notifications?user_id=eq.${userId}&related_squad_id=eq.${squadId}&is_read=eq.false&type=in.(squad_message,squad_mention)&select=id`
  );
  return data.length;
}

/** Get a squad that both test users are in */
export async function getSharedSquad(userId1: string, userId2: string) {
  // Find squads where user1 is a member
  const memberships1 = await query(
    `squad_members?user_id=eq.${userId1}&select=squad_id`
  );
  const squadIds1 = new Set(memberships1.map((m: { squad_id: string }) => m.squad_id));

  // Find squads where user2 is also a member
  const memberships2 = await query(
    `squad_members?user_id=eq.${userId2}&select=squad_id`
  );

  for (const m of memberships2) {
    if (squadIds1.has(m.squad_id)) {
      const squads = await query(`squads?id=eq.${m.squad_id}&select=id,name`);
      if (squads.length > 0) return squads[0] as { id: string; name: string };
    }
  }
  return null;
}

/** Get user ID by email */
export async function getUserByEmail(email: string): Promise<{ id: string; display_name: string } | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` },
  });
  const data = await res.json();
  const user = data.users?.find((u: { email: string }) => u.email === email);
  if (!user) return null;
  const profiles = await query(`profiles?id=eq.${user.id}&select=id,display_name`);
  return profiles[0] ?? null;
}

/** Update the read cursor for a user in a squad */
export async function updateReadCursor(userId: string, squadId: string) {
  return query("squad_read_cursors", {
    method: "POST",
    headers: { ...headers(), Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ user_id: userId, squad_id: squadId, last_read_at: new Date().toISOString() }),
  });
}

/** Check if a squad has unread messages for a user (cursor-based) */
export async function hasUnreadMessages(userId: string, squadId: string): Promise<boolean> {
  const data = await query(
    `rpc/get_unread_squad_ids`,
    {
      method: "POST",
      body: JSON.stringify({ p_user_id: userId }),
    }
  );
  return data.some((r: { squad_id: string }) => r.squad_id === squadId);
}
