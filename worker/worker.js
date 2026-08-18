/**
 * Serveur L'Antre — Cloudflare Worker.
 *
 * Pourquoi un serveur : depuis un navigateur, une page ne peut interroger que
 * les sites qui l'y autorisent explicitement (CORS), et elle subit les blocages
 * du réseau de l'utilisateur. Un worker n'a ni l'une ni l'autre de ces limites.
 * Il permet donc :
 *   - d'atteindre Reddit même quand l'opérateur le bloque, avec un User-Agent
 *     correct (Reddit refuse les requêtes anonymes sans identification) ;
 *   - d'agréger des sources qui ne servent pas d'en-têtes CORS : flux RSS de
 *     forums, instances du fédivers ;
 *   - de normaliser tous les résultats dans un seul format.
 *
 * Ce qu'il ne fait pas, et ne fera pas : contourner une authentification.
 * FetLife, Instagram, Facebook et Happn restent hors de portée — leurs contenus
 * sont derrière un compte et leurs conditions interdisent l'accès automatisé.
 *
 * Points d'entrée :
 *   GET /api/search?q=…&city=…&lat=…&lng=…&radius=…&sources=reddit,mastodon,rss,places
 *   GET /api/health          — teste chaque source et dit laquelle répond
 *   GET /?url=…              — relais simple (compatibilité avec l'app)
 *
 * Déploiement : voir worker/README.md
 */

const UA = 'l-antre/1.0 (agrégateur personnel; contact via GitHub)';

/** Domaines relayables par /?url= — le worker n'est pas un proxy ouvert. */
const ALLOWED_HOSTS = [
  'www.reddit.com', 'old.reddit.com', 'api.reddit.com',
  'overpass-api.de', 'overpass.kumi.systems',
  'nominatim.openstreetmap.org'
];

/**
 * Instances du fédivers interrogées pour les hashtags publics.
 * Leur disponibilité varie : /api/health dit lesquelles répondent réellement.
 */
const FEDIVERSE_INSTANCES = [
  'mastodon.social',
  'piaille.fr',
  'mamot.fr',
  'kinky.business'
];

/**
 * Flux RSS de forums et petites annonces francophones.
 * Ces adresses changent avec le temps : /api/health signale les flux morts,
 * et cette liste est faite pour être modifiée.
 */
const RSS_FEEDS = [
  { id: 'reddit-libertinage', url: 'https://www.reddit.com/r/libertinage/new/.rss' },
  { id: 'reddit-r4r-fr', url: 'https://www.reddit.com/r/RencontresFrance/new/.rss' },
  { id: 'reddit-bdsm-fr', url: 'https://www.reddit.com/r/BDSMFrance/new/.rss' }
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type'
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'GET') return json({ error: 'Méthode non autorisée' }, 405);

    const url = new URL(request.url);

    try {
      if (url.pathname === '/api/search') return await handleSearch(url);
      if (url.pathname === '/api/health') return await handleHealth();
      if (url.searchParams.get('url')) return await handleProxy(url.searchParams.get('url'));
      return json({
        service: 'L\'Antre',
        endpoints: ['/api/search', '/api/health', '/?url=<url encodée>']
      }, 200);
    } catch (error) {
      return json({ error: error.message }, 500);
    }
  }
};

// =============================================
// Points d'entrée
// =============================================

/**
 * Recherche agrégée.
 * @param {URL} url
 * @returns {Promise<Response>}
 */
async function handleSearch(url) {
  const params = {
    q: (url.searchParams.get('q') || '').slice(0, 200),
    city: (url.searchParams.get('city') || '').slice(0, 80),
    lat: parseFloat(url.searchParams.get('lat')),
    lng: parseFloat(url.searchParams.get('lng')),
    radius: Math.min(parseInt(url.searchParams.get('radius'), 10) || 50, 200),
    limit: Math.min(parseInt(url.searchParams.get('limit'), 10) || 40, 100)
  };

  const wanted = (url.searchParams.get('sources') || 'reddit,mastodon,rss,places')
    .split(',').map(s => s.trim()).filter(Boolean);

  const adapters = {
    reddit: () => searchReddit(params),
    mastodon: () => searchFediverse(params),
    rss: () => searchRss(params),
    places: () => searchPlaces(params)
  };

  const active = wanted.filter(id => adapters[id]);
  const settled = await Promise.allSettled(active.map(id => withTimeout(adapters[id](), 12000)));

  const results = [];
  const sources = [];

  settled.forEach((outcome, index) => {
    const id = active[index];
    if (outcome.status === 'fulfilled') {
      results.push(...outcome.value);
      sources.push({ id, status: 'ok', count: outcome.value.length });
    } else {
      sources.push({ id, status: 'échec', detail: String(outcome.reason && outcome.reason.message) });
    }
  });

  return json({
    query: params.q,
    results: dedupe(results).slice(0, params.limit),
    sources
  }, 200, 120);
}

/**
 * Teste chaque source et rapporte ce qui répond réellement.
 * @returns {Promise<Response>}
 */
async function handleHealth() {
  const probe = async (label, run) => {
    const started = Date.now();
    try {
      const value = await withTimeout(run(), 10000);
      return { label, status: 'ok', count: value, ms: Date.now() - started };
    } catch (error) {
      return { label, status: 'échec', detail: error.message, ms: Date.now() - started };
    }
  };

  const checks = await Promise.all([
    probe('reddit', async () => (await searchReddit({ q: 'lyon bdsm', limit: 5 })).length),
    probe('places', async () => (await searchPlaces({ lat: 45.764, lng: 4.8357, radius: 50 })).length),
    ...FEDIVERSE_INSTANCES.map(host =>
      probe(`fediverse:${host}`, async () => (await fediverseTag(host, 'bdsm', 5)).length)),
    ...RSS_FEEDS.map(feed =>
      probe(`rss:${feed.id}`, async () => (await fetchFeed(feed)).length))
  ]);

  return json({ checks }, 200);
}

/**
 * Relais simple, conservé pour la compatibilité avec l'app.
 * @param {string} target
 * @returns {Promise<Response>}
 */
async function handleProxy(target) {
  let parsed;
  try {
    parsed = new URL(target);
  } catch (error) {
    return json({ error: 'URL invalide' }, 400);
  }

  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.includes(parsed.hostname)) {
    return json({ error: `Domaine non autorisé : ${parsed.hostname}` }, 403);
  }

  const upstream = await fetch(parsed.toString(), {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    cf: { cacheTtl: 60, cacheEverything: true }
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      ...CORS,
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      'Cache-Control': 'public, max-age=60'
    }
  });
}

// =============================================
// Adaptateurs de sources
// =============================================

/**
 * Annonces Reddit. Côté serveur, avec un User-Agent identifiable : c'est ce que
 * Reddit exige, et c'est ce qui manquait aux requêtes du navigateur.
 * @param {Object} params
 * @returns {Promise<Object[]>}
 */
async function searchReddit({ q, limit = 40 }) {
  if (!q) return [];

  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}`
    + `&sort=new&t=year&limit=${limit}&raw_json=1`;

  const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Reddit HTTP ${response.status}`);

  const payload = await response.json();
  const children = (payload.data && payload.data.children) || [];

  return children
    .map(child => child.data)
    .filter(post => post && !post.stickied)
    .map(post => ({
      source: 'reddit',
      platform: `Reddit · r/${post.subreddit}`,
      title: post.title || 'Sans titre',
      author: post.author ? `u/${post.author}` : null,
      text: (post.selftext || '').slice(0, 800),
      link: `https://www.reddit.com${post.permalink}`,
      outboundUrl: post.url && !post.is_self ? post.url : null,
      image: redditImage(post),
      date: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null
    }));
}

/**
 * Hashtags publics du fédivers (Mastodon et compatibles).
 * Ces instances servent leurs timelines publiques sans compte : c'est la seule
 * source de personnes réelles, en français, réellement ouverte.
 * @param {Object} params
 * @returns {Promise<Object[]>}
 */
async function searchFediverse({ city, q }) {
  const base = normalize(city || q).replace(/[^a-z0-9]/g, '');
  const tags = [base && `libertin${base}`, base && `bdsm${base}`, 'libertinage', 'bdsmfr']
    .filter(Boolean).slice(0, 3);

  const runs = [];
  FEDIVERSE_INSTANCES.forEach(host => tags.forEach(tag => runs.push(fediverseTag(host, tag, 10))));

  const settled = await Promise.allSettled(runs);
  return settled.filter(r => r.status === 'fulfilled').flatMap(r => r.value);
}

/**
 * Timeline publique d'un hashtag sur une instance donnée.
 * @param {string} host
 * @param {string} tag
 * @param {number} limit
 * @returns {Promise<Object[]>}
 */
async function fediverseTag(host, tag, limit) {
  const url = `https://${host}/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=${limit}`;
  const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${host} HTTP ${response.status}`);

  const posts = await response.json();
  if (!Array.isArray(posts)) throw new Error(`${host} : réponse inattendue`);

  return posts.map(post => ({
    source: 'mastodon',
    platform: `Fédivers · ${host}`,
    title: stripHtml(post.content).slice(0, 120) || 'Publication',
    author: post.account ? `@${post.account.acct}` : null,
    text: stripHtml(post.content).slice(0, 800),
    link: post.url || post.uri,
    image: (post.media_attachments || []).map(m => m.preview_url).find(Boolean) || null,
    date: post.created_at || null
  }));
}

/**
 * Flux RSS de forums et subreddits francophones.
 * @param {Object} params
 * @returns {Promise<Object[]>}
 */
async function searchRss({ q }) {
  const settled = await Promise.allSettled(RSS_FEEDS.map(feed => fetchFeed(feed)));
  const items = settled.filter(r => r.status === 'fulfilled').flatMap(r => r.value);

  const terms = normalize(q).split(/\s+/).filter(t => t.length > 2);
  if (!terms.length) return items;

  // Un flux n'accepte pas de requête : on filtre côté serveur.
  return items.filter(item => {
    const haystack = normalize(`${item.title} ${item.text}`);
    return terms.some(term => haystack.includes(term));
  });
}

/**
 * Télécharge et analyse un flux RSS ou Atom.
 * Les Workers n'ont pas de DOMParser : l'analyse se fait sur le texte.
 * @param {{id: string, url: string}} feed
 * @returns {Promise<Object[]>}
 */
async function fetchFeed(feed) {
  const response = await fetch(feed.url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' } });
  if (!response.ok) throw new Error(`${feed.id} HTTP ${response.status}`);

  const xml = await response.text();
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];

  return blocks.slice(0, 25).map(block => ({
    source: 'rss',
    platform: `Flux · ${feed.id}`,
    title: decodeXml(tag(block, 'title')) || 'Sans titre',
    author: decodeXml(tag(block, 'author') || tag(block, 'dc:creator')) || null,
    text: stripHtml(decodeXml(tag(block, 'description') || tag(block, 'content') || tag(block, 'summary'))).slice(0, 800),
    link: linkOf(block),
    image: null,
    date: normalizeDate(tag(block, 'pubDate') || tag(block, 'updated') || tag(block, 'published'))
  })).filter(item => item.link);
}

/**
 * Lieux réels autour d'un point (OpenStreetMap via Overpass).
 * @param {Object} params
 * @returns {Promise<Object[]>}
 */
async function searchPlaces({ lat, lng, radius = 50 }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const metres = Math.min(radius, 100) * 1000;
  const query = '[out:json][timeout:20];('
    + `nwr["amenity"="swingerclub"](around:${metres},${lat},${lng});`
    + `nwr["club"="swinger"](around:${metres},${lat},${lng});`
    + `nwr["leisure"="sauna"](around:${metres},${lat},${lng});`
    + `nwr["shop"="erotic"](around:${metres},${lat},${lng});`
    + ');out center 60;';

  const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
    { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);

  const payload = await response.json();
  return (payload.elements || [])
    .filter(element => element.tags && (element.tags.name || element.tags['addr:street']))
    .map(element => {
      const tags = element.tags;
      const elat = element.lat ?? (element.center && element.center.lat);
      const elng = element.lon ?? (element.center && element.center.lon);
      return {
        source: 'places',
        platform: 'Lieu · OpenStreetMap',
        title: tags.name || 'Lieu',
        author: null,
        text: [tags['addr:housenumber'], tags['addr:street'], tags['addr:postcode'], tags['addr:city']]
          .filter(Boolean).join(' '),
        link: tags.website || tags['contact:website']
          || `https://www.openstreetmap.org/${element.type}/${element.id}`,
        image: null,
        date: null,
        lat: elat,
        lng: elng,
        phone: tags.phone || tags['contact:phone'] || null,
        openingHours: tags.opening_hours || null
      };
    });
}

// =============================================
// Utilitaires
// =============================================

/**
 * Abandonne une promesse au-delà du délai imparti.
 * @param {Promise} promise
 * @param {number} ms
 * @returns {Promise}
 */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve, reject) => setTimeout(() => reject(new Error(`délai dépassé (${ms} ms)`)), ms))
  ]);
}

/**
 * Supprime les doublons de lien.
 * @param {Object[]} items
 * @returns {Object[]}
 */
function dedupe(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = (item.link || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Minuscules sans accents.
 * @param {string} text
 * @returns {string}
 */
function normalize(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Décode les entités courantes. `&amp;` est traité en dernier, sinon une entité
 * déjà décodée serait ré-interprétée.
 * @param {string} text
 * @returns {string}
 */
function decodeEntities(text) {
  return String(text || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/**
 * Retire les balises HTML d'un contenu et décode ses entités.
 *
 * Un flux RSS encode deux fois : le XML protège le HTML, qui protège lui-même
 * son texte. Décoder une seule couche laissait « &amp; » à l'écran.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  return decodeEntities(String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Contenu d'une balise XML dans un bloc.
 * @param {string} block
 * @param {string} name
 * @returns {string}
 */
function tag(block, name) {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? match[1].trim() : '';
}

/**
 * Lien d'un élément RSS ou Atom.
 * @param {string} block
 * @returns {string}
 */
function linkOf(block) {
  const rss = tag(block, 'link');
  if (rss && /^https?:/.test(rss)) return rss;

  const atom = block.match(/<link[^>]*href="([^"]+)"/i);
  return atom ? atom[1] : '';
}

/**
 * Décode les entités XML courantes et les sections CDATA.
 * @param {string} text
 * @returns {string}
 */
function decodeXml(text) {
  return decodeEntities(String(text || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim();
}

/**
 * Convertit une date de flux en ISO.
 * @param {string} value
 * @returns {string|null}
 */
function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Meilleure image d'un post Reddit.
 * @param {Object} post
 * @returns {string|null}
 */
function redditImage(post) {
  const preview = post.preview && post.preview.images && post.preview.images[0];
  if (preview && preview.source && /^https?:/.test(preview.source.url)) return preview.source.url;
  if (post.thumbnail && /^https?:\/\//.test(post.thumbnail)) return post.thumbnail;
  return null;
}

/**
 * Réponse JSON avec CORS.
 * @param {Object} body
 * @param {number} status
 * @param {number} [maxAge] - Durée de cache en secondes.
 * @returns {Response}
 */
function json(body, status, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-store'
    }
  });
}

// Export pour les tests hors Cloudflare.
export { searchReddit, searchFediverse, searchRss, searchPlaces, fetchFeed, fediverseTag,
  stripHtml, decodeXml, tag, linkOf, dedupe, normalizeDate };
