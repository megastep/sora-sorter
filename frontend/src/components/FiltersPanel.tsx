import {
  Box,
  Button,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { Filters } from '../catalog';

const FILTER_CHOICES: Record<string, string[]> = {
  language: ['en', 'fr', 'es', 'pt', 'ru', 'ja', 'ko', 'zh', 'none'],
  orientation: ['portrait', 'landscape'],
  speech: ['yes', 'no'],
  review: ['unreviewed', 'shortlisted', 'approved', 'rejected'],
  favorite: ['yes', 'no'],
  publishable: ['yes', 'no'],
};

export function FiltersPanel({
  filters,
  setFilters,
  onClose,
}: {
  filters: Filters;
  setFilters: (value: Filters) => void;
  onClose?: () => void;
}) {
  const set = (key: string, value: string) => setFilters({ ...filters, [key]: value });
  return (
    <Stack spacing={2.25} sx={{ p: 2.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
          Filters
        </Typography>
        <Button
          size="small"
          onClick={() => {
            setFilters({});
            onClose?.();
          }}
        >
          Reset
        </Button>
      </Box>
      <TextField
        label="Search"
        value={filters.q ?? ''}
        onChange={(event) => set('q', event.target.value)}
        placeholder="Titles, keywords, transcripts…"
        size="small"
        fullWidth
      />
      <Divider />
      {Object.entries(FILTER_CHOICES).map(([key, values]) => (
        <FormControl size="small" fullWidth key={key}>
          <InputLabel id={`${key}-filter-label`}>{key}</InputLabel>
          <Select
            labelId={`${key}-filter-label`}
            label={key}
            value={filters[key] ?? ''}
            onChange={(event) => set(key, event.target.value)}
          >
            <MenuItem value="">All</MenuItem>
            {values.map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      ))}
      <TextField
        label="Content flag"
        value={filters.flag ?? ''}
        onChange={(event) => set('flag', event.target.value)}
        placeholder="e.g. profanity"
        size="small"
        fullWidth
      />
    </Stack>
  );
}
