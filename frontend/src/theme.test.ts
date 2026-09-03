import { describe, expect, it } from 'vitest';
import { catalogDesign, createCatalogTheme } from './theme';

describe('createCatalogTheme', () => {
  it('keeps the catalog surfaces readable in both color modes', () => {
    const light = createCatalogTheme('light');
    const dark = createCatalogTheme('dark');

    expect(light.palette.background.default).toBe('#f5f7fa');
    expect(light.palette.text.primary).toBe('#18212f');
    expect(dark.palette.background.default).toBe('#0d1117');
    expect(dark.palette.text.primary).toBe('#f3f5f7');
    expect(light.palette.primary.main).toBe(catalogDesign.signalBlue);
    expect(light.palette.primary.main).toBe(dark.palette.primary.main);
  });

  it('applies the shared compact control and card shape rules', () => {
    const theme = createCatalogTheme('dark');

    expect(theme.components?.MuiButton?.styleOverrides?.root).toMatchObject({
      borderRadius: catalogDesign.radius.control,
      minHeight: 36,
    });
    expect(theme.components?.MuiCard?.styleOverrides?.root).toMatchObject({
      borderRadius: catalogDesign.radius.card,
    });
  });
});
