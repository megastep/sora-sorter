import { Box, CssBaseline, ThemeProvider } from '@mui/material';
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

// fallow-ignore-next-line complexity -- route visibility intentionally preserves catalog and active montage state across navigation.
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
  const [montageMounted, setMontageMounted] = useState(location.pathname === '/montage');
  const theme = useMemo(() => createCatalogTheme(colorMode), [colorMode]);

  useEffect(() => {
    window.localStorage.setItem('video-catalog-color-mode', colorMode);
  }, [colorMode]);
  useEffect(() => {
    window.sessionStorage.setItem(selectionStorageKey, JSON.stringify(montageSelection));
  }, [montageSelection]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: location.pathname === '/' ? 'block' : 'none' }}>
        <CatalogPage
          montageSelection={montageSelection}
          setMontageSelection={setMontageSelection}
          colorMode={colorMode}
          onMontage={() => {
            setMontageMounted(true);
            navigate('/montage');
          }}
          onExports={() => navigate('/montages', { state: { backTo: '/' } })}
          onToggleColorMode={() => setColorMode((mode) => (mode === 'dark' ? 'light' : 'dark'))}
          active={location.pathname === '/'}
        />
      </Box>
      {montageMounted && (
        <Box sx={{ display: location.pathname === '/montage' ? 'block' : 'none' }}>
          <MontagePage
            ids={montageSelection}
            active={location.pathname === '/montage'}
            onBack={() => navigate('/')}
            onReorder={setMontageSelection}
            onExports={() => navigate('/montages')}
          />
        </Box>
      )}
      {location.pathname === '/montages' && (
        <MontageExportsPage onBack={() => navigate(location.state?.backTo ?? '/montage')} />
      )}
    </ThemeProvider>
  );
}
