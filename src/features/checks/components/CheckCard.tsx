'use client';

import cn from '@/lib/tailwindMerge';
import AvatarLetter from '@/shared/components/AvatarLetter';
import CheckResponses from './CheckResponses';
import { InterestCheck } from '../types';
import { useAuth } from '@/app/providers/AuthProvider';
import CheckActions from './CheckActions';
import { formatInterestCheckExpiresAt } from '../utils';

export default function CheckCard({ check }: { check: InterestCheck }) {
  const { user } = useAuth();

  const {
    responses,
    id,
    author_id: authorId,
    text,
    expires_at: expiresAt,
    author,
  } = check;

  const isAuthor = authorId == user?.id;
  const currentUserResponse =
    responses.find((r) => r.user_id === user?.id)?.response ?? null;

  return (
    <div
      className={cn('rounded-xl border border-solid p-3.5', {
        'bg-neutral-925 border-neutral-900': !isAuthor,
        'bg-dt/5 border-dt/20': isAuthor,
      })}
    >
      <div className="mb-2.5 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <AvatarLetter
            avatarLetter={author.avatar_letter}
            highlight={isAuthor}
          />
          <span
            className={cn('text-tiny', {
              'text-dt': isAuthor,
              'text-neutral-500': !isAuthor,
            })}
          >
            {author.display_name}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-tiny">
            {formatInterestCheckExpiresAt(expiresAt)}
          </span>
        </div>
      </div>
      <div className="mb-3 flex items-start gap-1.5">
        <p className="flex-1 font-serif text-lg leading-[1.4] text-white">
          {text}
        </p>
      </div>
      <div className="flex justify-between">
        <CheckResponses responses={responses} />
        {!isAuthor && (
          <CheckActions checkId={id} response={currentUserResponse} />
        )}
      </div>
    </div>
  );
}
