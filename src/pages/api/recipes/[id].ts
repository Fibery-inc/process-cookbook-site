import type { APIRoute } from 'astro';
import { getRecipe } from '../../../lib/catalog';

export const prerender = false;

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=60, s-maxage=300',
};

export const GET: APIRoute = ({ params, url }) => {
  const part = (url.searchParams.get('part') || 'all') as 'human' | 'build' | 'all';
  const r = getRecipe(params.id!, ['human', 'build', 'all'].includes(part) ? part : 'all');
  if (!r) return new Response(JSON.stringify({ error: `no recipe ${params.id}` }), { status: 404, headers });
  return new Response(JSON.stringify(r), { headers });
};
