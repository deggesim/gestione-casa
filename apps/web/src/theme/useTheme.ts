import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const read = (): Theme => (localStorage.getItem('theme') === 'dark' ? 'dark' : 'light');

// Theme state + persistence: mirrors the Angular app — localStorage key "theme",
// applied as data-bs-theme on <html>, default light, toggled from the header.
export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(read);

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return {
    theme,
    isDark: theme === 'dark',
    toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
  };
};
