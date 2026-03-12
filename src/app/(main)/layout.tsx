import NavLinks from './components/NavLinks';
import DownToLogo from '@/shared/components/DownToLogo';
import HeaderActions from './components/HeaderActions';
import {
  getNotifications,
  getUnreadCount,
} from '@/features/notifications/services/notifications';
import { AuthProvider } from '../providers/AuthProvider';
import { getUser } from '@/features/auth/services/auth';
import ModalProvider from '../providers/ModalProvider';
import { redirect } from 'next/navigation';

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  if (!user) {
    // Proxy should automatically redirect unauthed user
    // But just in case, let's redirect here
    redirect('/login');
  }

  const unreadCountPromise = getUnreadCount({ userId: user?.id });
  const notificationsPromise = getNotifications({ userId: user?.id });

  const [unreadCount, notifications] = await Promise.all([
    unreadCountPromise,
    notificationsPromise,
  ]);

  return (
    <AuthProvider initialUser={user}>
      <ModalProvider>
        <header className="flex shrink-0 items-center justify-between px-4 pt-5">
          <DownToLogo />
          <HeaderActions
            unreadCount={unreadCount}
            notifications={notifications}
          />
        </header>

        <main className="flex-1 overflow-y-scroll px-4">
          <div className="sticky top-0 h-4 bg-linear-to-b from-neutral-950 from-30%"></div>
          {children}
          <div className="sticky bottom-0 h-4 bg-linear-to-t from-neutral-950 from-30%"></div>
        </main>

        <footer className="shrink-0 px-4 pb-5">
          <nav className="bg-neutral-925 flex justify-around rounded-[1.125rem] border border-neutral-900 py-3">
            <NavLinks />
          </nav>
        </footer>
      </ModalProvider>
    </AuthProvider>
  );
}
