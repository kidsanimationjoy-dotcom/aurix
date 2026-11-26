import type { ResearchItem } from '../domain/types';

const LABEL = { verified: 'Verified', unverified: 'Unverified', assumption: 'Assumption' } as const;

/** Markdown report that keeps verified claims, unverified claims and assumptions in separate sections. */
export function researchToMarkdown(title: string, items: ResearchItem[]): string {
  const out = [`# ${title}`, ''];
  for (const status of ['verified', 'unverified', 'assumption'] as const) {
    const group = items.filter((i) => i.status === status);
    out.push(`## ${LABEL[status]} (${group.length})`, '');
    if (!group.length) out.push('_None._', '');
    for (const i of group) {
      out.push(`### ${i.title}`, '', i.claim, '');
      if (i.sourceUrl) out.push(`Source: [${i.sourceTitle || i.sourceUrl}](${i.sourceUrl})`, '');
      else out.push('Source: none recorded', '');
      if (i.notes) out.push(i.notes, '');
    }
  }
  return out.join('\n');
}
