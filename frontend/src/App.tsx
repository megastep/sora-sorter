import { CssBaseline, ThemeProvider } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { selectionStorageKey } from './montage';
import { type ColorMode } from './components/CatalogToolbar';
import { CatalogPage } from './components/CatalogPage';
import { MontagePage } from './components/MontagePage';
import { MontageExportsPage } from './components/MontageExportsPage';
import { createCatalogTheme } from './theme';

const initialColorMode = (): ColorMode => {
  const saved = window.localStorage.getItem('video-catalog-color-mode');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export function App() {
  const [colorMode, setColorMode] = useState<ColorMode>(initialColorMode);
  const [montageSelection, setMontageSelection] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(window.sessionStorage.getItem(selectionStorageKey) ?? '[]');
      return Array.isArray(stored)
        ? stored.filter((value): value is string => typeof value === 'string')
        : [];
    } catch {
      return [];
    }
  });
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useMemo(() => createCatalogTheme(colorMode), [colorMode]);

  useEffect(() => {
    window.localStorage.setItem('video-catalog-color-mode', colorMode);
  }, [colorMode]);
  useEffect(() => {
    window.sessionStorage.setItem(selectionStorageKey, JSON.stringify(montageSelection));
  }, [montageSelection]);

  if (location.pathname === '/montages') {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <MontageExportsPage onBack={() => navigate('/montage')} />
      </ThemeProvider>
    );
  }

  if (location.pathname === '/montage') {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <MontagePage
          ids={montageSelection}
          onBack={() => navigate('/')}
          onReorder={setMontageSelection}
          onExports={() => navigate('/montages')}
        />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <CatalogPage
        montageSelection={montageSelection}
        setMontageSelection={setMontageSelection}
        colorMode={colorMode}
        onMontage={() => navigate('/montage')}
        onExports={() => navigate('/montages')}
        onToggleColorMode={() => setColorMode((mode) => (mode === 'dark' ? 'light' : 'dark'))}
      />
    </ThemeProvider>
  );
}
