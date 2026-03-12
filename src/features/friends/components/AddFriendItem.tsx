import { Profile } from '@/features/profile/types';
import AvatarLetter from '@/shared/components/AvatarLetter';
import Button from '@/shared/components/Button';

export default function AddFriendItem({ profile }: { profile: Profile }) {
  const {
    avatar_letter: avatarLetter,
    display_name: displayName,
    username,
  } = profile;
  return (
    <div className="flex cursor-pointer items-center gap-4 py-4">
      <AvatarLetter
        avatarLetter={avatarLetter}
        size="medium"
        className="shrink-0"
      />
      <div className="flex-1">
        <p className="text-xs text-white">{displayName}</p>
        <p className="text-tiny">{`@${username}`}</p>
      </div>
      <Button>Add</Button>
    </div>
  );
}
