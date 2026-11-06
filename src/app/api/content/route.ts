import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clearCache, getProvider } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

const contentSchema = z.object({
  kind: z.enum(['player', 'hero', 'homebrewHero', 'map2v2', 'map1v1']),
  name: z.string().trim().min(1, 'Введите название'),
});

/**
 * Adds custom content to the reference lists so it becomes selectable in the
 * match form:
 *   player      -> PlayerList!C  (СПИСОК ИГРОКОВ)
 *   hero        -> PlayerList!D  (герои для анкеты)
 *   homebrewHero-> PlayerList!D + PlayerList!F (фан персы игранные)
 *   map2v2      -> PlayerList!I  (Поля 2 на 2)
 *   map1v1      -> PlayerList!J  (Поля 1 vs 1)
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  const parsed = contentSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? 'Проверьте поля',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const provider = getProvider();
  if (!provider.canWrite) {
    return NextResponse.json(
      {
        error:
          'Режим только для чтения. Добавьте сервисный аккаунт Google в .env.local, чтобы добавлять героев и игроков.',
      },
      { status: 503 },
    );
  }

  const { kind, name } = parsed.data;

  try {
    switch (kind) {
      case 'player':
        await provider.appendListValue('players', name);
        break;
      case 'hero':
        await provider.appendListValue('heroes', name);
        break;
      case 'homebrewHero':
        await provider.appendListValue('heroes', name);
        await provider.appendListValue('fanHeroes', name);
        break;
      case 'map2v2':
        await provider.appendListValue('maps2v2', name);
        break;
      case 'map1v1':
        await provider.appendListValue('maps1v1', name);
        break;
    }
    clearCache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось сохранить';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
