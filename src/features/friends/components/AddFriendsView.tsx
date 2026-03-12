import { useAuth } from '@/app/providers/AuthProvider';
import searchProfiles from '@/features/profile/services/search-profiles';
import { Profile } from '@/features/profile/types';
import { useEffect, useState } from 'react';
import AddFriendItem from './AddFriendItem';

export default function AddFriendsView({
  debouncedQuery,
}: {
  debouncedQuery: string;
}) {
  const { user } = useAuth();
  const [results, setResults] = useState<Profile[]>([]);

  useEffect(() => {
    const search = async () => {
      const profiles = await searchProfiles({
        query: debouncedQuery,
        userId: user.id,
      });

      setResults(profiles);
    };

    search();
  }, [debouncedQuery]);

  return (
    <div className="flex flex-col">
      {results.map((r) => (
        <AddFriendItem key={r.id} profile={r} />
      ))}
    </div>
  );
}
