
import { loadAppData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function MatchesPage() {
  const data = await loadAppData();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-wide text-parch-100 sm:text-3xl">
          Записать матч
        </h1>
        <p className="mt-1 text-sm text-parch-500">
          Данные сохраняются в ту же таблицу, что и Google Форма — статистика обновится сразу.
        </p>
      </div>
    </div>
  );
}
