import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Popover,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { LocalOfferRounded } from '@mui/icons-material';
import { useState } from 'react';
import type { KeywordSummary } from '../api';
import type { Filters } from '../catalog';
export { filterKeywordSuggestions } from './keywordSuggestions';
import { filterKeywordSuggestions } from './keywordSuggestions';

const FILTER_CHOICES: Record<string, string[]> = {
  language: ['en', 'fr', 'es', 'pt', 'ru', 'ja', 'ko', 'zh', 'none'],
  orientation: ['portrait', 'landscape'],
  speech: ['yes', 'no'],
  review: ['unreviewed', 'shortlisted', 'approved', 'rejected'],
  favorite: ['yes', 'no'],
  publishable: ['yes', 'no'],
};

export const keywordCloudFontSize = (count: number, maxCount: number) => {
  if (maxCount <= 1) return 10;
  return 10 + (Math.log(count) / Math.log(maxCount)) * 14;
};

export function FiltersPanel({
  filters,
  setFilters,
  keywords,
  keywordsLoading,
  keywordsError,
  contentFlags,
  contentFlagsLoading,
  contentFlagsError,
  onClose,
}: {
  filters: Filters;
  setFilters: (value: Filters) => void;
  keywords: KeywordSummary[];
  keywordsLoading: boolean;
  keywordsError: boolean;
  contentFlags: string[];
  contentFlagsLoading: boolean;
  contentFlagsError: boolean;
  onClose?: () => void;
}) {
  const [keywordAnchor, setKeywordAnchor] = useState<HTMLElement | null>(null);
  const set = (key: string, value: string) => setFilters({ ...filters, [key]: value });
  const maxKeywordCount = Math.max(1, ...keywords.map(({ count }) => count));
  const selectKeyword = (keyword: string) => {
    set('q', keyword);
    setKeywordAnchor(null);
    onClose?.();
  };
  return (
    <Stack spacing={2.25} sx={{ p: 2.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle1">Filters</Typography>
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
      <Stack spacing={0.25} sx={{ alignItems: 'flex-start' }}>
        <Autocomplete<KeywordSummary, false, false, true>
          freeSolo
          fullWidth
          openOnFocus={false}
          options={filterKeywordSuggestions(keywords, filters.q ?? '')}
          inputValue={filters.q ?? ''}
          getOptionLabel={(option) => (typeof option === 'string' ? option : option.keyword)}
          isOptionEqualToValue={(option, value) =>
            typeof value !== 'string' && option.keyword === value.keyword
          }
          onInputChange={(_, value) => set('q', value)}
          onChange={(_, value) => {
            if (value && typeof value !== 'string') selectKeyword(value.keyword);
          }}
          loading={keywordsLoading}
          noOptionsText={
            keywordsError ? 'Could not load keyword suggestions.' : 'No matching keywords'
          }
          renderOption={(props, option) => (
            <Box component="li" {...props} key={option.keyword}>
              {option.count > 1 ? `${option.keyword} · ${option.count}` : option.keyword}
            </Box>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Search"
              placeholder="Titles, keywords, transcripts…"
              size="small"
              fullWidth
            />
          )}
        />
        <Button
          variant="text"
          size="small"
          startIcon={<LocalOfferRounded />}
          aria-haspopup="dialog"
          aria-expanded={Boolean(keywordAnchor)}
          onClick={(event) => setKeywordAnchor(event.currentTarget)}
          sx={{ minHeight: 28, px: 0.5 }}
        >
          Keywords
        </Button>
      </Stack>
      <Popover
        open={Boolean(keywordAnchor)}
        anchorEl={keywordAnchor}
        onClose={() => setKeywordAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { mt: 1, width: 336, maxWidth: 'calc(100vw - 32px)' } } }}
      >
        <Stack spacing={1.5} sx={{ p: 2 }}>
          <Box>
            <Typography variant="subtitle2">Keyword cloud</Typography>
            <Typography variant="caption" color="text.secondary">
              Choose a keyword to search the catalog.
            </Typography>
          </Box>
          {keywordsLoading ? (
            <Typography variant="body2" color="text.secondary">
              Loading keywords…
            </Typography>
          ) : keywordsError ? (
            <Typography role="alert" variant="body2" color="error.main">
              Could not load keywords.
            </Typography>
          ) : keywords.length ? (
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.75,
                maxHeight: 360,
                overflowY: 'auto',
              }}
            >
              {keywords.map(({ keyword, count }) => {
                const fontSize = keywordCloudFontSize(count, maxKeywordCount);
                return (
                  <Chip
                    key={keyword}
                    label={count > 1 ? `${keyword} · ${count}` : keyword}
                    size="small"
                    onClick={() => selectKeyword(keyword)}
                    sx={{ fontSize: `${fontSize}px`, height: `${fontSize + 12}px` }}
                  />
                );
              })}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No keywords yet.
            </Typography>
          )}
        </Stack>
      </Popover>
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
      <FormControl size="small" fullWidth>
        <InputLabel id="content-flag-filter-label">Content flag</InputLabel>
        <Select
          labelId="content-flag-filter-label"
          label="Content flag"
          value={filters.flag ?? ''}
          onChange={(event) => set('flag', event.target.value)}
          disabled={contentFlagsLoading}
        >
          <MenuItem value="">All</MenuItem>
          {contentFlags.map((flag) => (
            <MenuItem key={flag} value={flag}>
              {flag}
            </MenuItem>
          ))}
        </Select>
        {contentFlagsError && (
          <Typography role="alert" variant="caption" color="error.main" sx={{ mt: 0.5 }}>
            Could not load content flags.
          </Typography>
        )}
      </FormControl>
    </Stack>
  );
}
