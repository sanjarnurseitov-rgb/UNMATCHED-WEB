import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clearCache, getProvider } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

const imageSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(['player', 'hero']),
  url: z
    .string()
    .trim()
    .min(1)
    .refine((v) => /^https?:\/\//i.test(v), 'Ссылка должна начинаться с http(s)://'),
});

/**
 * Stores an image URL for a player or a hero in the `Images` tab
 * (name | type | url). The dashboard reads that tab and renders the avatars.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  const parsed = imageSchema.safeParse(payload);
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
          'Режим только для чтения. Добавьте сервисный аккаунт Google в .env.local, чтобы привязывать изображения.',
      },
      { status: 503 },
    );
  }

  try {
    await provider.upsertImage(parsed.data.name, parsed.data.type, parsed.data.url);
    clearCache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось сохранить изображение';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
