'use client';

import AvatarLetter from '@/shared/components/AvatarLetter';
import { CheckResponse } from '../types';

const MAX_VISIBLE_AVATARS = 4;

export default function CheckResponses({
  responses,
}: {
  responses: CheckResponse[];
}) {
  const downs = responses.filter((r) => r.response == 'down');
  const maybes = responses.filter((r) => r.response == 'maybe');

  return (
    <div className="text-tiny flex items-center">
      {responses.length ? (
        <div className="flex items-center gap-2">
          <div className="flex">
            {responses.slice(0, MAX_VISIBLE_AVATARS).map((r) => (
              <AvatarLetter
                size="inline"
                avatarLetter={r.user.avatar_letter}
                highlight={r.response === 'down'}
                className="border-neutral-925 border-2 border-solid not-first:-ml-1.5"
                key={`${r.id}-${r.response}`}
              />
            ))}
            {responses.length > MAX_VISIBLE_AVATARS && (
              <AvatarLetter
                size="inline"
                avatarLetter={`+${responses.length - MAX_VISIBLE_AVATARS}`}
                className="border-neutral-925 border-2 border-solid text-[0.5rem] not-first:-ml-1.5"
              />
            )}
          </div>
          {!!downs.length && (
            <span className="text-dt">{downs.length} down</span>
          )}
          {!!maybes.length && <span>{maybes.length} maybe</span>}
        </div>
      ) : (
        'no responses yet'
      )}
    </div>
  );
}
