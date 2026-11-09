import { AppProviders } from '@/components/AppProviders';
import { HistoryTable } from '@/components/HistoryTable';
import { loadAppData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const data = await loadAppData();
  return (
    <AppProviders data={data}>
      <div className="space-y-6">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-wide text-parch-100 sm:text-3xl">
            История матчей
          </h1>
          <p className="mt-1 text-sm text-parch-500">
            {data.matches.length} записей из таблицы «Ответы на форму (3)».
          </p>
        </div>
        <HistoryTable data={data} />
      </div>
    </AppProviders>
  );
}
