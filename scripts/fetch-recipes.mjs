// Pulls the Process Cookbook repo and turns every recipe into JSON the site and the endpoint read.
// Output: src/data/recipes.json (everything), public/search-index.json (what search needs), src/data/meta.json.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import matter from 'gray-matter';

const REPO = process.env.COOKBOOK_REPO || 'https://github.com/Fibery-inc/process-cookbook.git';
const REF = process.env.COOKBOOK_REF || 'main';
const LOCAL = process.env.COOKBOOK_DIR; // a local clone, for offline work
const ROOT = resolve(new URL('..', import.meta.url).pathname);
const WORK = join(ROOT, '.cookbook');
const SECTION_ORDER = [
  'The idea',
  'How it runs',
  'What people look at',
  'The rules',
  'What must stay true',
  'Making it yours',
  'Details for building',
  'Sources',
  'Build it',
];
const HUMAN = SECTION_ORDER.slice(0, 6);

function sh(cmd, cwd) {
  return execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
}

function checkout() {
  if (LOCAL) return resolve(LOCAL);
  if (existsSync(WORK)) rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  // blob:none keeps the clone small but leaves history, so per-file dates come from git log.
  sh(`git clone --quiet --filter=blob:none --branch ${REF} ${REPO} repo`, WORK);
  return join(WORK, 'repo');
}

function splitSections(body) {
  const lines = body.split('\n');
  const sections = {};
  let title = '';
  let lead = [];
  let current = null;
  let footer = [];
  let inFooter = false;
  for (const line of lines) {
    if (!title && line.startsWith('# ')) {
      title = line.slice(2).trim();
      continue;
    }
    if (line.startsWith('## ')) {
      current = line.slice(3).trim();
      sections[current] = [];
      continue;
    }
    if (current === 'Build it' && line.trim() === '---') {
      inFooter = true;
      current = null;
      continue;
    }
    if (inFooter) footer.push(line);
    else if (current) sections[current].push(line);
    else lead.push(line);
  }
  for (const k of Object.keys(sections)) sections[k] = sections[k].join('\n').trim();
  const leadText = lead.join('\n').trim();
  const paragraphs = leadText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const italic = paragraphs.find((p) => p.startsWith('*') && !p.startsWith('**')) || '';
  const promise = paragraphs.find((p) => p.startsWith('**')) || '';
  return { title, italic, promise, sections, footer: footer.join('\n').trim() };
}

function plain(md) {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/[#*_>`]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function fileDate(repo, path) {
  try {
    return sh(`git log -1 --format=%cs -- "${path}"`, repo) || null;
  } catch {
    return null;
  }
}

const repo = checkout();
const commit = sh('git rev-parse HEAD', repo);
const recipesDir = join(repo, 'recipes');
const recipes = [];
for (const domain of readdirSync(recipesDir).sort()) {
  const dir = join(recipesDir, domain);
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.md') || file === 'README.md') continue;
    const path = `recipes/${domain}/${file}`;
    const src = readFileSync(join(dir, file), 'utf8');
    const { data, content } = matter(src);
    const parsed = splitSections(content);
    const id = file.replace(/\.md$/, '');
    const humanText = HUMAN.map((h) => parsed.sections[h] || '').join('\n');
    recipes.push({
      id,
      title: data.title || parsed.title || id,
      summary: data.summary || '',
      domain: data.domain || domain,
      for: data.for || '',
      keywords: data.keywords || [],
      version: data.version || 1,
      license: data.license || 'CC-BY-4.0',
      path,
      raw: `https://raw.githubusercontent.com/Fibery-inc/process-cookbook/${REF}/${path}`,
      github: `https://github.com/Fibery-inc/process-cookbook/blob/${REF}/${path}`,
      updated: fileDate(repo, path),
      promise: parsed.promise,
      italic: parsed.italic,
      sections: parsed.sections,
      footer: parsed.footer,
      markdown: src,
      text: plain(humanText),
    });
  }
}

const domains = {};
for (const r of recipes) domains[r.domain] = (domains[r.domain] || 0) + 1;

// Requested recipes are GitHub issues labelled "recipe request"; 👍 reactions are the votes.
async function fetchRequests() {
  const url = 'https://api.github.com/repos/Fibery-inc/process-cookbook/issues?labels=recipe%20request&state=open&per_page=30';
  try {
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'process-cookbook-site' } });
    if (!res.ok) throw new Error(`${res.status}`);
    const issues = await res.json();
    return issues
      .filter((i) => !i.pull_request)
      .map((i) => ({
        number: i.number,
        title: i.title.replace(/^recipe request:\s*/i, ''),
        url: i.html_url,
        votes: (i.reactions && i.reactions['+1']) || 0,
        created: i.created_at.slice(0, 10),
        body: (i.body || '').split('\n').find((l) => l.trim()) || '',
      }))
      .sort((a, b) => b.votes - a.votes || (a.created < b.created ? 1 : -1));
  } catch (e) {
    console.warn(`requests: ${e.message}; keeping an empty list`);
    return [];
  }
}
const requests = await fetchRequests();
writeFileSync(join(ROOT, 'src/data/requests.json'), JSON.stringify(requests, null, 1));

mkdirSync(join(ROOT, 'src/data'), { recursive: true });
mkdirSync(join(ROOT, 'public'), { recursive: true });
writeFileSync(join(ROOT, 'src/data/recipes.json'), JSON.stringify(recipes, null, 1));
writeFileSync(
  join(ROOT, 'public/search-index.json'),
  JSON.stringify(
    recipes.map(({ id, title, summary, domain, for: f, keywords, version, promise, text, updated }) => ({
      id, title, summary, domain, for: f, keywords, version, promise: plain(promise), text, updated,
    })),
  ),
);
writeFileSync(
  join(ROOT, 'src/data/meta.json'),
  JSON.stringify({ commit, ref: REF, fetchedAt: new Date().toISOString(), domains, count: recipes.length }, null, 1),
);
console.log(`${recipes.length} recipes from ${REF} @ ${commit.slice(0, 7)}; domains: ${Object.keys(domains).join(', ')}`);
