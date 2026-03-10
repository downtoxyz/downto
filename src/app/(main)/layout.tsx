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

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  const unreadCountPromise = getUnreadCount({ userId: user?.id });
  const notificationsPromise = getNotifications({ userId: user?.id });

  const [unreadCount, notifications] = await Promise.all([
    unreadCountPromise,
    notificationsPromise,
  ]);

  return (
    <AuthProvider initialUser={user}>
      <ModalProvider>
        <header className="sticky top-0 z-50 flex items-center justify-between bg-linear-to-b from-neutral-950 from-80% px-4 pt-5 pb-4">
          <DownToLogo />
          <HeaderActions
            unreadCount={unreadCount}
            notifications={notifications}
          />
        </header>

        <main className="flex-1 px-4">{children}</main>

        <footer className="sticky bottom-0 bg-linear-to-t from-neutral-950 from-70% px-4 py-5">
          <nav className="bg-neutral-925 flex justify-around rounded-[1.125rem] border border-neutral-900 py-3">
            <NavLinks />
          </nav>
        </footer>
      </ModalProvider>
    </AuthProvider>
  );
}
