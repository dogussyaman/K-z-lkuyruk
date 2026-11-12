/** Display-only normalization for the anonymous guessing stage.
 * Turkish dotted/dotless I must use tr-TR locale. Do not mutate the original
 * choice text or indexes, because they are used in the authoritative scoring.
 */
export function displayGuessChoice(text: string): string {
  return text.toLocaleLowerCase('tr-TR');
}
