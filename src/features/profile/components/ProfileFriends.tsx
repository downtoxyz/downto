'use client';

import { useModal } from '@/app/providers/ModalProvider';
import FindFriendsModal from '@/features/friends/components/FindFriendsModal';
import { Friend } from '@/features/friends/types';
import AvatarLetter from '@/shared/components/AvatarLetter';

const MAX_VISIBLE_AVATARS = 4;

export default function ProfileFriends({ friends }: { friends: Friend[] }) {
  const { openModal, closeModal } = useModal();

  const openFriendsModal = () => {
    openModal(<FindFriendsModal friends={friends} closeModal={closeModal} />);
  };

  return (
    <button
      className="bg-neutral-925 flex w-full cursor-pointer items-center justify-between gap-2 rounded-2xl border border-solid border-neutral-900 px-3.5 py-4 text-xs text-white"
      onClick={openFriendsModal}
    >
      <div className="flex items-center">
        {friends.slice(0, MAX_VISIBLE_AVATARS).map((f) => (
          <AvatarLetter
            key={f.profile.id}
            avatarLetter={f.profile.avatar_letter}
            size="small"
            className="border-neutral-925 -ml-2 border-2 border-solid"
            highlight
          />
        ))}
        <span className="ml-2">{friends.length} friends</span>
      </div>
      <span className="text-neutral-500">→</span>
    </button>
  );
}
