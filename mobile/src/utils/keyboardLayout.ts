export function keyboardAwareMaxHeight(
  windowH: number,
  keyboardHeight: number,
  reservedAbove: number,
  reservedBelow: number,
  { max = 280, min = 120 }: { max?: number; min?: number } = {},
): number {
  const available = windowH - keyboardHeight - reservedAbove - reservedBelow;
  return Math.max(min, Math.min(max, available));
}
