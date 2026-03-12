import AvatarLetter from '@/shared/components/AvatarLetter';
import { Friend } from '../types';
import { AvailabilityMap } from '@/features/profile/types';

export default function FriendItem({ friend }: { friend: Friend }) {
  const { profile, friendshipId } = friend;

  return (
    <div className="flex cursor-pointer items-center gap-4 py-4">
      <AvatarLetter
        avatarLetter={profile.avatar_letter}
        size="medium"
        className="shrink-0"
        highlight
      />
      <div className="flex-1">
        <p className="text-xs text-white">{profile.display_name}</p>
        <p className="text-tiny">{`@${profile.username}`}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        {profile.availability && (
          <span>{AvailabilityMap[profile.availability].emoji}</span>
        )}
        <span>›</span>
      </div>
    </div>
  );
}
