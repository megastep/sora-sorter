import { createTheme, type PaletteMode } from '@mui/material/styles';

export const catalogDesign = {
  signalBlue: '#2563eb',
  radius: { chip: 8, control: 10, card: 14 },
} as const;

export const createCatalogTheme = (mode: PaletteMode) => {
  const isDark = mode === 'dark';

  return createTheme({
    palette: {
      mode,
      primary: {
        main: catalogDesign.signalBlue,
        dark: '#1d4ed8',
        light: '#60a5fa',
        contrastText: '#ffffff',
      },
      background: isDark
        ? { default: '#0d1117', paper: '#151b23' }
        : { default: '#f5f7fa', paper: '#ffffff' },
      text: isDark
        ? { primary: '#f3f5f7', secondary: '#a6b0bf' }
        : { primary: '#18212f', secondary: '#5c6878' },
      divider: isDark ? 'rgba(214, 222, 235, 0.15)' : 'rgba(24, 33, 47, 0.13)',
      action: {
        hover: isDark ? 'rgba(147, 197, 253, 0.08)' : 'rgba(37, 99, 235, 0.06)',
        selected: isDark ? 'rgba(96, 165, 250, 0.16)' : 'rgba(37, 99, 235, 0.1)',
      },
    },
    shape: { borderRadius: catalogDesign.radius.control },
    typography: {
      fontFamily:
        'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      button: { fontWeight: 750, textTransform: 'none' },
      h6: { fontWeight: 800, letterSpacing: '-0.02em' },
      subtitle1: { fontWeight: 750, letterSpacing: '-0.01em' },
      subtitle2: { fontWeight: 750, letterSpacing: '-0.01em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: isDark ? '#0d1117' : '#f5f7fa',
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: { root: { backgroundImage: 'none' } },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: catalogDesign.radius.card,
            backgroundImage: 'none',
            transition: 'border-color 140ms ease, box-shadow 140ms ease, transform 140ms ease',
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: catalogDesign.radius.control },
          notchedOutline: {
            borderColor: isDark ? 'rgba(214, 222, 235, 0.2)' : 'rgba(24, 33, 47, 0.18)',
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { borderRadius: catalogDesign.radius.control, minHeight: 36 } },
      },
      MuiIconButton: { styleOverrides: { root: { borderRadius: catalogDesign.radius.control } } },
      MuiChip: {
        styleOverrides: { root: { borderRadius: catalogDesign.radius.chip, fontWeight: 650 } },
      },
      MuiAlert: { styleOverrides: { root: { borderRadius: catalogDesign.radius.control } } },
      MuiAppBar: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiAccordion: {
        styleOverrides: {
          root: {
            backgroundColor: 'transparent',
            backgroundImage: 'none',
            boxShadow: 'none',
            '&::before': { display: 'none' },
          },
        },
      },
      MuiAccordionSummary: {
        styleOverrides: {
          root: {
            minHeight: 44,
            '&.Mui-expanded': { minHeight: 44 },
          },
          content: {
            margin: '10px 0',
            '&.Mui-expanded': { margin: '10px 0' },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: catalogDesign.radius.card,
            boxShadow: isDark
              ? '0 24px 64px rgba(0, 0, 0, 0.48)'
              : '0 24px 64px rgba(24, 33, 47, 0.2)',
          },
        },
      },
      MuiMenuItem: { styleOverrides: { root: { minHeight: 36 } } },
    },
  });
};
