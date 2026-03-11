'use client';

import { useEffect, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import CheckCard from './CheckCard';
import { getActiveChecks } from '../services/interest-checks';
import { InterestCheck } from '../types';

export function RealtimeChecks({
  serverChecks,
}: {
  serverChecks: InterestCheck[];
}) {
  const supabase = createClient();
  const [checks, setChecks] = useState<InterestCheck[]>(serverChecks);

  const refreshChecks = async () => {
    const res = await getActiveChecks();
    setChecks(res);
  };

  useEffect(() => {
    const channel = supabase
      .channel('realtime_interest_checks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'interest_checks' },
        () => refreshChecks()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'check_responses' },
        () => refreshChecks()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'check_co_authors' },
        () => refreshChecks()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, checks, setChecks]);

  return (
    <section>
      <h3 className="text-tiny mb-3 tracking-widest uppercase">Pulse</h3>
      <div className="flex flex-col gap-2">
        {checks.map((c) => (
          <CheckCard key={c.id} check={c} />
        ))}
      </div>
    </section>
  );
}
