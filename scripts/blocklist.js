// Liste noire de domaines : ne garder que ce qui est gratuit.
//
// Deux usages complémentaires :
//  1. écarter les résultats qui pointent vers un site payant ;
//  2. injecter des exclusions « -site: » dans les requêtes des moteurs, pour
//     que ces sites ne remontent même pas.

const BLOCKLIST_KEY = 'lAntreBlocklist';

/**
 * Domaines écartés par défaut : sites à abonnement, messagerie payante,
 * annuaires professionnels et plateformes de contenu payant.
 * Chaque ligne est modifiable depuis l'interface.
 */
const DEFAULT_BLOCKLIST = [
  // Sites « dominatrice » et annuaires professionnels
  'dominatrice.tv',
  'dominatrice-annuaire.com',
  'sexemodel.com',
  'escortdirectory.com',
  'vivastreet.com',
  'wannonce.com',
  '6annonces.net',
  // Contenu payant / cam
  'onlyfans.com',
  'mym.fans',
  'fansly.com',
  'chaturbate.com',
  'livejasmin.com',
  'cam4.com',
  'bongacams.com',
  'stripchat.com',
  // Rencontres et libertinage à messagerie payante
  'wyylde.com',
  'placelibertine.com',
  'gleeden.com',
  'jacquieetmichel-contact.com',
  'meetic.fr',
  'edenflirt.com'
];

/**
 * Lit la liste noire de l'utilisateur, ou celle par défaut.
 * @returns {string[]}
 */
function getBlocklist() {
  try {
    const stored = JSON.parse(localStorage.getItem(BLOCKLIST_KEY));
    if (Array.isArray(stored)) return stored;
  } catch (error) {
    console.warn('Liste noire illisible, retour aux valeurs par défaut :', error);
  }
  return [...DEFAULT_BLOCKLIST];
}

/**
 * Enregistre la liste noire.
 * @param {string[]} domains
 */
function saveBlocklist(domains) {
  const cleaned = domains
    .map(domain => normalizeText(domain).replace(/^https?:\/\//, '').replace(/\/.*$/, '').trim())
    .filter(Boolean);

  try {
    localStorage.setItem(BLOCKLIST_KEY, JSON.stringify(Array.from(new Set(cleaned))));
  } catch (error) {
    showNotification('Impossible d\'enregistrer la liste des sites exclus.', 'error');
  }
}

/**
 * Le lien pointe-t-il vers un domaine exclu ?
 * @param {string} url
 * @returns {boolean}
 */
function isBlockedUrl(url) {
  if (!url) return false;

  let host;
  try {
    host = new URL(url, window.location.href).hostname.toLowerCase();
  } catch (error) {
    return false;
  }

  return getBlocklist().some(domain => host === domain || host.endsWith(`.${domain}`));
}

/**
 * Opérateurs d'exclusion à ajouter aux requêtes des moteurs de recherche.
 * Limité pour ne pas produire une URL démesurée.
 * @param {number} [limit]
 * @returns {string}
 */
function blocklistOperators(limit = 8) {
  return getBlocklist()
    .slice(0, limit)
    .map(domain => `-site:${domain}`)
    .join(' ');
}

/**
 * Ajoute un domaine à la liste noire depuis un résultat.
 * @param {string} url
 * @returns {string|null} - Le domaine ajouté.
 */
function blockDomainFromUrl(url) {
  try {
    const host = new URL(url, window.location.href).hostname.toLowerCase().replace(/^www\./, '');
    const list = getBlocklist();
    if (!list.includes(host)) {
      list.push(host);
      saveBlocklist(list);
    }
    return host;
  } catch (error) {
    return null;
  }
}

/**
 * Remplit la zone de saisie de la liste noire.
 */
function renderBlocklistField() {
  const field = document.getElementById('blocklist-field');
  if (field) field.value = getBlocklist().join('\n');
}

window.DEFAULT_BLOCKLIST = DEFAULT_BLOCKLIST;
window.getBlocklist = getBlocklist;
window.saveBlocklist = saveBlocklist;
window.isBlockedUrl = isBlockedUrl;
window.blocklistOperators = blocklistOperators;
window.blockDomainFromUrl = blockDomainFromUrl;
window.renderBlocklistField = renderBlocklistField;
