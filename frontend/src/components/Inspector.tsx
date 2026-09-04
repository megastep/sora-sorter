import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Rating,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { CloseRounded, ExpandMoreRounded, SaveRounded } from '@mui/icons-material';
import { useState } from 'react';
import type { KeywordSummary } from '../api';
import { API, toDraft, type Draft, type ReviewStatus, type Video } from '../catalog';
import { catalogDesign } from '../theme';
import { PillInput } from './PillInput';
import { ReferenceEditor } from './ReferenceEditor';

const emptyKeywordSuggestions: KeywordSummary[] = [];

export function Inspector({
  item,
  onSaved,
  onClose,
  drawer = false,
  keywordSuggestions = emptyKeywordSuggestions,
}: {
  item: Video;
  onSaved: (value: Video) => void;
  onClose: () => void;
  drawer?: boolean;
  keywordSuggestions?: KeywordSummary[];
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(item));
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const lines = (key: 'visible_text', label: string) => (
    <TextField
      label={label}
      value={draft[key].join('\n')}
      onChange={(event) =>
        set(
          key,
          event.target.value.split('\n').map((value) => value.trim()),
        )
      }
      multiline
      minRows={3}
      fullWidth
    />
  );
  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${API}/videos/${draft.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          keywords: draft.keywords.filter(Boolean),
          visible_text: draft.visible_text.filter(Boolean),
          content_flags: draft.content_flags.filter(Boolean),
          likeness_references: draft.likeness_references.map(({ name, confidence, basis }) => ({
            name,
            confidence,
            basis,
          })),
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      onSaved((await response.json()) as Video);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Paper
      component="aside"
      square
      sx={{
        gridColumn: drawer ? 'auto' : { xs: 'auto', lg: '1 / -1' },
        borderTop: drawer ? 0 : { xs: 1, lg: 1 },
        borderLeft: 0,
        borderColor: 'divider',
        p: 2.25,
        minWidth: 0,
        alignSelf: 'start',
        ...(drawer
          ? { height: '100%', overflowY: 'auto' }
          : {
              '@media (min-width: 1280px)': {
                gridColumn: 'auto',
                borderTop: 0,
                borderLeft: 1,
                position: 'sticky',
                top: 64,
                maxHeight: 'calc(100vh - 64px)',
                overflowY: 'auto',
              },
            }),
      }}
    >
      <Stack spacing={2}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle1">Inspector</Typography>
          <IconButton aria-label="Close inspector" onClick={onClose} size="small">
            <CloseRounded fontSize="small" />
          </IconButton>
        </Box>
        <Box
          component="video"
          controls
          src={`${API}/videos/${draft.id}/media`}
          poster={`${API}/videos/${draft.id}/poster`}
          sx={{
            width: '100%',
            maxHeight: 300,
            bgcolor: 'common.black',
            borderRadius: `${catalogDesign.radius.card}px`,
          }}
        />
        <TextField
          label="Title"
          value={draft.title}
          onChange={(event) => set('title', event.target.value)}
          fullWidth
        />
        <PillInput
          label="Keywords"
          placeholder="Add a keyword, then press Enter or comma"
          value={draft.keywords}
          onChange={(value) => set('keywords', value)}
          suggestions={keywordSuggestions}
        />
        <TextField
          label="Language"
          value={draft.language ?? ''}
          onChange={(event) => set('language', event.target.value)}
          fullWidth
        />
        <TextField
          label="Summary"
          value={draft.summary}
          onChange={(event) => set('summary', event.target.value)}
          multiline
          minRows={3}
          fullWidth
        />
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreRounded />}>Transcript</AccordionSummary>
          <AccordionDetails>
            <TextField
              aria-label="Transcript"
              value={draft.transcript}
              onChange={(event) => set('transcript', event.target.value)}
              multiline
              minRows={5}
              fullWidth
            />
          </AccordionDetails>
        </Accordion>
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreRounded />}>Visible text</AccordionSummary>
          <AccordionDetails>{lines('visible_text', 'Visible text')}</AccordionDetails>
        </Accordion>
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreRounded />}>Content flags</AccordionSummary>
          <AccordionDetails>
            <PillInput
              label="Content flags"
              placeholder="Add a content flag, then press Enter or comma"
              value={draft.content_flags}
              onChange={(value) => set('content_flags', value)}
            />
          </AccordionDetails>
        </Accordion>
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreRounded />}>
            Likeness / reference evidence
          </AccordionSummary>
          <AccordionDetails>
            <ReferenceEditor
              references={draft.likeness_references}
              onChange={(value) => set('likeness_references', value)}
            />
          </AccordionDetails>
        </Accordion>
        <FormControl fullWidth>
          <InputLabel id="review-status-label">Review status</InputLabel>
          <Select
            labelId="review-status-label"
            label="Review status"
            value={draft.review_status}
            onChange={(event) => set('review_status', event.target.value as ReviewStatus)}
          >
            {(['unreviewed', 'shortlisted', 'approved', 'rejected'] as const).map((value) => (
              <MenuItem key={value} value={value}>
                {value}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Stack spacing={0.5}>
          <Typography id="rating-label" variant="body2" color="text.secondary">
            Rating
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Rating
              name="rating"
              aria-labelledby="rating-label"
              value={draft.rating}
              onChange={(_, value) => set('rating', value)}
            />
            {draft.rating !== null && (
              <Button size="small" onClick={() => set('rating', null)}>
                Clear
              </Button>
            )}
          </Stack>
        </Stack>
        <Stack direction="row" spacing={1}>
          <FormControlLabel
            control={
              <Checkbox
                checked={draft.favorite}
                onChange={(event) => set('favorite', event.target.checked)}
              />
            }
            label="Favorite"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={draft.publishable}
                onChange={(event) => set('publishable', event.target.checked)}
              />
            }
            label="Publishable"
          />
        </Stack>
        <TextField
          label="Notes"
          value={draft.notes}
          onChange={(event) => set('notes', event.target.value)}
          multiline
          minRows={3}
          fullWidth
        />
        {error && <Alert severity="error">{error}</Alert>}
        <Divider />
        <Button variant="contained" startIcon={<SaveRounded />} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
        </Button>
      </Stack>
    </Paper>
  );
}
