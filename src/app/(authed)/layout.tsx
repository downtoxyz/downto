import BottomNav from './BottomNav';
import Header from './Header';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Header />
      <main className="flex-1 px-4">{children}</main>
      <BottomNav />
    </>
  );
}
