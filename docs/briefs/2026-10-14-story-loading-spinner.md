# Home stories: a spinner while the picture loads (screen brief)

Owner request, 2026-10-14: "in the home stories, when it is loading I don't
want it to say chargement du visuel, changing to circle that's going round."

Branch `claude/story-loading-spinner`. Scope: the loading state of the story
viewer, `src/components/home/StoryViewer.tsx`.

## What must be preserved

- The error state: the broken-image icon with "Impossible de charger le
  visuel" / "تعذّر تحميل الصورة".
- The dimmed black overlay over the stage while the picture is not ready.
- The story timer stays stopped until the picture has loaded.
- Navigation, swipe and hold-to-pause gestures, and the progress bars.
- What screen readers announce: the overlay keeps `role="status"` and the
  loading sentence in French or Arabic.

## Improvement

The visible text "Chargement du visuel…" / "جارٍ تحميل الصورة…" is replaced by
a white spinning circle (`Loader2`, the spinner already used across the app).
The sentence stays as screen-reader-only text.

## Acceptance criteria

- Visual: while loading, only a centred spinning circle shows, no text, in
  French and Arabic, on mobile and desktop. The circle is direction-neutral,
  so right-to-left needs no change.
- With reduced motion turned on, the circle shows without spinning.
- Functional: the error state and everything listed above behave as before.
