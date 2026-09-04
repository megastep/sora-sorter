# Video Catalog Design System

## Purpose

Video Catalog is a dense, editorial review workspace. The interface should feel calm and operational so posters, video, and metadata retain visual priority. Material UI is the sole component system; `frontend/src/theme.ts` is the implementation source of truth.

## Foundations

Use a neutral, high-contrast canvas with one semantic accent: Signal Blue. It marks primary actions, focus, selected cards, ratings, and active controls. Do not introduce competing accent colors.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#f5f7fa` | `#0d1117` |
| Surface | `#ffffff` | `#151b23` |
| Primary text | `#18212f` | `#f3f5f7` |
| Secondary text | `#5c6878` | `#a6b0bf` |
| Signal Blue | `#2563eb` | `#2563eb` |

Use the system sans stack defined by the theme. Headings are compact and slightly tightened; body copy stays plain and readable. MUI’s 8px spacing scale is the baseline. Use 8px for tight gaps, 16px for component gaps, and 24px for panel or section spacing.

## Shape, Layers, and Motion

Use 8px radii for chips, 10px for controls and nested surfaces, and 14px for cards, media frames, and dialogs. The app shell, filter rail, and inspector remain square structural regions. Use outlines for grouping. Only selected cards receive a soft Signal Blue shadow; dialogs may use a stronger neutral shadow. Keep feedback transitions to 140ms and never add decorative motion.

## Components and States

Use MUI controls and semantic tokens before local styling. Buttons have a 36px minimum height; contained buttons are reserved for import and save actions. Inputs, selects, menus, alerts, and accordions inherit shared theme rules. Labels sit above inputs, and visible helper or error text stays below them. Keywords and content flags use comma-separated entry and render as removable pills.

Cards are poster-first. Clicking a poster selects it for editing; the play overlay opens playback. The selected state uses the primary outline and tint, not a new color. Media itself may use black as a neutral viewing surface. Card status is visual: show read-only gold stars when a rating exists and a Signal Blue bookmark when favorited; reserve the status-row height when neither applies so the grid remains aligned.

Montage selection is independent of inspector selection. Each card has a top-left checkbox; selected cards show their one-based montage order in Signal Blue. The Montage page uses the same shell, a black preview stage, a horizontally scrollable ordered timeline, and a narrow settings rail. Keep keyboard move controls alongside drag reordering.

The filter rail keeps search and discovery together: a compact Keywords button directly below Search opens an outlined popover of clickable keyword pills, ordered alphabetically. Popular keywords use a restrained larger type scale; selecting a pill fills Search and closes the popover.

## Color Modes and Responsive Behavior

Both modes must use the same hierarchy, accent, and component states. Never invert individual sections. Keep the color switch available in the toolbar and verify both modes after changing tokens.

At narrow widths, prioritize one-handed review: hide desktop-only rails, use the filters drawer, reduce the wordmark to “Catalog,” and keep toolbar controls to one line. Selecting a video opens its inspector in a right-anchored drawer; never place the editor below the gallery. Preserve full-width cards and readable metadata rather than forcing desktop density onto mobile.

## Implementation Rules

Add reusable visual rules to `frontend/src/theme.ts`; do not copy hex colors, type weights, radii, or shadows into individual components. Local `sx` values are appropriate for grid placement, media aspect ratios, and content-specific overlays. Update this document and add a focused test when a shared token or component contract changes.
