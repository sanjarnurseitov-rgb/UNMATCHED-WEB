'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, Chip, Panel } from './ui';
import type { AppData } from '@/lib/types';

type Kind = 'hero' | 'homebrewHero' | 'player' | 'map2v2' | 'map1v1';

const KIND_LABELS: Record<Kind, string> = {
  hero: 'Официальный герой',
  homebrewHero: 'Фан-персонаж (homebrew)',
  player: 'Игрок',
  map2v2: 'Поле для 2 vs 2',
  map1v1: 'Поле для 1 vs 1',
};

export function ContentManager({ data }: { data: AppData }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('homebrewHero');
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const homebrew = useMemo(
    () => data.reference.heroes.filter((h) => h.homebrew),
    [data.reference.heroes],
  );
  const official = useMemo(
    () => data.reference.heroes.filter((h) => !h.homebrew),
    [data.reference.heroes],
  );

  async function addContent(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, name: name.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage({ kind: 'err', text: payload.error ?? 'Не удалось сохранить' });
        return;
      }

      // Attach an image URL to the new entry when one was supplied.
      if (imageUrl.trim()) {
        const imageResponse = await fetch('/api/images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            type: kind === 'player' ? 'player' : 'hero',
            url: imageUrl.trim(),
          }),
        });
        if (!imageResponse.ok) {
          const imagePayload = await imageResponse.json();
          setMessage({
            kind: 'err',
            text: `Запись создана, но изображение не сохранилось: ${imagePayload.error}`,
          });
          setName('');
          setImageUrl('');
          router.refresh();
          return;
        }
      }

      setMessage({ kind: 'ok', text: `«${name.trim()}» добавлен в справочник` });
      setName('');
      setImageUrl('');
      router.refresh();
    } catch {
      setMessage({ kind: 'err', text: 'Сеть недоступна' });
    } finally {
      setBusy(false);
    }
  }

  async function saveImage(entryName: string, type: 'player' | 'hero', url: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: entryName, type, url }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage({ kind: 'err', text: payload.error ?? 'Не удалось сохранить изображение' });
        return;
      }
      setMessage({ kind: 'ok', text: `Изображение для «${entryName}» обновлено` });
      router.refresh();
    } catch {
      setMessage({ kind: 'err', text: 'Сеть недоступна' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <Panel
          title="Добавить персонажа, игрока или поле"
          subtitle="Новая запись сразу появится в выпадающих списках формы матча"
        >
          {!data.meta.canWrite ? (
            <div className="mb-4 rounded-lg border border-crimson-600/40 bg-crimson-600/10 px-4 py-3 text-sm text-crimson-400">
              Запись недоступна: добавьте сервисный аккаунт Google в <code>.env.local</code>.
              Справочники ниже показаны в режиме только для чтения.
            </div>
          ) : null}

          <form onSubmit={addContent} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs text-parch-500">Тип записи</span>
                <select
                  className="field"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as Kind)}
                >
                  {(Object.keys(KIND_LABELS) as Kind[]).map((key) => (
                    <option key={key} value={key}>
                      {KIND_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-parch-500">Название</span>
                <input
                  className="field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    kind === 'homebrewHero' ? 'например: Сейлор (фан)' : 'название записи'
                  }
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs text-parch-500">
                Ссылка на изображение (необязательно)
              </span>
              <input
                className="field"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://… (Google Drive / GitHub / любой прямой URL)"
              />
            </label>

            <div className="flex items-center gap-3">
              <button type="submit" className="btn btn-gold" disabled={busy || !name.trim()}>
                {busy ? 'Сохраняем…' : 'Добавить'}
              </button>
              {message ? (
                <span
                  className={`text-sm ${
                    message.kind === 'ok' ? 'text-emerald-400' : 'text-crimson-400'
                  }`}
                >
                  {message.text}
                </span>
              ) : null}
            </div>
          </form>
        </Panel>

        <ImageBinder
          title="Фан-персонажи"
          subtitle="Привяжите картинку к любому персонажу — она появится в дашборде"
          items={homebrew}
          type="hero"
          onSave={saveImage}
          busy={busy}
        />

        <ImageBinder
          title="Официальные герои"
          subtitle="Изображения для героев из основной игры"
          items={official.slice(0, 40)}
          type="hero"
          onSave={saveImage}
          busy={busy}
        />
      </div>

      <div className="space-y-4">
        <Panel title="Справочник" subtitle="Что сейчас доступно в выпадающих списках">
          <div className="space-y-3 text-sm">
            <Row label="Игроки" value={data.reference.players.length} />
            <Row label="Герои (всего)" value={data.reference.heroes.length} />
            <Row label="Фан-персонажи" value={homebrew.length} />
            <Row label="Поля 2 vs 2" value={data.reference.maps.filter((m) => m.mode === '2v2').length} />
            <Row label="Поля 1 vs 1" value={data.reference.maps.filter((m) => m.mode === '1v1').length} />
          </div>
        </Panel>

        <Panel title="Где хранятся данные">
          <div className="space-y-3 text-xs text-parch-500">
            <div>
              <p className="stat-label mb-1">PlayerList</p>
              <p>
                Колонка C — игроки, D — герои, F — фан-персонажи, I и J — поля для 2 vs 2 и
                1 vs 1.
              </p>
            </div>
            <div>
              <p className="stat-label mb-1">Ответы на форму (3)</p>
              <p>Сюда дописываются новые матчи — та же таблица, что и у Google Формы.</p>
            </div>
            <div>
              <p className="stat-label mb-1">Images</p>
              <p>
                Новая вкладка: имя, тип (player/hero) и URL картинки. Создаётся
                автоматически при первой записи.
              </p>
            </div>
          </div>
        </Panel>

        <Panel title="Игроки" subtitle="Из истории и справочника">
          <div className="flex flex-wrap gap-1.5">
            {data.reference.players.map((player) => (
              <Chip key={player.name} tone="neutral">
                {player.name}
              </Chip>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between border-b border-ink-800 pb-2 last:border-0">
      <span className="text-parch-400">{label}</span>
      <span className="font-semibold text-parch-100">{value}</span>
    </div>
  );
}

function ImageBinder({
  title,
  subtitle,
  items,
  type,
  onSave,
  busy,
}: {
  title: string;
  subtitle: string;
  items: Array<{ name: string; image?: string | null }>;
  type: 'player' | 'hero';
  onSave: (name: string, type: 'player' | 'hero', url: string) => Promise<void>;
  busy: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [url, setUrl] = useState('');

  return (
    <Panel title={title} subtitle={subtitle}>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.name}
            className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5"
          >
            <Avatar name={item.name} image={item.image ?? null} size={26} rounded="rounded-md" />
            <span className="min-w-0 flex-1 truncate text-xs text-parch-200">{item.name}</span>
            {item.image ? (
              <Chip tone="emerald">есть</Chip>
            ) : (
              <Chip tone="neutral">нет</Chip>
            )}
            <button
              type="button"
              className="btn btn-ghost px-2 py-1 text-xs"
              onClick={() => {
                setOpen(open === item.name ? null : item.name);
                setUrl(item.image ?? '');
              }}
            >
              {open === item.name ? '×' : '🔗'}
            </button>
            {open === item.name ? (
              <div className="col-span-full flex gap-2 pt-1">
                <input
                  className="field text-xs"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                />
                <button
                  type="button"
                  className="btn btn-gold px-3 py-1 text-xs"
                  disabled={busy || !url.trim()}
                  onClick={() => onSave(item.name, type, url.trim())}
                >
                  Сохранить
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}
