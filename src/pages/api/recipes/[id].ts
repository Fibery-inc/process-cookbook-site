import type { APIRoute } from 'astro';
import { getRecipe, PARTS, type Part } from '../../../lib/catalog';

export const prerender = false;

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=60, s-maxage=300',
};

export const GET: APIRoute = ({ params, url }) => {
  const part = (url.searchParams.get('part') || 'all') as Part;
  if (!PARTS.includes(part)) return new Response(JSON.stringify({ error: `unknown part "${part}"; use human, model or all (to build, all)` }), { status: 400, headers });
  const r = getRecipe(params.id!, part);
  if (!r) return new Response(JSON.stringify({ error: `no recipe ${params.id}` }), { status: 404, headers });
  return new Response(JSON.stringify(r), { headers });
};
