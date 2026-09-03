import {
  Brightness4Rounded,
  Brightness7Rounded,
  FileUploadRounded,
  FilterListRounded,
  VideoLibraryRounded,
} from '@mui/icons-material';
import {
  AppBar,
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { type Filters } from '../catalog';

export type ColorMode = 'light' | 'dark';

export function CatalogToolbar({
  filters,
  setFilters,
  filtersOpen,
  montageSelectionCount,
  total,
  colorMode,
  importing,
  onSelectAll,
  onUnselectAll,
  onMontage,
  onExports,
  onToggleColorMode,
  onReimport,
}: {
  filters: Filters;
  setFilters: (filters: Filters) => void;
  filtersOpen: () => void;
  montageSelectionCount: number;
  total: number;
  colorMode: ColorMode;
  importing: boolean;
  onSelectAll: () => void;
  onUnselectAll: () => void;
  onMontage: () => void;
  onExports: () => void;
  onToggleColorMode: () => void;
  onReimport: () => void;
}) {
  return (
    <AppBar position="sticky" color="transparent" elevation={0}>
      <Toolbar
        sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', gap: 1.5 }}
      >
        <Tooltip title="Show filters">
          <IconButton
            aria-label="Show filters"
            onClick={filtersOpen}
            sx={{ display: { lg: 'none' } }}
          >
            <FilterListRounded />
          </IconButton>
        </Tooltip>
        <VideoLibraryRounded color="primary" />
        <Typography variant="h6" component="h1" sx={{ mr: 'auto', whiteSpace: 'nowrap' }}>
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            Video{' '}
          </Box>
          Catalog
        </Typography>
        <Button variant="outlined" size="small" onClick={onSelectAll}>
          Select all
        </Button>
        <Button
          variant="outlined"
          size="small"
          disabled={!montageSelectionCount}
          onClick={onUnselectAll}
        >
          Unselect all
        </Button>
        <Button
          variant="contained"
          size="small"
          disabled={montageSelectionCount < 2}
          onClick={onMontage}
        >
          Montage{montageSelectionCount ? ` (${montageSelectionCount})` : ''}
        </Button>
        <Button variant="text" size="small" onClick={onExports}>
          Generated videos
        </Button>
        <Chip
          label={`${total} videos`}
          size="small"
          variant="outlined"
          sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
        />
        <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 154 } }}>
          <InputLabel id="sort-videos-label">Sort</InputLabel>
          <Select
            labelId="sort-videos-label"
            aria-label="Sort videos"
            label="Sort"
            value={filters.sort ?? 'newest'}
            onChange={(event) => setFilters({ ...filters, sort: event.target.value })}
          >
            <MenuItem value="newest">Newest first</MenuItem>
            <MenuItem value="oldest">Oldest first</MenuItem>
            <MenuItem value="title">Title A–Z</MenuItem>
            <MenuItem value="title_desc">Title Z–A</MenuItem>
            <MenuItem value="duration">Longest first</MenuItem>
            <MenuItem value="rating_desc">Rating: highest first</MenuItem>
            <MenuItem value="rating_asc">Rating: lowest first</MenuItem>
            <MenuItem value="language">Language A–Z</MenuItem>
          </Select>
        </FormControl>
        <Tooltip title={`Switch to ${colorMode === 'dark' ? 'light' : 'dark'} mode`}>
          <Switch
            aria-label="Toggle color mode"
            checked={colorMode === 'dark'}
            onChange={onToggleColorMode}
            icon={<Brightness7Rounded fontSize="small" />}
            checkedIcon={<Brightness4Rounded fontSize="small" />}
          />
        </Tooltip>
        <Button
          variant="contained"
          startIcon={<FileUploadRounded />}
          onClick={onReimport}
          disabled={importing}
          sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
        >
          {importing ? 'Importing…' : 'Import / Reimport'}
        </Button>
      </Toolbar>
    </AppBar>
  );
}
