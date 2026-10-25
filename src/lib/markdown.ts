import { marked } from 'marked';

// Mermaid blocks become <pre class="mermaid"> for the client-side renderer; everything else is plain Markdown.
const renderer = new marked.Renderer();
const baseCode = renderer.code.bind(renderer);
renderer.code = function (token) {
  if (token.lang === 'mermaid') {
    return `<pre class="mermaid">${escapeHtml(token.text)}</pre>`;
  }
  return baseCode(token);
};

marked.use({ renderer, gfm: true, breaks: false });

export function render(md: string) {
  return marked.parse(md) as string;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
