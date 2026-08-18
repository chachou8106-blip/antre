// Gestion des filtres de recherche de L'Antre

/**
 * Objet global contenant tous les filtres.
 */
const filters = {
  // Localisation
  location: {
    lat: null,
    lng: null,
    city: null,
    country: 'fr',
    // Communes voisines détectées dans le rayon (voir geolocation.js).
    nearby: []
  },

  // Critères de base
  radius: 50,
  sortBy: 'pertinence',

  // Filtres principaux
  gender: ['Femme'],
  role: ['Dominatrice', 'Soumis', 'Amatrice'],
  practices: ['Sodomie', 'Anal', 'Femdom'],
  attributes: ['Gros seins'],

  // Âge
  ageMin: 18,
  ageMax: 99,

  // Exclusions
  excludePros: true,
  excludeVerified: false,
  excludeNoPic: false,
  excludeOld: true,
  excludePaid: true,

  // Sources activées (voir sources.js)
  sources: ['serveur', 'reddit', 'fetlife', 'fetlife-groups', 'fetlife-events', 'maps',
    'forums', 'craigslist', 'web', 'facebook', 'instagram', 'x'],

  // Exigence du moteur : 'large' (tout garder et classer), 'cible' (au moins un
  // critère doit correspondre), 'strict' (un critère de chaque famille cochée).
  searchMode: 'large',

  // Requête saisie à la main ; vide = requête calculée depuis les filtres.
  query: '',

  // Analyse d'image (voir vision.js)
  vision: {
    enabled: false,
    hideNonPhoto: false
  }
};

/** Termes qui trahissent une annonce professionnelle / payante. */
const PRO_TERMS = ['pro', 'pros', 'tarif', 'tarifs', 'payant', 'payante', 'professionnel',
  'professionnelle', 'escort', 'escorte', 'salon', 'massage tantrique', '€', '$',
  // Contenu et messagerie payants
  'abonnement', 'premium', 'vip', 'cam', 'webcam', 'onlyfans', 'mym', 'fansly',
  'paypal', 'tribute', 'tributes', 'findom', 'paiement', 'prix', 'donation',
  'cadeau obligatoire', 'no free', 'paid'];

/**
 * Lit la valeur d'une case à cocher sans écraser un `false` légitime.
 * @param {string} id
 * @param {boolean} fallback
 * @returns {boolean}
 */
function readCheckbox(id, fallback) {
  const element = document.getElementById(id);
  return element ? element.checked : fallback;
}

/**
 * Met à jour l'objet `filters` à partir du DOM.
 */
function updateFilters() {
  const radiusSelect = document.getElementById('radius-select');
  if (radiusSelect) filters.radius = parseInt(radiusSelect.value, 10) || 50;

  const cityInput = document.getElementById('city-input');
  if (cityInput) {
    const city = cityInput.value.trim();
    filters.location.city = city || null;
  }

  const countrySelect = document.getElementById('country-select');
  if (countrySelect) filters.location.country = countrySelect.value;

  const genderSelect = document.getElementById('gender-select');
  if (genderSelect) {
    filters.gender = Array.from(genderSelect.selectedOptions).map(option => option.value);
  }

  const roleSelect = document.getElementById('role-select');
  if (roleSelect) {
    filters.role = Array.from(roleSelect.selectedOptions).map(option => option.value);
  }

  filters.practices = Array.from(document.querySelectorAll('input[name="practice"]:checked'))
    .map(checkbox => checkbox.value);

  filters.attributes = Array.from(document.querySelectorAll('input[name="attribute"]:checked'))
    .map(checkbox => checkbox.value);

  filters.sources = Array.from(document.querySelectorAll('input[name="source"]:checked'))
    .map(checkbox => checkbox.value);

  const ageMinInput = document.getElementById('age-min');
  const ageMaxInput = document.getElementById('age-max');
  if (ageMinInput && ageMaxInput) {
    let min = parseInt(ageMinInput.value, 10);
    let max = parseInt(ageMaxInput.value, 10);

    // Les deux curseurs partagent la même plage : on les empêche de se croiser.
    if (min > max) {
      if (document.activeElement === ageMinInput) {
        max = min;
        ageMaxInput.value = String(max);
      } else {
        min = max;
        ageMinInput.value = String(min);
      }
    }

    filters.ageMin = min;
    filters.ageMax = max;

    const ageMinValue = document.getElementById('age-min-value');
    const ageMaxValue = document.getElementById('age-max-value');
    if (ageMinValue) ageMinValue.textContent = String(min);
    if (ageMaxValue) ageMaxValue.textContent = String(max);
  }

  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) filters.sortBy = sortSelect.value;

  filters.excludePros = readCheckbox('exclude-pros', filters.excludePros);
  filters.excludeVerified = readCheckbox('exclude-verified', filters.excludeVerified);
  filters.excludeNoPic = readCheckbox('exclude-no-pic', filters.excludeNoPic);
  filters.excludeOld = readCheckbox('exclude-old', filters.excludeOld);
  filters.excludePaid = readCheckbox('exclude-paid', filters.excludePaid);
  const searchModeSelect = document.getElementById('search-mode');
  if (searchModeSelect) filters.searchMode = searchModeSelect.value;

  const queryInput = document.getElementById('query-input');
  if (queryInput) filters.query = queryInput.value.trim();

  filters.vision.enabled = readCheckbox('vision-enabled', filters.vision.enabled);
  filters.vision.hideNonPhoto = readCheckbox('vision-hide-nonphoto', filters.vision.hideNonPhoto);
}

/**
 * Mots-clés retenus pour interroger les moteurs de recherche.
 * @param {number} limit - Nombre maximum de mots-clés.
 * @returns {string[]}
 */
function keywordTerms(limit = 8) {
  const terms = [...filters.role, ...filters.practices, ...filters.attributes]
    .map(term => term.trim())
    .filter(Boolean);

  // Dédupliquer sans perdre l'ordre de priorité (rôles d'abord).
  return Array.from(new Set(terms)).slice(0, limit);
}

/**
 * Terme de localisation utilisable dans une requête texte.
 * @returns {string}
 */
function locationTerm() {
  return filters.location.city || '';
}

/**
 * Requête de base envoyée aux moteurs.
 *
 * Règle apprise à la dure : ces moteurs exigent **tous** les mots à la fois.
 * « Lyon Dominatrice Soumis Amatrice » ne renvoie rien, parce qu'aucun profil ne
 * contient les quatre. Deux termes suffisent — la ville, qui filtre vraiment,
 * plus un mot de thème. Le tri par pertinence fait le reste sur ce qui remonte.
 *
 * @param {number} [maxTerms] - Mots-clés ajoutés à la ville.
 * @returns {string}
 */
function baseQuery(maxTerms = 1) {
  // Une requête saisie à la main l'emporte toujours.
  if (filters.query) return filters.query;

  const city = locationTerm();
  return [city, ...keywordTerms(maxTerms)].filter(Boolean).join(' ');
}

/**
 * Thème dominant, utilisé quand un seul mot doit résumer la recherche.
 * @returns {string}
 */
function themeTerm() {
  const bdsmRoles = ['Dominatrice', 'Dominant', 'Soumise', 'Soumis', 'Maîtresse', 'Esclave'];
  return filters.role.some(role => bdsmRoles.includes(role)) ? 'bdsm' : 'libertin';
}

/**
 * Construit la requête Reddit.
 * Volontairement courte, et non restreinte à une liste de subreddits : une
 * annonce française a plus de chances d'exister ailleurs que dans les subs
 * anglophones auxquels la recherche était limitée.
 * @returns {string}
 */
function buildRedditQuery() {
  if (filters.query) return filters.query;

  // Reddit accepte les groupes OR : le rayon devient une vraie couverture de
  // zone, et non la seule commune où le GPS nous a placés.
  const places = [locationTerm(), ...(filters.location.nearby || []).slice(0, 3)]
    .filter(Boolean)
    .map(place => (place.includes(' ') ? `"${place}"` : place));

  const zone = places.length > 1 ? `(${places.join(' OR ')})` : places[0] || '';
  return [zone, themeTerm()].filter(Boolean).join(' ');
}

/**
 * Construit la requête « lieux » (Google Maps, annuaires).
 * @returns {string}
 */
function buildPlacesQuery() {
  // Google Maps cherche un type de lieu, pas une liste de mots-clés — et la
  // requête libre décrit des personnes, pas des établissements.
  return ['club libertin', locationTerm()].filter(Boolean).join(' ');
}

/**
 * Construit une requête générique pour un moteur de recherche web.
 * @returns {string}
 */
function buildWebQuery() {
  const base = [baseQuery(1), 'rencontre'].filter(Boolean).join(' ');
  // Trois exclusions au maximum : au-delà, la requête devient si étroite
  // qu'elle ne renvoie plus rien.
  return filters.excludePaid ? `${base} ${blocklistOperators(3)}`.trim() : base;
}

/**
 * Niveau de zoom Google Maps correspondant au rayon choisi.
 * @returns {number}
 */
function radiusToZoom() {
  const table = { 5: 13, 10: 12, 25: 11, 50: 10, 100: 9, 200: 8 };
  return table[filters.radius] || 11;
}

/**
 * Vérifie qu'un résultat correspond aux filtres.
 * Les cartes de type « lien » (recherches sur un site tiers) ne sont jamais
 * filtrées : ce ne sont pas des profils.
 * @param {Object} result
 * @returns {boolean}
 */
function matchesFilters(result) {
  if (!result) return false;

  // Lieux et liens de recherche ne sont pas des annonces : aucun critère de
  // profil ne s'y applique, seule la liste noire les concerne.
  if (result.type === 'link') return true;
  if (result.type === 'place') return !(filters.excludePaid && isBlockedUrl(result.link));

  const bio = `${result.title || ''} ${result.bio || ''}`;

  // Genre, rôle, pratiques et attributs ne suppriment plus rien ici : ils sont
  // pondérés par le moteur (search-engine.js), qui décide selon le mode choisi.
  const age = result.age || extractAge(bio);
  if (age && (age < filters.ageMin || age > filters.ageMax)) return false;

  if (filters.excludePros && PRO_TERMS.some(term => containsTerm(bio, term))) return false;

  // Le texte peut être irréprochable et le lien pointer vers un site payant,
  // directement ou via la cible d'une annonce-lien.
  if (filters.excludePaid
    && (isBlockedUrl(result.link) || isBlockedUrl(result.outboundUrl))) return false;

  if (filters.excludeVerified && result.verified) return false;

  if (filters.excludeNoPic && !result.image) return false;

  if (filters.excludeOld && result.date) {
    const postDate = new Date(result.date);
    const limit = new Date();
    limit.setMonth(limit.getMonth() - 1);
    if (postDate < limit) return false;
  }

  return true;
}

window.filters = filters;
window.updateFilters = updateFilters;
window.keywordTerms = keywordTerms;
window.buildRedditQuery = buildRedditQuery;
window.baseQuery = baseQuery;
window.themeTerm = themeTerm;
window.buildPlacesQuery = buildPlacesQuery;
window.buildWebQuery = buildWebQuery;
window.radiusToZoom = radiusToZoom;
window.matchesFilters = matchesFilters;
