import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildSheetRow } from '@/lib/parse';
import { formatSheetDate } from '@/lib/normalize';
import { clearCache, getProvider } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

const matchSchema = z
  .object({
    mode: z.enum(['1v1', '2v2']),
    players: z.array(z.string().trim().min(1)).min(2).max(4),
    heroes: z.array(z.string().trim().min(1)).min(2).max(4),
    map: z.string().trim().optional().nullable(),
    winner: z.enum(['p1', 'p2', 't1', 't2']),
    comment: z.string().trim().optional().nullable(),
    location: z.string().trim().optional().nullable(),
  })
  .superRefine((value, ctx) => {
    const expected = value.mode === '1v1' ? 2 : 4;
    if (value.players.length !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['players'],
        message: `Для режима ${value.mode} требуется ${expected} игрока`,
      });
    }
    if (value.heroes.length !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['heroes'],
        message: `Для режима ${value.mode} требуется ${expected} героя`,
      });
    }
    // Validation rule: the same hero cannot be picked twice in one match.
    const seen = new Set<string>();
    value.heroes.forEach((hero, index) => {
      const key = hero.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['heroes', index],
          message: `Герой «${hero}» уже выбран в этом матче`,
        });
      }
      seen.add(key);
    });
    if (value.mode === '1v1' && !['p1', 'p2'].includes(value.winner)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['winner'],
        message: 'Для 1 vs 1 победителем может быть только Игрок 1 или Игрок 2',
      });
    }
    if (value.mode === '2v2' && !['t1', 't2'].includes(value.winner)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['winner'],
        message: 'Для 2 vs 2 победителем может быть только Команда 1 или Команда 2',
      });
    }
  });

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Некорректный JSON' }, { status: 400 });
  }

  const parsed = matchSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Проверьте заполнение формы',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
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
          'Режим только для чтения. Добавьте сервисный аккаунт Google в .env.local, чтобы записывать матчи.',
      },
      { status: 503 },
    );
  }

  const input = parsed.data;
  const timestamp = formatSheetDate(new Date());
  const row = buildSheetRow({
    mode: input.mode,
    timestamp,
    players: input.players,
    heroes: input.heroes,
    map: input.map || null,
    winner: input.winner,
    comment: input.comment || null,
    location: input.location || null,
  });

  try {
    await provider.appendMatch(row);
    clearCache();
    return NextResponse.json({ ok: true, timestamp });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось записать матч';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
