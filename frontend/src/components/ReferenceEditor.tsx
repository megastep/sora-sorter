import { AddRounded, DeleteOutlineRounded } from '@mui/icons-material';
import { Button, IconButton, MenuItem, Paper, Stack, TextField } from '@mui/material';
import { newReference, type ReferenceDraft } from '../catalog';

export function ReferenceEditor({
  references,
  onChange,
}: {
  references: ReferenceDraft[];
  onChange: (value: ReferenceDraft[]) => void;
}) {
  const update = (index: number, key: keyof ReferenceDraft, value: string) =>
    onChange(
      references.map((reference, current) =>
        current === index ? { ...reference, [key]: value } : reference,
      ),
    );
  return (
    <Stack spacing={1.25}>
      {references.map((reference, index) => (
        <Paper variant="outlined" key={reference.editorId} sx={{ p: 1.25 }}>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1}>
              <TextField
                label="Name or character"
                value={reference.name}
                onChange={(event) => update(index, 'name', event.target.value)}
                size="small"
                fullWidth
              />
              <TextField
                select
                label="Confidence"
                value={reference.confidence}
                onChange={(event) => update(index, 'confidence', event.target.value)}
                size="small"
                sx={{ minWidth: 112 }}
              >
                <MenuItem value="possible">Possible</MenuItem>
                <MenuItem value="likely">Likely</MenuItem>
              </TextField>
              <IconButton
                aria-label="Remove reference"
                color="error"
                onClick={() => onChange(references.filter((_, current) => current !== index))}
              >
                <DeleteOutlineRounded />
              </IconButton>
            </Stack>
            <TextField
              label="Evidence"
              value={reference.basis}
              onChange={(event) => update(index, 'basis', event.target.value)}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </Paper>
      ))}
      <Button startIcon={<AddRounded />} onClick={() => onChange([...references, newReference()])}>
        Add reference
      </Button>
    </Stack>
  );
}
