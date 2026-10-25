import type { APIRoute } from 'astro';
import { recipes, domains, domainLabel, FOR_LABELS } from '../lib/recipes';

export const GET: APIRoute = ({ site }) => {
  const base = (site?.toString() || 'https://processcookbook.org').replace(/\/$/, '');
  const lines = [
    '# Process Cookbook',
    '',
    '> An open, CC BY 4.0 library of how companies, teams and communities run things. Each recipe is one Markdown file: the process in plain words, the model to build it in the tool you use, and the sources it was written from.',
    '',
    `Search for agents: MCP at ${base}/mcp (tools find_recipes, get_recipe, list_domains); REST at ${base}/api/search?q=…`,
    '',
  ];
  for (const d of domains()) {
    lines.push(`## ${domainLabel(d)}`, '');
    for (const r of recipes.filter((x) => x.domain === d)) {
      lines.push(`- [${r.title}](${base}/r/${r.id}.md): ${r.summary} (${FOR_LABELS[r.for] || r.for}, version ${r.version})`);
    }
    lines.push('');
  }
  lines.push('## Optional', '', `- [The recipe format](https://github.com/Fibery-inc/process-cookbook/blob/main/FORMAT.md)`, `- [Source repository](https://github.com/Fibery-inc/process-cookbook)`, '');
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
