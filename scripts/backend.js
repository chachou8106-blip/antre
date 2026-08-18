// Dialogue avec le serveur L'Antre (worker/worker.js).
//
// Sans serveur, l'app reste limitée à ce qu'un navigateur peut atteindre :
// Reddit quand le réseau le laisse passer, et les lieux OpenStreetMap. Avec
// serveur, elle récupère en plus le fédivers et les flux de forums, et Reddit
// cesse de dépendre du réseau de l'utilisateur.

/**
 * Adresse du serveur, partagée avec le relais (même worker).
 * @returns {string|null}
 */
function getBackendUrl() {
  return getCustomRelay();
}

/**
 * Interroge /api/search et normalise les résultats au format de l'app.
 * @param {Object} [options]
 * @param {number} [options.timeout]
 * @returns {Promise<{results: Object[], sources: Object[]}>}
 */
async function searchViaBackend(options = {}) {
  const base = getBackendUrl();
  if (!base) throw new Error('Aucun serveur configuré');

  const params = new URLSearchParams({
    q: buildRedditQuery() || locationCityOrEmpty(),
    city: filters.location.city || '',
    radius: String(filters.radius),
    limit: '60'
  });

  if (filters.location.lat !== null && filters.location.lng !== null) {
    params.set('lat', String(filters.location.lat));
    params.set('lng', String(filters.location.lng));
  }

  const response = await fetchWithTimeout(`${base}/api/search?${params}`,
    { headers: { Accept: 'application/json' } }, options.timeout || 20000);

  if (!response.ok) throw new Error(`Serveur HTTP ${response.status}`);

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.results)) throw new Error('Réponse inattendue du serveur');

  return {
    results: payload.results.map(toAppResult).filter(Boolean),
    sources: payload.sources || []
  };
}

/**
 * Convertit un résultat du serveur en carte exploitable par l'app.
 * @param {Object} item
 * @returns {Object|null}
 */
function toAppResult(item) {
  if (!item || !item.link) return null;

  const text = `${item.title || ''} ${item.text || ''}`.trim();
  const isPlace = item.source === 'places';

  const result = {
    type: isPlace ? 'place' : 'post',
    id: hashId(item.link),
    source: item.source || 'serveur',
    platform: item.platform || 'Serveur',
    icon: isPlace ? 'fas fa-location-dot' : 'fas fa-satellite-dish',
    title: item.title || 'Sans titre',
    username: item.author || null,
    bio: item.text || '',
    link: item.link,
    outboundUrl: item.outboundUrl || null,
    image: item.image || null,
    date: item.date || null,
    location: filters.location.city || null,
    gender: inferGender(text),
    role: inferRole(text),
    age: extractAge(text),
    verified: false
  };

  if (isPlace) {
    result.address = item.text || '';
    result.phone = item.phone || null;
    result.openingHours = item.openingHours || null;
    result.lat = item.lat;
    result.lng = item.lng;
    result.gender = null;
    result.role = null;

    if (Number.isFinite(item.lat) && filters.location.lat !== null) {
      result.distance = distanceKm(filters.location.lat, filters.location.lng, item.lat, item.lng);
      result.location = `${result.distance} km`;
    }
  }

  return result;
}

/**
 * Vérifie l'état des sources du serveur.
 * @returns {Promise<Object[]>}
 */
async function checkBackendHealth() {
  const base = getBackendUrl();
  if (!base) throw new Error('Aucun serveur configuré');

  const response = await fetchWithTimeout(`${base}/api/health`,
    { headers: { Accept: 'application/json' } }, 25000);
  if (!response.ok) throw new Error(`Serveur HTTP ${response.status}`);

  const payload = await response.json();
  return payload.checks || [];
}

window.getBackendUrl = getBackendUrl;
window.searchViaBackend = searchViaBackend;
window.checkBackendHealth = checkBackendHealth;
