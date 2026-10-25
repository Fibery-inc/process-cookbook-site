import type { APIRoute } from 'astro';
import { recipes } from '../../lib/recipes';

export function getStaticPaths() {
  return recipes.map((r) => ({ params: { id: r.id }, props: { recipe: r } }));
}

export const GET: APIRoute = ({ props }) => {
  const r = props.recipe;
  return new Response(r.markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Recipe-Id': r.id,
      'X-Recipe-Version': String(r.version),
      'Link': `<${r.github}>; rel="canonical-source"`,
    },
  });
};
