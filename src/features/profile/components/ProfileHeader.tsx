'use client';

import AvatarLetter from '@/shared/components/AvatarLetter';

export default function ProfileHeader({
  avatarLetter,
  displayName,
  username,
}: {
  avatarLetter: string | null;
  displayName: string;
  username: string;
}) {
  return (
    <div className="pt-5 text-center">
      <div className="mb-3">
        <AvatarLetter avatarLetter={avatarLetter} size="display" highlight />
      </div>
      <div>
        <h2 className="relative inline-block font-(family-name:--font-instrument-serif) text-2xl text-white">
          {displayName}
        </h2>
        <p className="mt-1">@{username ?? 'you'}</p>
        <button
          className="mt-2.5 cursor-pointer rounded-[1.25rem] border border-solid border-neutral-700 bg-transparent px-2.5 py-1.5 text-xs"
          onClick={() => {
            navigator.clipboard.writeText(`https://downto.xyz?add=${username}`);
            //   showToast?.('Link copied!');
          }}
        >
          copy my link
        </button>
      </div>
    </div>
  );
}
