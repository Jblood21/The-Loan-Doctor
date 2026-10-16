import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { getStoredTheme, resolvedTheme, setTheme } from '@/lib/theme';

/**
 * A sidebar control that flips between light and dark. It reads the currently
 * resolved theme (which may be following the OS) and, on click, stores the
 * explicit opposite. Matches the look of the other sidebar buttons.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(resolvedTheme(getStoredTheme()) === 'dark');
  }, []);

  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    setTheme(next);
    setDark(!dark);
  };

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex items-center gap-3 rounded-[9px] border-none bg-transparent px-3 py-[10px] text-left text-[14px] font-medium text-text-soft transition-colors hover:bg-[var(--surface-tint)]"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
      {dark ? 'Light mode' : 'Dark mode'}
    </button>
  );
}
