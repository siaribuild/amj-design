# Design System: FrameFlow

FrameFlow is an architectural design system with warmth — structured enough to feel professional and trustworthy, soft enough to feel approachable and human.

- **Palette**: Earthy sage green as the hero brand color, warm bone/sand neutrals (never cold gray), and warm charcoal darks with olive undertones replacing cold black. The whole palette feels like natural materials — stone, leaf, paper.
- **Typography**: Space Grotesk for headings brings geometric character with personality; Inter for body stays quiet and readable. Big size jumps between display and body create clear hierarchy — headings command, body recedes.
- **Geometry**: Softened corners (8–16px radii) relieve rigidity without going bubbly. The architectural "frame" concept reads through structure and proportion, not sharp edges.
- **Depth**: Warm-tinted layered shadows create spatial hierarchy — cards float, modals lift, recessed areas sink. Nothing sits flat on the same plane.
- **Rhythm**: Tight spacing groups related elements; generous gaps separate sections. The contrast between dense clusters and open breathing room creates visual cadence.
- **Motion**: Organic easing curves, never mechanical. Quick micro-interactions, deliberate transitions. A subtle bounce curve for playful moments.
- **Brand confidence**: Sage doesn't hide as a quiet accent — it's the primary action color, the focus ring tint, the selection highlight, the interactive signal throughout.

## Theme Reference

```css
/* theme/colors.css */
:root {
  /* Sage — the brand color, promoted from accent to hero */
  --theme-sage-50: #f4f8f6;
  --theme-sage-100: #e6efe9;
  --theme-sage-200: #cddfd4;
  --theme-sage-300: #a8c9b4;
  --theme-sage-400: #7dab8e;
  --theme-sage-500: #5a7a6a;
  --theme-sage-600: #4a6858;
  --theme-sage-700: #3f5a4c;
  --theme-sage-800: #344a3f;
  --theme-sage-900: #2a3d33;
  --theme-sage-950: #1a2b23;

  /* Warm neutrals — bone, sand, never cold gray */
  --theme-neutral-0: #ffffff;
  --theme-neutral-50: #fafaf7;
  --theme-neutral-100: #f5f4f0;
  --theme-neutral-150: #edecea;
  --theme-neutral-200: #e4e2dd;
  --theme-neutral-300: #d4d1cb;
  --theme-neutral-400: #b5b2ab;
  --theme-neutral-500: #8b8880;
  --theme-neutral-600: #6f6c67;
  --theme-neutral-700: #5c5a56;
  --theme-neutral-800: #3a3835;
  --theme-neutral-900: #2a2826;
  --theme-neutral-950: #1d1b19;

  /* Ink — warm charcoal darks, never cold black */
  --theme-ink-50: #f7f6f5;
  --theme-ink-100: #e8e7e4;
  --theme-ink-200: #d1cfcc;
  --theme-ink-300: #a5a29d;
  --theme-ink-400: #7a7771;
  --theme-ink-500: #55524d;
  --theme-ink-600: #3d3b37;
  --theme-ink-700: #2c2a27;
  --theme-ink-800: #1f1d1b;
  --theme-ink-900: #161412;
  --theme-ink-950: #0f0e0c;

  /* Positive — earthy green for success states */
  --theme-positive-50: #f0f9f4;
  --theme-positive-100: #d9f0e3;
  --theme-positive-200: #b0e0c6;
  --theme-positive-300: #7ccaa2;
  --theme-positive-400: #4aad7a;
  --theme-positive-500: #2c7a54;
  --theme-positive-600: #236243;
  --theme-positive-700: #1d4f37;
  --theme-positive-800: #183f2d;
  --theme-positive-900: #133325;

  /* Warning — warm amber */
  --theme-warning-50: #fdf9f0;
  --theme-warning-100: #f9efd5;
  --theme-warning-200: #f0dba5;
  --theme-warning-300: #e4c06e;
  --theme-warning-400: #d4a03c;
  --theme-warning-500: #8a6a2a;
  --theme-warning-600: #7a5410;
  --theme-warning-700: #624410;
  --theme-warning-800: #4d3610;
  --theme-warning-900: #3d2b0e;

  /* Attention — warm red for errors/destructive */
  --theme-attention-50: #fdf4f3;
  --theme-attention-100: #fbe5e3;
  --theme-attention-200: #f5c7c2;
  --theme-attention-300: #eda19a;
  --theme-attention-400: #df6e64;
  --theme-attention-500: #c0392b;
  --theme-attention-600: #a02f23;
  --theme-attention-700: #82261d;
  --theme-attention-800: #6b2019;
  --theme-attention-900: #591c16;

  /* Info — muted blue-gray */
  --theme-info-50: #f3f6f9;
  --theme-info-100: #e2e9f0;
  --theme-info-200: #c4d3e0;
  --theme-info-300: #96b2c8;
  --theme-info-400: #6a90ab;
  --theme-info-500: #4c6a88;
  --theme-info-600: #3d5670;
  --theme-info-700: #31485f;
  --theme-info-800: #283a4d;
  --theme-info-900: #213040;
}


/* theme/motion.css */
:root {
  /* Duration — quick for micro-interactions, deliberate for transitions */
  --theme-motion-instant: 100ms;
  --theme-motion-fast: 150ms;
  --theme-motion-normal: 250ms;
  --theme-motion-slow: 400ms;
  --theme-motion-deliberate: 600ms;

  /* Easing — organic, never mechanical */
  --theme-ease-default: cubic-bezier(0.25, 0.1, 0.25, 1);
  --theme-ease-in: cubic-bezier(0.4, 0, 1, 1);
  --theme-ease-out: cubic-bezier(0, 0, 0.25, 1);
  --theme-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --theme-ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
}


/* theme/radii.css */
:root {
  /* Radii — softened geometry, architectural not bubbly */
  --theme-radius-none: 0;
  --theme-radius-xs: 3px;
  --theme-radius-sm: 5px;
  --theme-radius-md: 8px;
  --theme-radius-lg: 12px;
  --theme-radius-xl: 16px;
  --theme-radius-2xl: 20px;
  --theme-radius-full: 9999px;
}


/* theme/shadows.css */
:root {
  /* Shadows — warm-tinted, layered for spatial hierarchy */

  /* Subtle lift — cards at rest, inputs */
  --theme-shadow-xs: 0 1px 2px rgba(42, 40, 38, 0.04);

  /* Default card elevation */
  --theme-shadow-sm:
    0 1px 3px rgba(42, 40, 38, 0.06),
    0 1px 2px rgba(42, 40, 38, 0.04);

  /* Raised elements — hover states, dropdowns */
  --theme-shadow-md:
    0 4px 8px rgba(42, 40, 38, 0.06),
    0 2px 4px rgba(42, 40, 38, 0.04);

  /* Prominent — modals, popovers */
  --theme-shadow-lg:
    0 10px 24px rgba(42, 40, 38, 0.08),
    0 4px 8px rgba(42, 40, 38, 0.04);

  /* Top layer — command palettes, overlays */
  --theme-shadow-xl:
    0 20px 40px rgba(42, 40, 38, 0.10),
    0 8px 16px rgba(42, 40, 38, 0.05);

  /* Inner shadow — pressed states, inset inputs */
  --theme-shadow-inner: inset 0 1px 3px rgba(42, 40, 38, 0.08);

  /* Focus ring — sage-tinted for brand consistency */
  --theme-shadow-focus: 0 0 0 3px rgba(90, 122, 106, 0.3);
}


/* theme/spacing.css */
:root {
  /* Spacing scale — rhythm-friendly, tight groups vs generous gaps */
  --theme-spacing-2xs: 0.125rem;
  --theme-spacing-xs: 0.25rem;
  --theme-spacing-sm: 0.5rem;
  --theme-spacing-md: 0.75rem;
  --theme-spacing-lg: 1rem;
  --theme-spacing-xl: 1.5rem;
  --theme-spacing-2xl: 2rem;
  --theme-spacing-3xl: 3rem;
  --theme-spacing-4xl: 4rem;
  --theme-spacing-5xl: 6rem;
  --theme-spacing-6xl: 8rem;
}


/* theme/typography.css */
:root {
  /* Font families */
  --theme-font-display: 'Space Grotesk', sans-serif;
  --theme-font-sans: 'Inter', sans-serif;

  /* Font weights */
  --theme-font-weight-light: 300;
  --theme-font-weight-regular: 400;
  --theme-font-weight-medium: 500;
  --theme-font-weight-semibold: 600;
  --theme-font-weight-bold: 700;

  /* Font sizes — pushed contrast: bigger display, smaller body */
  --theme-font-size-xs: 0.75rem;
  --theme-font-size-sm: 0.8125rem;
  --theme-font-size-base: 0.9375rem;
  --theme-font-size-md: 1rem;
  --theme-font-size-lg: 1.125rem;
  --theme-font-size-xl: 1.3125rem;
  --theme-font-size-2xl: 1.625rem;
  --theme-font-size-3xl: 2rem;
  --theme-font-size-4xl: 2.75rem;
  --theme-font-size-5xl: 3.5rem;
  --theme-font-size-6xl: 4.5rem;

  /* Line heights */
  --theme-line-height-none: 1;
  --theme-line-height-tight: 1.1;
  --theme-line-height-snug: 1.25;
  --theme-line-height-normal: 1.5;
  --theme-line-height-relaxed: 1.625;

  /* Letter spacing — tight for display, open for labels */
  --theme-letter-spacing-tighter: -0.03em;
  --theme-letter-spacing-tight: -0.02em;
  --theme-letter-spacing-normal: 0em;
  --theme-letter-spacing-wide: 0.025em;
  --theme-letter-spacing-wider: 0.05em;
}

```

## Tokens and Recipes

```css
/* styles/tokens.css */
:root {
  /* === Brand === */
  --ds-color-brand: var(--theme-sage-500);
  --ds-color-brand-hover: var(--theme-sage-600);
  --ds-color-brand-active: var(--theme-sage-700);
  --ds-color-brand-subtle: var(--theme-sage-100);
  --ds-color-brand-wash: var(--theme-sage-50);

  /* === Text === */
  --ds-text-primary: var(--theme-ink-900);
  --ds-text-secondary: var(--theme-neutral-600);
  --ds-text-muted: var(--theme-neutral-500);
  --ds-text-disabled: var(--theme-neutral-400);
  --ds-text-inverse: var(--theme-neutral-0);
  --ds-text-brand: var(--theme-sage-600);
  --ds-text-link: var(--theme-sage-600);
  --ds-text-link-hover: var(--theme-sage-700);

  /* === Surfaces === */
  --ds-surface-page: var(--theme-neutral-50);
  --ds-surface-card: var(--theme-neutral-0);
  --ds-surface-raised: var(--theme-neutral-0);
  --ds-surface-sunken: var(--theme-neutral-100);
  --ds-surface-overlay: var(--theme-neutral-0);
  --ds-surface-brand: var(--theme-sage-500);
  --ds-surface-brand-subtle: var(--theme-sage-50);
  --ds-surface-dark: var(--theme-ink-800);
  --ds-surface-darker: var(--theme-ink-900);

  /* === Borders === */
  --ds-border-subtle: var(--theme-neutral-200);
  --ds-border-default: var(--theme-neutral-300);
  --ds-border-strong: var(--theme-neutral-400);
  --ds-border-brand: var(--theme-sage-400);
  --ds-border-focus: var(--theme-sage-500);
  --ds-border-input: var(--theme-neutral-300);
  --ds-border-input-hover: var(--theme-neutral-400);
  --ds-border-input-focus: var(--theme-sage-500);

  /* === Interactive === */
  --ds-interactive-primary: var(--theme-sage-500);
  --ds-interactive-primary-hover: var(--theme-sage-600);
  --ds-interactive-primary-active: var(--theme-sage-700);
  --ds-interactive-secondary: var(--theme-neutral-100);
  --ds-interactive-secondary-hover: var(--theme-neutral-200);
  --ds-interactive-ghost-hover: var(--theme-sage-50);
  --ds-interactive-dark: var(--theme-ink-800);
  --ds-interactive-dark-hover: var(--theme-ink-700);

  /* === Status === */
  --ds-color-success: var(--theme-positive-500);
  --ds-color-success-subtle: var(--theme-positive-50);
  --ds-color-success-text: var(--theme-positive-700);
  --ds-color-warning: var(--theme-warning-500);
  --ds-color-warning-subtle: var(--theme-warning-50);
  --ds-color-warning-text: var(--theme-warning-700);
  --ds-color-error: var(--theme-attention-500);
  --ds-color-error-subtle: var(--theme-attention-50);
  --ds-color-error-text: var(--theme-attention-700);
  --ds-color-info: var(--theme-info-500);
  --ds-color-info-subtle: var(--theme-info-50);
  --ds-color-info-text: var(--theme-info-700);

  /* === Layer / Elevation === */
  --ds-layer-base: var(--theme-shadow-xs);
  --ds-layer-raised: var(--theme-shadow-sm);
  --ds-layer-floating: var(--theme-shadow-md);
  --ds-layer-overlay: var(--theme-shadow-lg);
  --ds-layer-top: var(--theme-shadow-xl);

  /* === Focus === */
  --ds-focus-ring: var(--theme-shadow-focus);
}


/* styles/recipes/surface.css */
/* Card — default elevated surface */
.ds-surface-card {
  background: var(--ds-surface-card);
  border: 1px solid var(--ds-border-subtle);
  border-radius: var(--theme-radius-lg);
  box-shadow: var(--ds-layer-raised);
}

/* Raised — interactive card / hover-lift */
.ds-surface-raised {
  background: var(--ds-surface-raised);
  border: 1px solid var(--ds-border-subtle);
  border-radius: var(--theme-radius-lg);
  box-shadow: var(--ds-layer-raised);
  transition: box-shadow var(--theme-motion-fast) var(--theme-ease-default),
              transform var(--theme-motion-fast) var(--theme-ease-default);
}

.ds-surface-raised:hover {
  box-shadow: var(--ds-layer-floating);
  transform: translateY(-1px);
}

/* Sunken — recessed area, inset content */
.ds-surface-sunken {
  background: var(--ds-surface-sunken);
  border-radius: var(--theme-radius-md);
}

/* Overlay — modals, dialogs, popovers */
.ds-surface-overlay {
  background: var(--ds-surface-overlay);
  border: 1px solid var(--ds-border-subtle);
  border-radius: var(--theme-radius-xl);
  box-shadow: var(--ds-layer-overlay);
}

/* Brand — sage background panels */
.ds-surface-brand {
  background: var(--ds-surface-brand);
  color: var(--ds-text-inverse);
  border-radius: var(--theme-radius-lg);
}

.ds-surface-brand-subtle {
  background: var(--ds-surface-brand-subtle);
  border-radius: var(--theme-radius-lg);
}

/* Dark — hero sections, dark panels */
.ds-surface-dark {
  background: var(--ds-surface-dark);
  color: var(--ds-text-inverse);
  border-radius: var(--theme-radius-xl);
}

.ds-surface-darker {
  background: var(--ds-surface-darker);
  color: var(--ds-text-inverse);
  border-radius: var(--theme-radius-xl);
}


/* styles/recipes/type.css */
/* Display — hero-level headlines, Space Grotesk */
.ds-type-display-xl {
  font-family: var(--theme-font-display);
  font-size: var(--theme-font-size-6xl);
  font-weight: var(--theme-font-weight-bold);
  line-height: var(--theme-line-height-tight);
  letter-spacing: var(--theme-letter-spacing-tighter);
}

.ds-type-display-lg {
  font-family: var(--theme-font-display);
  font-size: var(--theme-font-size-5xl);
  font-weight: var(--theme-font-weight-bold);
  line-height: var(--theme-line-height-tight);
  letter-spacing: var(--theme-letter-spacing-tighter);
}

.ds-type-display-md {
  font-family: var(--theme-font-display);
  font-size: var(--theme-font-size-4xl);
  font-weight: var(--theme-font-weight-semibold);
  line-height: var(--theme-line-height-tight);
  letter-spacing: var(--theme-letter-spacing-tight);
}

/* Headings — section-level, Space Grotesk */
.ds-type-heading-xl {
  font-family: var(--theme-font-display);
  font-size: var(--theme-font-size-3xl);
  font-weight: var(--theme-font-weight-semibold);
  line-height: var(--theme-line-height-snug);
  letter-spacing: var(--theme-letter-spacing-tight);
}

.ds-type-heading-lg {
  font-family: var(--theme-font-display);
  font-size: var(--theme-font-size-2xl);
  font-weight: var(--theme-font-weight-semibold);
  line-height: var(--theme-line-height-snug);
  letter-spacing: var(--theme-letter-spacing-tight);
}

.ds-type-heading-md {
  font-family: var(--theme-font-display);
  font-size: var(--theme-font-size-xl);
  font-weight: var(--theme-font-weight-semibold);
  line-height: var(--theme-line-height-snug);
}

.ds-type-heading-sm {
  font-family: var(--theme-font-display);
  font-size: var(--theme-font-size-lg);
  font-weight: var(--theme-font-weight-medium);
  line-height: var(--theme-line-height-snug);
}

/* Body — Inter, everyday content */
.ds-type-body-lg {
  font-family: var(--theme-font-sans);
  font-size: var(--theme-font-size-lg);
  font-weight: var(--theme-font-weight-regular);
  line-height: var(--theme-line-height-relaxed);
}

.ds-type-body-md {
  font-family: var(--theme-font-sans);
  font-size: var(--theme-font-size-base);
  font-weight: var(--theme-font-weight-regular);
  line-height: var(--theme-line-height-normal);
}

.ds-type-body-sm {
  font-family: var(--theme-font-sans);
  font-size: var(--theme-font-size-sm);
  font-weight: var(--theme-font-weight-regular);
  line-height: var(--theme-line-height-normal);
}

/* Labels — small, uppercase, wide-tracked */
.ds-type-label-lg {
  font-family: var(--theme-font-sans);
  font-size: var(--theme-font-size-sm);
  font-weight: var(--theme-font-weight-medium);
  line-height: var(--theme-line-height-none);
  letter-spacing: var(--theme-letter-spacing-wider);
  text-transform: uppercase;
}

.ds-type-label-md {
  font-family: var(--theme-font-sans);
  font-size: var(--theme-font-size-xs);
  font-weight: var(--theme-font-weight-medium);
  line-height: var(--theme-line-height-none);
  letter-spacing: var(--theme-letter-spacing-wider);
  text-transform: uppercase;
}

/* Caption — small supporting text */
.ds-type-caption {
  font-family: var(--theme-font-sans);
  font-size: var(--theme-font-size-xs);
  font-weight: var(--theme-font-weight-regular);
  line-height: var(--theme-line-height-normal);
}

```

## Icon Style

This design system uses Phosphor icons.

## Font Configuration

- Inter: weights 300, 400, 500, 600, fallback: sans-serif
- Space Grotesk: weights 500, 600, 700, fallback: sans-serif