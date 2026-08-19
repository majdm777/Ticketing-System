'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations('Common');
  const pathname = usePathname();
  const router = useRouter();

  function switchLocale(newLocale: string) {
    router.replace(pathname, { locale: newLocale });
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => switchLocale('en')}
        aria-pressed={locale === 'en'}
        className={`min-h-11 min-w-11 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
          locale === 'en'
            ? 'bg-zinc-950 text-white'
            : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'
        }`}
      >
        {t('en')}
      </button>
      <button
        type="button"
        onClick={() => switchLocale('ar')}
        aria-pressed={locale === 'ar'}
        className={`min-h-11 min-w-11 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
          locale === 'ar'
            ? 'bg-zinc-950 text-white'
            : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700'
        }`}
      >
        {t('ar')}
      </button>
    </div>
  );
}
