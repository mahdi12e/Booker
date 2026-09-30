/** Builds a short preview. Poems keep their line breaks; prose is collapsed to a paragraph. */
export function makeExcerpt(type: string, head: string): string {
  if (type === 'poem') {
    const kept = head.split('\n').slice(0, 8).join('\n').slice(0, 420);
    return kept.length < head.length ? `${kept.trimEnd()} …` : kept;
  }
  const flat = head.replace(/\s+/g, ' ').trim();
  if (flat.length <= 280) return flat + (head.length >= 1500 ? ' …' : '');
  const cut = flat.slice(0, 280);
  const space = cut.lastIndexOf(' ');
  return `${(space > 200 ? cut.slice(0, space) : cut).trimEnd()} …`;
}
