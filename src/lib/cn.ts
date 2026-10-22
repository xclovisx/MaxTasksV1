export function cn(...klassen: (string | false | null | undefined)[]): string {
  return klassen.filter(Boolean).join(' ');
}
