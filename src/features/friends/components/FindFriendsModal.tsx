import BottomSheetModal from '@/shared/components/BottomSheetModal';
import { Friend } from '../types';
import Button from '@/shared/components/Button';
import { Suspense, useEffect, useState } from 'react';
import Input from '@/shared/components/Form/Input';
import FriendItem from './FriendItem';
import AddFriendsView from './AddFriendsView';

const MODES = ['friends', 'add'];
type Mode = (typeof MODES)[number];

export default function FindFriendsModal({
  friends,
  closeModal,
}: {
  friends: Friend[];
  closeModal: () => void;
}) {
  const [mode, setMode] = useState<Mode>('friends');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [query]);

  return (
    <BottomSheetModal
      onClose={closeModal}
      header={
        <>
          <div className="mb-5 flex justify-around gap-2">
            <Button
              size="medium"
              variant={mode === 'friends' ? 'primary' : 'outline'}
              className="flex-1 uppercase"
              onClick={() => setMode('friends')}
            >
              {`friends (${friends.length})`}
            </Button>
            <Button
              size="medium"
              variant={mode === 'add' ? 'primary' : 'outline'}
              className="flex-1 uppercase"
              onClick={() => setMode('add')}
            >
              add
            </Button>
          </div>
          <Input
            name="query"
            placeholder={
              mode === 'friends'
                ? 'Filter friends...'
                : 'Search users by name or @username...'
            }
            className="w-full"
            onChange={(e) => setQuery(e.target.value)}
            value={query}
          />
        </>
      }
    >
      <div className="flex flex-col">
        {mode === 'friends' && (
          <div className="flex flex-col">
            {friends.map((f) => (
              <FriendItem key={f.friendshipId} friend={f} />
            ))}
          </div>
        )}
        {mode === 'add' && (
          <Suspense fallback={<div>Loading...</div>}>
            <AddFriendsView debouncedQuery={debouncedQuery} />
          </Suspense>
        )}
      </div>
    </BottomSheetModal>
  );
}
