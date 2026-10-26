import { render as renderMarkdown, renderInline as renderMarkdownInline } from './markdown';

// Each word (a kind of record) gets one of eight colors, in the order its database appears in Details for
// building; the colors themselves are the .w0 to .w7 classes in global.css.
const TERM_COLORS = 8;

type Word = { name: string; definition: string };
export type Terms = ReturnType<typeof wordTerms>;

const IRREGULAR: Record<string, string> = { person: 'people', child: 'children' };

const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, ' ').trim();
const decode = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescapeHtml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "Colonies" names a Colony, "Clinic days" a Clinic day, "Batches" a Batch.
function forms(name: string) {
  const n = norm(name);
  const last = n.split(' ').pop() || n;
  const out = [n, `${n}s`];
  if (/(s|x|z|ch|sh)$/.test(n)) out.push(`${n}es`);
  if (/[^aeiou]y$/.test(n)) out.push(`${n.slice(0, -1)}ies`);
  if (IRREGULAR[last]) out.push(n.slice(0, n.length - last.length) + IRREGULAR[last]);
  return out;
}

const ENTITY = /^([A-Za-z_][\w-]*)(?:\[\s*"?([^"\]]*?)"?\s*\])?$/;

// Mermaid's classDef takes no CSS variables, so the diagram only gets "class Colony w0" lines,
// and global.css colors the boxes those classes mark.
function tagEntities(src: string, colorOf: (name: string) => number | undefined) {
  if (!/^\s*erDiagram\b/.test(src)) return src;
  const tagged = new Map<string, number>();
  let inBlock = false;
  for (const line of src.split('\n').slice(1)) {
    const t = line.trim();
    if (inBlock) {
      if (t.startsWith('}')) inBlock = false;
      continue;
    }
    if (!t || /^(%%|classDef\b|class\b|style\b|direction\b|title\b|acc)/i.test(t)) continue;
    const head = t.split(':')[0].trim();
    if (head.endsWith('{')) inBlock = true;
    const tokens = head.replace(/\s*\{$/, '').split(/\s+/).filter(Boolean);
    for (const token of tokens.length > 1 ? [tokens[0], tokens[tokens.length - 1]] : tokens) {
      const m = token.match(ENTITY);
      if (!m || tagged.has(m[1])) continue;
      const c = colorOf(m[2] || m[1]);
      if (c !== undefined) tagged.set(m[1], c);
    }
  }
  if (!tagged.size) return src;
  return `${src.replace(/\s+$/, '')}\n${[...tagged].map(([id, c]) => `    class ${id} w${c}`).join('\n')}`;
}

export function wordTerms(words: Word[] | null | undefined) {
  const list = (words ?? []).map((w, i) => ({ ...w, color: i % TERM_COLORS }));
  const colors = new Map<string, number>();
  for (const w of list) for (const f of forms(w.name)) if (!colors.has(f)) colors.set(f, w.color);
  const colorOf = (text: string) => colors.get(norm(decode(text).replace(/[\s:.,;!?]+$/, '')));
  const cls = (c: number) => `term w${c}`;
  // Longest first, so "Strat run" is matched before "Strat".
  const names = [...colors.keys()].sort((a, b) => b.length - a.length).map((f) => escapeRe(f).replace(/ /g, '[\\s-]+'));
  const relation = names.length ? new RegExp(`(relation\\b[^<→;.]{0,40}→\\s*)(${names.join('|')})(?![\\w-])`, 'gi') : null;

  // On rendered HTML, so a section shown as plain Markdown gets it too: bold words, ### database headings,
  // the kind a relation points to, and the diagram's boxes.
  function color(html: string) {
    if (!relation) return html;
    return html
      .replace(/<strong>([^<]+)<\/strong>/g, (m, text) => {
        const c = colorOf(text);
        return c === undefined ? m : `<strong class="${cls(c)}">${text}</strong>`;
      })
      .replace(/<h3>([^<]+)<\/h3>/g, (m, text) => {
        const c = colorOf(text);
        return c === undefined ? m : `<h3><span class="${cls(c)}">${text}</span></h3>`;
      })
      .replace(relation, (m, before, name) => {
        const c = colorOf(name);
        return c === undefined ? m : `${before}<span class="${cls(c)}">${name}</span>`;
      })
      .replace(/<pre class="mermaid">([\s\S]*?)<\/pre>/g, (_, src) => `<pre class="mermaid">${escapeHtml(tagEntities(unescapeHtml(src), colorOf))}</pre>`);
  }

  return {
    words: list,
    render: (md: string) => color(renderMarkdown(md)),
    renderInline: (md: string) => color(renderMarkdownInline(md)),
    strong: (md: string) => color(`<strong>${renderMarkdownInline(md)}</strong>`),
  };
}
