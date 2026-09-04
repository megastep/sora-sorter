import { Autocomplete, TextField } from '@mui/material';
import { useState } from 'react';
import type { KeywordSummary } from '../api';
import { filterKeywordSuggestions } from './keywordSuggestions';

const emptySuggestions: KeywordSummary[] = [];

export const normalizePills = (values: readonly string[]) => {
  const seen = new Set<string>();
  const pills: string[] = [];

  for (const entry of values) {
    for (const part of entry.split(',')) {
      const pill = part.trim();
      const key = pill.toLowerCase();
      if (!pill || seen.has(key)) continue;
      seen.add(key);
      pills.push(pill);
    }
  }

  return pills;
};

export function PillInput({
  label,
  placeholder,
  value,
  onChange,
  suggestions = emptySuggestions,
}: {
  label: string;
  placeholder: string;
  value: string[];
  onChange: (value: string[]) => void;
  suggestions?: KeywordSummary[];
}) {
  const [inputValue, setInputValue] = useState('');
  const matchingSuggestions = filterKeywordSuggestions(suggestions, inputValue);

  return (
    <Autocomplete<KeywordSummary | string, true, false, true>
      multiple
      freeSolo
      autoSelect
      options={matchingSuggestions}
      filterOptions={(options) => options}
      value={value}
      inputValue={inputValue}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.keyword)}
      onChange={(_, selectedValues) => {
        onChange(
          normalizePills(
            selectedValues.map((selectedValue) =>
              typeof selectedValue === 'string' ? selectedValue : selectedValue.keyword,
            ),
          ),
        );
        setInputValue('');
      }}
      onInputChange={(_, nextValue, reason) => {
        if (reason !== 'input' || !nextValue.includes(',')) {
          setInputValue(nextValue);
          return;
        }

        const parts = nextValue.split(',');
        const pending = parts.pop() ?? '';
        const pills = normalizePills([...value, ...parts]);
        if (pills.length !== value.length) onChange(pills);
        setInputValue(pending);
      }}
      renderOption={(props, option) => {
        const keyword = typeof option === 'string' ? option : option.keyword;
        const count = typeof option === 'string' ? 0 : option.count;
        return (
          <li {...props} key={keyword}>
            {count > 1 ? `${keyword} · ${count}` : keyword}
          </li>
        );
      }}
      renderInput={(params) => <TextField {...params} label={label} placeholder={placeholder} />}
    />
  );
}
