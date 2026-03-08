import NavLinks from './components/NavLinks';
import DownToLogo from '@/components/ui/DownToLogo';
import HeaderActions from './components/HeaderActions';
import { getUnreadCount } from '@/lib/notifications';
import { AuthProvider } from './components/AuthProvider';
import { getUser } from '@/lib/auth';

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();
  const notificationCount = await getUnreadCount();

  return (
    <>
      <header className="sticky top-0 z-50 flex items-center justify-between bg-linear-to-b from-neutral-950 from-80% px-4 pt-5 pb-4">
        <DownToLogo />
        <HeaderActions notificationCount={notificationCount} />
      </header>

      <main className="flex-1 px-4">
        <AuthProvider initialUser={user}>{children}</AuthProvider>
      </main>

      <footer className="sticky bottom-0 bg-linear-to-t from-neutral-950 from-70% px-4 py-5">
        <nav className="bg-neutral-925 flex justify-around rounded-[1.125rem] border border-neutral-900 py-3">
          <NavLinks />
        </nav>
      </footer>
    </>
  );
}
