'use client';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import cn from '@/lib/tailwindMerge';

function SettingsItem({
  label,
  className,
  action,
  hideArrow = false,
  onClick,
}: {
  label: string;
  className?: string;
  action?: string;
  hideArrow?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={cn(
        className,
        'flex w-full cursor-pointer justify-between py-3.5 text-xs not-last:border-b not-last:border-neutral-900'
      )}
      onClick={onClick}
    >
      <span>{label}</span>
      {(action || !hideArrow) && (
        <span
          className={cn('text-neutral-700', {
            "after:ml-1 after:content-['→']": !hideArrow,
          })}
        >
          {action}
        </span>
      )}
    </button>
  );
}

export default function ProfileSettings({ igHandle }: { igHandle?: string }) {
  const handleSignOut = async () => {
    const supabase = await createClient();

    const { error } = await supabase.auth.signOut();

    if (error) throw new Error('Could not sign out');

    redirect('/');
  };

  return (
    <>
      <h3 className="text-tiny mb-3.5 tracking-widest text-neutral-700 uppercase">
        settings
      </h3>
      <SettingsItem label="Instagram" action="Add" />
      <SettingsItem label="Push Notifications" action="Enable" />
      {/* <SettingsItem label="Calendar Sync (Google/Apple)" />
      <SettingsItem label="Privacy & Visibility" /> */}
      <SettingsItem label="About" hideArrow />
      <SettingsItem
        label="Log out"
        className="text-danger"
        onClick={handleSignOut}
      />
    </>
  );
}
