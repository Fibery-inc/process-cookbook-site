import MiniSearch from 'minisearch';

export type SearchDoc = {
  id: string;
  title: string;
  summary: string;
  domain: string;
  for: string;
  keywords: string[];
  version: number;
  promise: string;
  text: string;
  updated: string | null;
};

export type Hit = {
  id: string;
  title: string;
  summary: string;
  domain: string;
  for: string;
  version: number;
  updated: string | null;
  score?: number;
  terms?: string[];
};

export type SearchOpts = { domain?: string; for?: string; limit?: number; debug?: boolean };

export type SearchResult = {
  hits: Hit[];
  mode: 'and' | 'or' | 'none';
  // Share of the query's content words found anywhere in the best hit, and in its header fields only.
  coverage: number;
  headerCoverage: number;
  // The best hit fits when most of the words were found and at least half of them in what the recipe says it is.
  fits: boolean;
  words: string[];
};

const HEADER_FIELDS = ['title', 'keywords', 'summary', 'promise'];

// Function words and the small talk around a process ("how do we run our ..."). Neither indexed nor searched nor counted.
export const STOPWORDS = new Set(
  (
    'a an the and or of for to in on at by with from as into over under about than then there here where when why if but because so ' +
    'is are was were be been being am do does did done have has had having can could should would will may might must shall ' +
    'it its this that these those they them their there i me my mine we us our ours you your yours he him his she her hers one ones ' +
    'what which who whom whose how not no yes also just only very more most much many some any all each every both few other same such own new ' +
    'want wants wanted need needs needed like likes help please get got make making use using used set setup up run runs running ' +
    'something thing things way ways kind sort tool tools process processes system systems'
  ).split(' '),
);

// Lower-case, drop stopwords and single characters, fold plain plurals so "cats" finds "cat" without fuzzy matching.
export function processTerm(term: string): string | null {
  const t = term.toLowerCase();
  if (t.length < 2 || STOPWORDS.has(t)) return null;
  if (t.length >= 5 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length >= 4 && t.endsWith('s') && !/(ss|us|is)$/.test(t)) return t.slice(0, -1);
  return t;
}

export const tokenize = (text: string) => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export function contentWords(query: string) {
  return tokenize(query).map(processTerm).filter((t): t is string => t !== null);
}

export const SEARCH_OPTIONS = {
  // The header fields describe what a recipe is for; the body (text) only says how it runs.
  boost: { title: 5, keywords: 4, summary: 3, promise: 2 },
  // Short words are too easy to hit by accident: "app" stays "app", "shop" may become "shopping".
  prefix: (term: string) => term.length >= 4,
  fuzzy: (term: string) => (term.length >= 5 ? 1 : false),
  combineWith: 'AND' as const,
};

export function makeIndex(docs: SearchDoc[]) {
  const index = new MiniSearch<SearchDoc>({
    fields: ['title', 'keywords', 'summary', 'promise', 'text'],
    storeFields: ['id', 'title', 'summary', 'domain', 'for', 'version', 'updated'],
    tokenize,
    processTerm,
    searchOptions: SEARCH_OPTIONS,
    extractField: (doc, field) => {
      const v = (doc as any)[field];
      return Array.isArray(v) ? v.join(' ') : v;
    },
  });
  index.addAll(docs);
  return index;
}

export function searchDetailed(index: MiniSearch<SearchDoc>, query: string, opts: SearchOpts = {}): SearchResult {
  const words = contentWords(query);
  if (words.length === 0) return { hits: [], mode: 'none', coverage: 0, headerCoverage: 0, fits: false, words };
  let mode: SearchResult['mode'] = 'and';
  let results = index.search(query);
  if (results.length === 0) {
    mode = 'or';
    results = index.search(query, { combineWith: 'OR' });
  }
  if (results.length === 0) mode = 'none';
  const hits = toHits(results, opts);
  const top = hits[0];
  const share = (found: Set<string>) => Math.round((words.filter((w) => found.has(w)).length / words.length) * 100) / 100;
  const coverage = share(new Set<string>(top ? queryTermsOf(results, top.id) : []));
  const inHeader = top ? queryTermsOf(index.search(query, { combineWith: 'OR', fields: HEADER_FIELDS }), top.id) : [];
  const headerCoverage = share(new Set<string>(inHeader));
  // A long query in someone's own words matches its recipe on a few header words and many body words;
  // then the best hit is accepted when it leaves the runner-up far behind.
  const runnerUp = top ? results[results.findIndex((r) => r.id === top.id) + 1] : undefined;
  const dominant = !runnerUp || (top?.score || 0) >= 3 * runnerUp.score;
  const fits = !!top && coverage >= 0.67 && headerCoverage > 0 && (headerCoverage >= 0.5 || dominant);
  return { hits, mode, coverage, headerCoverage, fits, words };
}

function queryTermsOf(results: any[], id: string): string[] {
  return results.find((r) => r.id === id)?.queryTerms || [];
}

export function search(index: MiniSearch<SearchDoc>, query: string, opts: SearchOpts = {}): Hit[] {
  return searchDetailed(index, query, opts).hits;
}

function toHits(results: any[], opts: SearchOpts): Hit[] {
  return results
    .filter((r) => (!opts.domain || r.domain === opts.domain) && (!opts.for || r.for === opts.for))
    .slice(0, opts.limit || 10)
    .map((r) => ({
      id: r.id,
      title: r.title,
      summary: r.summary,
      domain: r.domain,
      for: r.for,
      version: r.version,
      updated: r.updated,
      score: Math.round(r.score * 10) / 10,
      ...(opts.debug ? { terms: r.terms } : {}),
    }));
}
