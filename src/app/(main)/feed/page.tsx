import { getActiveChecks } from '@/features/checks/services/interest-checks';
import Page from '../components/Page';
import { RealtimeChecks } from '@/features/checks/components/RealtimeChecks';

export default async function FeedPage() {
  const activeChecks = await getActiveChecks();

  return (
    <Page>
      <div className="flex flex-col gap-6">
        <RealtimeChecks serverChecks={activeChecks} />

        {/* Events */}
        {/* <section>
          <h3 className="text-tiny mb-3 tracking-widest uppercase">Events</h3>
          <div className="flex flex-col gap-2">
            {activeChecks.map((c) => (
              <CheckCard key={c.id} check={c} />
            ))}
          </div>
        </section> */}
      </div>
    </Page>
  );
}
