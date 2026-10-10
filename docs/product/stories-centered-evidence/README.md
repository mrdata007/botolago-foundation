Before: prior release c3442d59, actual generated portrait, fresh live audit from this chat. The owner also supplied phone screenshots of the older duplicate-header layout.

After: this branch, local fixture using the repository’s landscape stadium photo. This deliberately checks full-image containment; production stories are portraits. The image stage center stays within 1 CSS pixel of the available body center across all 12 language/viewport/theme cases. Full captions fit without scrolling. Manual credits, loading/error states and navigation pass. Real portrait screenshots will be checked after publication.

The final layout also covers the maximum API lengths: 200-character headlines and 300-character manual credits in both languages at 320×568. When space is tight, the balancing spacer collapses and the image keeps at least 10rem of height; the caption starts in view and the remainder can scroll. This avoids doubling long captions into a blank first screen.
