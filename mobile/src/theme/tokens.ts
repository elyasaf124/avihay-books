/**
 * Design tokens synced from Stitch export «Literary Operations Interface»
 * (folder `literary_operations_interface/DESIGN.md` + embedded Tailwind themes in `code.html`).
 *
 * Typography names follow the export (`display-lg`, `headline-md`, …).
 * RN uses a slightly smaller display size on phones (matches Stitch mobile note: 28px).
 *
 * Fonts in export: Hanken Grotesk, Inter, JetBrains Mono. Until those are wired through
 * `expo-font`, the OS uses fallback faces; Hebrew remains legible via default RTL stacking.
 */

export const colors = {
  background: "#f8f9ff",
  onBackground: "#0b1c30",
  surface: "#f8f9ff",
  surfaceDim: "#cbdbf5",
  surfaceBright: "#f8f9ff",
  surfaceContainerLowest: "#ffffff",
  surfaceContainerLow: "#eff4ff",
  surfaceContainer: "#e5eeff",
  surfaceContainerHigh: "#dce9ff",
  surfaceContainerHighest: "#d3e4fe",
  surfaceVariant: "#d3e4fe",
  surfaceTint: "#4059aa",
  onSurface: "#0b1c30",
  onSurfaceVariant: "#444651",
  inverseSurface: "#213145",
  inverseOnSurface: "#eaf1ff",
  outline: "#757682",
  outlineVariant: "#c5c5d3",

  primary: "#00236f",
  onPrimary: "#ffffff",
  primaryContainer: "#1e3a8a",
  onPrimaryContainer: "#90a8ff",
  primaryFixed: "#dce1ff",
  primaryFixedDim: "#b6c4ff",
  onPrimaryFixed: "#00164e",
  onPrimaryFixedVariant: "#264191",
  inversePrimary: "#b6c4ff",

  secondary: "#006a61",
  onSecondary: "#ffffff",
  secondaryContainer: "#86f2e4",
  onSecondaryContainer: "#006f66",
  secondaryFixed: "#89f5e7",
  secondaryFixedDim: "#6bd8cb",
  onSecondaryFixed: "#00201d",
  onSecondaryFixedVariant: "#005049",

  tertiary: "#442100",
  onTertiary: "#ffffff",
  tertiaryContainer: "#653400",
  onTertiaryContainer: "#fc922b",
  tertiaryFixed: "#ffdcc3",
  tertiaryFixedDim: "#ffb77d",
  onTertiaryFixed: "#2f1500",
  onTertiaryFixedVariant: "#6e3900",

  error: "#ba1a1a",
  onError: "#ffffff",
  errorContainer: "#ffdad6",
  onErrorContainer: "#93000a",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  shelfGap: 32,
  marginMobile: 16,
  gutter: 20,
} as const;

/** Maps `rounded.*` from the Stitch YAML (approx. px equivalents). */
export const radius = {
  none: 0,
  sm: 2,
  md: 4,
  lg: 8,
  xl: 12,
  /** Tailwind «full» in export is pill radii (~12); use numeric full for capsules. */
  full: 9999,
} as const;

/**
 * `fontFamily` ערכים תואמים למפתחות שאנו רושמים בטעינת `expo-font` (ראה `app/_layout.tsx`).
 * השמות נטענים רק כאשר `useFonts` החזיר `true`; עד אז `React Native` נופל לגופן מערכת ברירת המחדל.
 */
export const fontFamily = {
  regular: "Heebo-Regular",
  semibold: "Heebo-SemiBold",
  bold: "Heebo-Bold",
} as const;

export const typography = {
  display: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700" as const,
    letterSpacing: -0.56,
    fontFamily: fontFamily.bold,
  },
  headlineMd: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600" as const,
    letterSpacing: -0.24,
    fontFamily: fontFamily.semibold,
  },
  headlineSm: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600" as const,
    fontFamily: fontFamily.semibold,
  },
  bodyLg: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
    fontFamily: fontFamily.regular,
  },
  bodyMd: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "400" as const,
    fontFamily: fontFamily.regular,
  },
  labelMd: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600" as const,
    letterSpacing: 0.6,
    fontFamily: fontFamily.semibold,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400" as const,
    fontFamily: fontFamily.regular,
  },
  monoSm: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400" as const,
    fontFamily: fontFamily.regular,
  },
} as const;

export const shadow = {
  paper: {},
  /** Form fields / recessed controls — toned outline. */
  inset: {
    shadowColor: "#1e3a8a",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  /** L2 elevation from DESIGN.md — blue-tinted ambient. */
  floating: {
    shadowColor: "#1e3a8a",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  modal: {
    shadowColor: "#213145",
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
} as const;

export type AppColors = typeof colors;
export type AppSpacing = typeof spacing;
export type AppRadius = typeof radius;
export type AppTypography = typeof typography;
export type AppFontFamily = typeof fontFamily;
