// Utilitaires partagés de L'Antre (échappement, texte, dates)
// Chargé en premier : tous les autres scripts en dépendent.

/**
 * Échappe une chaîne destinée à être injectée dans du HTML.
 * Indispensable : les titres et textes viennent de contenus tiers (Reddit),
 * donc de sources non fiables.
 * @param {*} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * N'autorise que les URL http(s). Bloque javascript:, data:, etc.
 * @param {string} url
 * @returns {string} - L'URL échappée, ou '#' si elle est invalide.
 */
function safeUrl(url) {
  if (!url) return '#';
  try {
    const parsed = new URL(String(url), window.location.href);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '#';
    return escapeHtml(parsed.href);
  } catch (error) {
    return '#';
  }
}

/**
 * Retire les accents et passe en minuscules (comparaisons de texte).
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Cherche un terme dans un texte en respectant les limites de mots.
 * Évite que « anal » matche « analyse » ou « pro » matche « propose ».
 * @param {string} haystack
 * @param {string} term
 * @returns {boolean}
 */
function containsTerm(haystack, term) {
  const text = normalizeText(haystack);
  const needle = normalizeText(term).trim();
  if (!text || !needle) return false;

  // Les symboles (€, $) n'ont pas de limite de mot exploitable.
  if (!/[a-z0-9]/.test(needle)) return text.includes(needle);

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

/**
 * Tente d'extraire un âge d'un texte d'annonce.
 * Formats reconnus : « 25 ans », « [25F] », « F25 », « 25M ».
 * @param {string} text
 * @returns {number|null}
 */
function extractAge(text) {
  const source = normalizeText(text);
  const patterns = [
    /(\d{2})\s*ans\b/,
    /\[(\d{2})\s*[fmhtc]\]/,
    /\b(\d{2})\s*[fmh]\b/,
    /\b[fmh]\s*(\d{2})\b/
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) {
      const age = parseInt(match[1], 10);
      if (age >= 18 && age <= 99) return age;
    }
  }
  return null;
}

/**
 * Identifiant stable dérivé d'une chaîne (déduplication, clés DOM).
 * @param {string} text
 * @returns {string}
 */
function hashId(text) {
  let hash = 5381;
  const source = String(text || '');
  for (let i = 0; i < source.length; i++) {
    hash = ((hash << 5) + hash + source.charCodeAt(i)) | 0;
  }
  return 'r' + Math.abs(hash).toString(36);
}

/**
 * Formate une date ISO en français, avec repère relatif.
 * @param {string} isoDate
 * @returns {string}
 */
function formatDate(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';

  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  const absolute = date.toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric'
  });

  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 30) return `il y a ${days} jours`;
  return absolute;
}

/**
 * Exécute des tâches asynchrones avec une concurrence limitée.
 * @param {Array} items
 * @param {number} limit
 * @param {Function} worker - (item, index) => Promise
 * @returns {Promise<Array>}
 */
async function mapWithLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = null;
      }
    }
  });

  await Promise.all(runners);
  return results;
}

/**
 * `fetch` avec délai maximum. Sans cela, un réseau qui filtre un domaine sans
 * répondre laisse la requête pendante indéfiniment et bloque la recherche.
 * @param {string} url
 * @param {Object} [options] - Options passées à fetch.
 * @param {number} [timeout] - Délai en ms avant abandon.
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Pas de réponse en ${Math.round(timeout / 1000)} s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Charge un script externe une seule fois.
 * @param {string} src
 * @returns {Promise<void>}
 */
function loadScriptOnce(src) {
  if (loadScriptOnce.cache && loadScriptOnce.cache[src]) return loadScriptOnce.cache[src];
  loadScriptOnce.cache = loadScriptOnce.cache || {};

  loadScriptOnce.cache[src] = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      delete loadScriptOnce.cache[src];
      reject(new Error(`Impossible de charger ${src}`));
    };
    document.head.appendChild(script);
  });

  return loadScriptOnce.cache[src];
}

window.escapeHtml = escapeHtml;
window.safeUrl = safeUrl;
window.normalizeText = normalizeText;
window.containsTerm = containsTerm;
window.extractAge = extractAge;
window.hashId = hashId;
window.formatDate = formatDate;
window.mapWithLimit = mapWithLimit;
window.fetchWithTimeout = fetchWithTimeout;
window.loadScriptOnce = loadScriptOnce;
