// Search by meaning: the query is embedded with the model the build used for the recipes and compared with each of them.
// Server only: it needs OPENAI_API_KEY. Anything that fails returns null and the caller falls back to words.
import vectorsJson from '../data/vectors.json';

const data = vectorsJson as { model: string | null; dimensions: number; vectors: Record<string, string> };

// Calibrated on 30 queries in people's words (English, German, Spanish, Portuguese, French, Russian, Greek) and 25 processes
// the cookbook doesn't have: the right recipe ranked first for all 30. A score of 0.38, or 0.30 that leads the runner-up by 0.14,
// fit all 30; it also fit 4 of the 25, each a near neighbour (book club and film club, football and rugby club).
export const FIT_SCORE = 0.38;
export const FIT_LOW_SCORE = 0.3;
export const FIT_LEAD = 0.14;
// Below this a recipe is not shown at all for its meaning.
export const FLOOR = 0.25;

const MAX_QUERY_CHARS = 500;
const TIMEOUT_MS = 2500;
const CACHE_SIZE = 500;

const decode = (b64: string) => {
  const buf = Buffer.from(b64, 'base64');
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
};
const recipeVectors = Object.entries(data.vectors).map(([id, b64]) => ({ id, v: decode(b64) }));
const cache = new Map<string, Float32Array>();

export const semanticAvailable = () => !!data.model && recipeVectors.length > 0 && !!process.env.OPENAI_API_KEY;

async function embedQuery(query: string): Promise<Float32Array | null> {
  const text = query.slice(0, MAX_QUERY_CHARS);
  const hit = cache.get(text);
  if (hit) {
    cache.delete(text);
    cache.set(text, hit);
    return hit;
  }
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: data.model, input: text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const v = Float32Array.from((await res.json()).data[0].embedding as number[]);
    cache.set(text, v);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
    return v;
  } catch (e) {
    console.warn(`semantic search: ${(e as Error).message}; words only`);
    return null;
  }
}

function cosine(a: Float32Array, b: Float32Array) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / Math.sqrt(na * nb);
}

export type Scored = { id: string; similarity: number };

// Every recipe with its similarity to the query, best first; null when search by meaning is off or failed.
export async function scoreByMeaning(query: string): Promise<Scored[] | null> {
  if (!semanticAvailable()) return null;
  const q = await embedQuery(query);
  if (!q) return null;
  return recipeVectors.map(({ id, v }) => ({ id, similarity: cosine(q, v) })).sort((a, b) => b.similarity - a.similarity);
}

export function fitsByMeaning(scored: Scored[]) {
  const [top, next] = scored;
  if (!top) return false;
  const lead = top.similarity - (next?.similarity ?? 0);
  return top.similarity >= FIT_SCORE || (top.similarity >= FIT_LOW_SCORE && lead >= FIT_LEAD);
}
