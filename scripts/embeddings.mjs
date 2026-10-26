// One embedding per recipe, over what it says it is. The site uses them twice: related recipes at build time, and
// search by meaning at request time (src/lib/semantic.ts embeds the query with the same model and compares).
// Without OPENAI_API_KEY, or when the API fails, there are no vectors: related recipes are hidden and search matches words only.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-large';
const RELATED_MIN_SIMILARITY = Number(process.env.RELATED_MIN_SIMILARITY || 0.4);
const RELATED_MAX = 3;

// Promise and body text share the language of every process and pull all scores together.
// Calibrated with text-embedding-3-large: made-up close pairs (Scrum and Shape Up, football and rugby club) scored 0.40 to 0.69,
// the unrelated pairs among the first 13 recipes 0.39 at most.
const embedText = (r) => `${r.title}. ${r.summary}${r.keywords.length ? ` Keywords: ${r.keywords.join(', ')}.` : ''}`;

async function embed(texts, key) {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / Math.sqrt(na * nb);
};

// Returns one vector per recipe, or null when there is no key or the API failed.
export async function embedRecipes(recipes, cachePath) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.warn('embeddings: no OPENAI_API_KEY; no related recipes, search by words only');
    return null;
  }
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  const hashes = recipes.map((r) => createHash('sha256').update(`${MODEL}\n${embedText(r)}`).digest('hex'));
  const missing = recipes.map((r, i) => i).filter((i) => !cache[hashes[i]]);
  try {
    if (missing.length) {
      const vectors = await embed(missing.map((i) => embedText(recipes[i])), key);
      missing.forEach((i, k) => (cache[hashes[i]] = vectors[k]));
      mkdirSync(dirname(cachePath), { recursive: true });
      writeFileSync(cachePath, JSON.stringify(Object.fromEntries(hashes.map((h) => [h, cache[h]]))));
    }
  } catch (e) {
    console.warn(`embeddings: ${e.message}; no related recipes, search by words only`);
    return null;
  }
  return hashes.map((h) => cache[h]);
}

export function addRelated(recipes, vectors) {
  recipes.forEach((r, i) => {
    if (!vectors) return void (r.related = []);
    const scored = recipes
      .map((x, j) => ({ id: x.id, score: j === i ? -1 : cosine(vectors[i], vectors[j]) }))
      .sort((a, b) => b.score - a.score);
    r.related = scored.filter((x) => x.score >= RELATED_MIN_SIMILARITY).slice(0, RELATED_MAX).map((x) => x.id);
    if (process.env.RELATED_DEBUG) console.log(`related ${r.id}: ${scored.slice(0, 4).map((x) => `${x.id} ${x.score.toFixed(2)}`).join(' | ')}`);
  });
}

// Float32 as base64 keeps the server bundle small: about 16 KB per recipe at 3072 dimensions.
export function vectorsFile(recipes, vectors) {
  if (!vectors) return { model: null, dimensions: 0, vectors: {} };
  const encode = (v) => Buffer.from(new Float32Array(v).buffer).toString('base64');
  return { model: MODEL, dimensions: vectors[0].length, vectors: Object.fromEntries(recipes.map((r, i) => [r.id, encode(vectors[i])])) };
}
