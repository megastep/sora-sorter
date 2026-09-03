import { Autocomplete, TextField } from '@mui/material';
import { useState } from 'react';

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
}: {
  label: string;
  placeholder: string;
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [inputValue, setInputValue] = useState('');

  return (
    <Autocomplete<string, true, false, true>
      multiple
      freeSolo
      autoSelect
      options={[]}
      value={value}
      inputValue={inputValue}
      onChange={(_, values) => {
        onChange(normalizePills(values));
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
      renderInput={(params) => <TextField {...params} label={label} placeholder={placeholder} />}
    />
  );
}
