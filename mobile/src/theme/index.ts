import { colors, fontFamily, radius, shadow, spacing, typography } from "./tokens";

export const theme = {
  colors,
  spacing,
  radius,
  typography,
  shadow,
  fontFamily,
};

export type Theme = typeof theme;

export const useTheme = (): Theme => theme;
