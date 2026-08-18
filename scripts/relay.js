// Accès résilient aux API publiques.
//
// Certains réseaux (opérateur, DNS filtrant, Wi-Fi d'entreprise) bloquent des
// domaines entiers : la requête directe n'échoue pas proprement, elle reste
// pendante. D'autres API refusent le CORS. Ce module tente donc le direct puis,
// en cas d'échec, une série de relais publics, et retient celui qui a marché
// pour ne pas repayer l'essai à chaque recherche.
//
// Ce qu'un relais voit : l'URL demandée, donc tes mots-clés et ta ville. Aucun
// identifiant, aucun cookie, aucune donnée de compte n'y transite. Pour que
// personne d'autre que toi ne voie ces requêtes, déploie ton propre relais
// (voir tools/reddit-relay.js) et colle son adresse dans l'app.

const RELAY_KEY = 'lAntreRelay';
const CUSTOM_RELAY_KEY = 'lAntreCustomRelay';

/** Relais publics essayés dans l'ordre, après la tentative directe. */
const PUBLIC_RELAYS = [
  { id: 'allorigins', build: url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}` },
  { id: 'corsproxy', build: url => `https://corsproxy.io/?url=${encodeURIComponent(url)}` },
  { id: 'codetabs', build: url => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}` }
];

/**
 * Relais personnel configuré par l'utilisateur, s'il existe.
 * @returns {string|null}
 */
function getCustomRelay() {
  const stored = localStorage.getItem(CUSTOM_RELAY_KEY);
  return stored && /^https?:\/\//.test(stored) ? stored.replace(/\/+$/, '') : null;
}

/**
 * Enregistre l'adresse d'un relais personnel.
 * @param {string} url
 * @returns {boolean} - True si l'adresse a été acceptée.
 */
function setCustomRelay(url) {
  const cleaned = String(url || '').trim();

  if (!cleaned) {
    localStorage.removeItem(CUSTOM_RELAY_KEY);
    localStorage.removeItem(RELAY_KEY);
    return true;
  }
  if (!/^https:\/\//.test(cleaned)) return false;

  localStorage.setItem(CUSTOM_RELAY_KEY, cleaned.replace(/\/+$/, ''));
  localStorage.removeItem(RELAY_KEY);
  return true;
}

/**
 * Liste ordonnée des tentatives : relais personnel, direct, puis relais publics.
 * Celui qui a fonctionné la dernière fois passe en tête.
 * @returns {{id: string, build: Function}[]}
 */
function relayChain() {
  const chain = [{ id: 'direct', build: url => url }, ...PUBLIC_RELAYS];

  const custom = getCustomRelay();
  if (custom) {
    chain.unshift({ id: 'custom', build: url => `${custom}?url=${encodeURIComponent(url)}` });
  }

  const last = localStorage.getItem(RELAY_KEY);
  if (!last) return chain;

  const preferred = chain.find(entry => entry.id === last);
  return preferred ? [preferred, ...chain.filter(entry => entry !== preferred)] : chain;
}

/**
 * Récupère du JSON en essayant successivement chaque voie d'accès.
 * @param {string} targetUrl - L'URL de l'API visée.
 * @param {Object} [options]
 * @param {number} [options.timeout] - Délai par tentative, en ms.
 * @param {number} [options.totalBudget] - Temps maximum pour l'ensemble des tentatives.
 * @param {Function} [options.validate] - Reçoit le JSON, renvoie true s'il est exploitable.
 * @returns {Promise<{data: Object, via: string}>}
 */
async function fetchJsonResilient(targetUrl, options = {}) {
  const { timeout = 8000, totalBudget = 15000, validate = () => true } = options;
  const attempts = relayChain();
  const failures = [];
  const deadline = Date.now() + totalBudget;

  for (const attempt of attempts) {
    // Un réseau qui ne répond sur aucune voie ne doit pas cumuler les délais :
    // au-delà du budget, on abandonne plutôt que de faire attendre pour rien.
    const remaining = deadline - Date.now();
    if (remaining <= 500) {
      failures.push(`${attempt.id} : budget épuisé`);
      break;
    }

    try {
      const response = await fetchWithTimeout(attempt.build(targetUrl),
        { headers: { Accept: 'application/json' } }, Math.min(timeout, remaining));

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      // Les relais renvoient du texte brut : on analyse nous-mêmes.
      const data = JSON.parse(await response.text());
      if (!validate(data)) throw new Error('Réponse inexploitable');

      localStorage.setItem(RELAY_KEY, attempt.id);
      return { data, via: attempt.id };
    } catch (error) {
      failures.push(`${attempt.id} : ${error.message}`);
    }
  }

  localStorage.removeItem(RELAY_KEY);
  throw new Error(`Aucune voie d'accès disponible (${failures.join(' ; ')})`);
}

/**
 * Nom lisible d'une voie d'accès, pour les messages de l'interface.
 * @param {string} id
 * @returns {string}
 */
function relayLabel(id) {
  if (id === 'direct') return 'accès direct';
  if (id === 'custom') return 'ton relais';
  return `relais ${id}`;
}

window.fetchJsonResilient = fetchJsonResilient;
window.getCustomRelay = getCustomRelay;
window.setCustomRelay = setCustomRelay;
window.relayLabel = relayLabel;
window.PUBLIC_RELAYS = PUBLIC_RELAYS;
