import { getCurrentProfile } from '@/features/profile/services/profiles';
import Page from '../components/Page';
import { getFriends } from '@/features/friends/services/friendships';
import ProfileHeader from '@/features/profile/components/ProfileHeader';
import ProfileFriends from '@/features/profile/components/ProfileFriends';
import ProfileAvailability from '@/features/profile/components/ProfileAvailability';
import ProfileSettings from '@/features/profile/components/ProfileSettings';

export default async function ProfilePage() {
  const profile = await getCurrentProfile();
  const friends = await getFriends();

  const {
    avatar_letter: avatarLetter,
    display_name: displayName,
    username,
    ig_handle: igHandle,
    availability,
  } = profile;

  return (
    <Page>
      <div className="flex flex-col gap-6">
        <ProfileHeader
          avatarLetter={avatarLetter}
          displayName={displayName}
          username={username}
        />
        <ProfileFriends friends={friends} />
        {availability && (
          <section className="justify-content bg-neutral-925 flex w-full items-center rounded-2xl border border-solid border-neutral-900 px-3.5 py-4">
            <ProfileAvailability availability={availability} />
          </section>
        )}
        <section>
          <ProfileSettings igHandle={igHandle ?? undefined} />
        </section>
      </div>
    </Page>
  );
}
