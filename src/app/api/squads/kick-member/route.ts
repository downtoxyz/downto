import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError } from '@/lib/api-auth';

const KICK_MESSAGES = [
  "{name} got the boot",
  "{name} was eliminated. ratio'd.",
  "{name} is no longer canon",
  "{name} just got sent to the shadow realm",
  "{name} was not the imposter. or were they.",
  "{name} disconnected (cap)",
  "{name} took an L today",
  "pov: {name} just got kicked",
  "{name} left the party (they didn't choose to)",
  "it's giving… not {name}",
];

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (isAuthError(auth)) return auth.error;
  const { user, supabase } = auth;

  const { squadId, userId: targetUserId } = await req.json();
  if (!squadId || !targetUserId) {
    return NextResponse.json({ error: 'squadId and userId required' }, { status: 400 });
  }

  if (targetUserId === user.id) {
    return NextResponse.json({ error: "Can't kick yourself (use leave instead)" }, { status: 400 });
  }

  // Verify caller is an active squad member
  const { data: callerMembership } = await supabase
    .from('squad_members')
    .select('id, role')
    .eq('squad_id', squadId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!callerMembership || callerMembership.role === 'waitlist') {
    return NextResponse.json({ error: 'Not an active squad member' }, { status: 403 });
  }

  const { getServiceClient } = await import('@/lib/supabase-admin');
  const adminClient = getServiceClient();

  // Verify target is in the squad
  const { data: targetMembership } = await adminClient
    .from('squad_members')
    .select('id')
    .eq('squad_id', squadId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (!targetMembership) {
    return NextResponse.json({ error: 'Target is not in this squad' }, { status: 400 });
  }

  // Remove them
  const { error: deleteError } = await adminClient
    .from('squad_members')
    .delete()
    .eq('squad_id', squadId)
    .eq('user_id', targetUserId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Get target user's display name + squad name
  const [{ data: targetProfile }, { data: squad }] = await Promise.all([
    adminClient.from('profiles').select('display_name').eq('id', targetUserId).single(),
    adminClient.from('squads').select('name').eq('id', squadId).single(),
  ]);

  const targetName = targetProfile?.display_name ?? 'Someone';
  const squadName = squad?.name ?? 'a squad';
  const msg = KICK_MESSAGES[Math.floor(Math.random() * KICK_MESSAGES.length)].replace('{name}', targetName);

  // System message in chat + notification to kicked user
  await Promise.all([
    adminClient.from('messages').insert({
      squad_id: squadId,
      sender_id: null,
      text: msg,
      is_system: true,
    }),
    adminClient.from('notifications').insert({
      user_id: targetUserId,
      type: 'squad_invite',
      title: squadName,
      body: `You were removed from this squad`,
      related_squad_id: squadId,
    }),
  ]);

  // Auto-promote first waitlisted member if there's now room
  await adminClient.rpc('promote_waitlisted_member', { p_squad_id: squadId });

  return NextResponse.json({ ok: true });
}
