import DownToLogo from '@/shared/components/DownToLogo';

export const dynamic = 'force-dynamic';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col px-6">
      <div className="mt-15 mb-12">
        <DownToLogo size="display" />
        <p className="mt-4 text-xs">from idea to squad in 10 seconds</p>
      </div>
      {children}
    </main>
  );
}
