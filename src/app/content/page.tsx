import { ContentManager } from '@/components/ContentManager';
import { loadAppData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function ContentPage() {
  const data = await loadAppData();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-wide text-parch-100 sm:text-3xl">
          Контент и изображения
        </h1>
        <p className="mt-1 text-sm text-parch-500">
          Фан-персонажи, новые игроки, поля боя и картинки для аватаров.
        </p>
      </div>
      <ContentManager data={data} />
    </div>
  );
}
