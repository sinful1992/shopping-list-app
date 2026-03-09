export function parseCombinedInput(text: string): { value: number; unit: string } | null {
  const match = text.trim().match(/^(\d+\.?\d*)\s*(ml|l|g|kg)$/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase() === 'l' ? 'L' : match[2].toLowerCase();
  return { value, unit };
}
