// Géolocalisation : position GPS ou ville saisie manuellement.

/**
 * Convertit des coordonnées en nom de ville (Nominatim / OpenStreetMap).
 * Utile car les moteurs de recherche des sources ont besoin d'un nom de lieu,
 * pas de coordonnées.
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<string|null>}
 */
async function reverseGeocode(lat, lng) {
  const url = 'https://nominatim.openstreetmap.org/reverse'
    + `?format=jsonv2&zoom=10&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;

  try {
    const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 6000);
    if (!response.ok) return null;

    const data = await response.json();
    const address = data.address || {};
    return address.city || address.town || address.village
      || address.municipality || address.county || null;
  } catch (error) {
    console.warn('Géocodage inverse indisponible :', error);
    return null;
  }
}

/**
 * Convertit un nom de ville en coordonnées (Nominatim / OpenStreetMap).
 * Nécessaire pour interroger les sources qui raisonnent en coordonnées, comme
 * la recherche de lieux.
 * @param {string} city
 * @param {string} [country] - Code pays ISO pour lever les ambiguïtés.
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
async function forwardGeocode(city, country) {
  if (!city) return null;

  const url = 'https://nominatim.openstreetmap.org/search'
    + `?format=jsonv2&limit=1&q=${encodeURIComponent(city)}`
    + (country ? `&countrycodes=${encodeURIComponent(country)}` : '');

  try {
    const response = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 6000);
    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || !data.length) return null;

    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (error) {
    console.warn('Géocodage indisponible :', error);
    return null;
  }
}

/**
 * Distance à vol d'oiseau entre deux points, en kilomètres (formule de haversine).
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number}
 */
function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = degrees => (degrees * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}

/**
 * Coordonnées des principales villes, en secours quand le géocodage en ligne
 * est injoignable. Sans ce repli, un service tiers indisponible suffisait à
 * priver la recherche de lieux de tout point de départ.
 */
const CITY_FALLBACK = {
  paris: [48.8566, 2.3522], marseille: [43.2965, 5.3698], lyon: [45.7640, 4.8357],
  toulouse: [43.6047, 1.4442], nice: [43.7102, 7.2620], nantes: [47.2184, -1.5536],
  montpellier: [43.6108, 3.8767], strasbourg: [48.5734, 7.7521], bordeaux: [44.8378, -0.5792],
  lille: [50.6292, 3.0573], rennes: [48.1173, -1.6778], reims: [49.2583, 4.0317],
  toulon: [43.1242, 5.9280], 'saint-etienne': [45.4397, 4.3872], grenoble: [45.1885, 5.7245],
  dijon: [47.3220, 5.0415], angers: [47.4784, -0.5632], nimes: [43.8367, 4.3601],
  'clermont-ferrand': [45.7772, 3.0870], tours: [47.3941, 0.6848], limoges: [45.8336, 1.2611],
  amiens: [49.8941, 2.2958], perpignan: [42.6887, 2.8948], metz: [49.1193, 6.1757],
  besancon: [47.2378, 6.0241], orleans: [47.9029, 1.9093], mulhouse: [47.7508, 7.3359],
  rouen: [49.4432, 1.0999], caen: [49.1829, -0.3707], nancy: [48.6921, 6.1844],
  avignon: [43.9493, 4.8055], poitiers: [46.5802, 0.3404], brest: [48.3904, -4.4861],
  'le mans': [48.0061, 0.1996], 'aix-en-provence': [43.5297, 5.4474],
  annecy: [45.8992, 6.1294], pau: [43.2951, -0.3708], bayonne: [43.4929, -1.4748],
  'la rochelle': [46.1591, -1.1520], ajaccio: [41.9192, 8.7386],
  bruxelles: [50.8503, 4.3517], anvers: [51.2194, 4.4025], liege: [50.6326, 5.5797],
  charleroi: [50.4108, 4.4446], gand: [51.0543, 3.7174], namur: [50.4674, 4.8720],
  geneve: [46.2044, 6.1432], lausanne: [46.5197, 6.6323], zurich: [47.3769, 8.5417],
  berne: [46.9480, 7.4474], bale: [47.5596, 7.5886], neuchatel: [46.9900, 6.9293],
  montreal: [45.5019, -73.5674], quebec: [46.8139, -71.2080], toronto: [43.6532, -79.3832],
  ottawa: [45.4215, -75.6972], vancouver: [49.2827, -123.1207], laval: [45.6066, -73.7124]
};

/**
 * Cherche une ville dans la table de secours.
 * @param {string} city
 * @returns {{lat: number, lng: number}|null}
 */
function fallbackCoordinates(city) {
  const key = normalizeText(city).trim();
  if (!key) return null;

  const exact = CITY_FALLBACK[key];
  if (exact) return { lat: exact[0], lng: exact[1] };

  // « Lyon 3e », « Paris 15 » : on retombe sur la ville principale.
  const partial = Object.keys(CITY_FALLBACK).find(name => key.startsWith(name));
  return partial ? { lat: CITY_FALLBACK[partial][0], lng: CITY_FALLBACK[partial][1] } : null;
}

/**
 * Garantit des coordonnées pour la recherche : position GPS si disponible,
 * sinon géocodage en ligne, sinon table de secours embarquée.
 * @returns {Promise<{lat: number, lng: number}|null>}
 */
async function ensureCoordinates() {
  if (filters.location.lat !== null && filters.location.lng !== null) {
    return { lat: filters.location.lat, lng: filters.location.lng };
  }

  const found = await forwardGeocode(filters.location.city, filters.location.country)
    || fallbackCoordinates(filters.location.city);

  if (found) {
    filters.location.lat = found.lat;
    filters.location.lng = found.lng;
  }
  return found;
}

/**
 * Ville connue la plus proche de coordonnées données.
 * Sert de secours quand le géocodage inverse est injoignable : sans nom de
 * lieu, toutes les recherches texte perdent la localisation.
 * @param {number} lat
 * @param {number} lng
 * @returns {string|null}
 */
function nearestKnownCity(lat, lng) {
  let best = null;
  let bestDistance = Infinity;

  Object.entries(CITY_FALLBACK).forEach(([name, [cityLat, cityLng]]) => {
    const distance = distanceKm(lat, lng, cityLat, cityLng);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = name;
    }
  });

  // Au-delà de 60 km, annoncer cette ville serait trompeur.
  if (!best || bestDistance > 60) return null;
  return best.charAt(0).toUpperCase() + best.slice(1);
}

/**
 * Communes situées dans le rayon choisi, d'après OpenStreetMap.
 * C'est ce qui donne son sens au rayon : chercher « autour de toi » et non
 * dans la seule commune où le GPS t'a placé.
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusKm
 * @returns {Promise<string[]>}
 */
async function findNearbyTowns(lat, lng, radiusKm) {
  const radius = Math.min(radiusKm, 60) * 1000;
  const query = `[out:json][timeout:15];`
    + `node["place"~"^(city|town)$"](around:${radius},${lat},${lng});out 60;`;

  try {
    const { data } = await fetchJsonResilient(
      `${OVERPASS_ENDPOINT}?data=${encodeURIComponent(query)}`,
      { timeout: 12000, totalBudget: 18000, validate: json => json && Array.isArray(json.elements) }
    );

    return (data.elements || [])
      .filter(element => element.tags && element.tags.name)
      .map(element => ({
        name: element.tags.name,
        population: parseInt(element.tags.population, 10) || 0,
        distance: distanceKm(lat, lng, element.lat, element.lon)
      }))
      // Les plus peuplées d'abord : c'est là qu'il se passe quelque chose.
      .sort((a, b) => b.population - a.population || a.distance - b.distance)
      .map(town => town.name);
  } catch (error) {
    console.warn('Communes voisines indisponibles :', error);
    return [];
  }
}

/**
 * Met à jour l'étiquette de zone affichée sous les champs de localisation.
 */
function renderZoneLabel() {
  const label = document.getElementById('zone-label');
  if (!label) return;

  const { city, lat, nearby } = filters.location;
  if (!city && lat === null) {
    label.textContent = '';
    return;
  }

  const parts = [];
  if (city) parts.push(city);
  else if (lat !== null) parts.push('position GPS');
  if (lat !== null) parts.push('GPS actif');
  if (nearby && nearby.length) parts.push(`+ ${nearby.length} commune(s) dans ${filters.radius} km`);

  label.textContent = `Zone : ${parts.join(' · ')}`;
}

/**
 * Demande la position GPS et l'enregistre dans les filtres.
 */
function initGeolocation() {
  if (!navigator.geolocation) {
    showNotification('La géolocalisation n\'est pas supportée par ce navigateur.', 'error');
    return;
  }

  showNotification('Demande de position en cours…', 'info');

  navigator.geolocation.getCurrentPosition(
    async position => {
      filters.location.lat = position.coords.latitude;
      filters.location.lng = position.coords.longitude;
      enableSearchButton();
      showNotification('Position obtenue.', 'success');

      const city = await reverseGeocode(filters.location.lat, filters.location.lng)
        || nearestKnownCity(filters.location.lat, filters.location.lng);

      if (city) {
        filters.location.city = city;
        const cityInput = document.getElementById('city-input');
        if (cityInput) cityInput.value = city;
        showNotification(`Zone détectée : ${city}.`, 'success');
      } else {
        showNotification('Ville non identifiée : saisis-la pour de meilleurs résultats.', 'warning');
      }

      renderZoneLabel();
      enableSearchButton();

      // Les communes voisines élargissent la recherche à tout le rayon.
      const towns = await findNearbyTowns(filters.location.lat, filters.location.lng, filters.radius);
      filters.location.nearby = towns.filter(town => normalizeText(town) !== normalizeText(city)).slice(0, 6);

      if (filters.location.nearby.length) {
        showNotification(`${filters.location.nearby.length} commune(s) voisine(s) incluses : `
          + `${filters.location.nearby.slice(0, 3).join(', ')}…`, 'info');
      }
      renderZoneLabel();
    },
    error => {
      const messages = {
        [error.PERMISSION_DENIED]: 'Géolocalisation refusée. Saisis une ville à la place.',
        [error.POSITION_UNAVAILABLE]: 'Position indisponible. Saisis une ville à la place.',
        [error.TIMEOUT]: 'La demande de position a expiré. Réessaie ou saisis une ville.'
      };
      showNotification(messages[error.code] || 'Impossible d\'obtenir la position.', 'error');
      document.getElementById('city-input')?.focus();
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
  );
}

/**
 * Active le bouton de recherche dès qu'une localisation est connue.
 */
function enableSearchButton() {
  const button = document.getElementById('search-button');
  if (!button) return;
  button.disabled = !(filters.location.lat !== null || filters.location.city);
}

/**
 * Prend en compte la ville saisie manuellement.
 */
function updateManualLocation() {
  const input = document.getElementById('city-input');
  if (!input) return;

  const city = input.value.trim();
  filters.location.city = city || null;

  // Une saisie manuelle remplace la position GPS.
  if (city) {
    filters.location.lat = null;
    filters.location.lng = null;
    filters.location.nearby = [];
  }

  renderZoneLabel();
  enableSearchButton();
}

window.initGeolocation = initGeolocation;
window.enableSearchButton = enableSearchButton;
window.updateManualLocation = updateManualLocation;
window.reverseGeocode = reverseGeocode;
window.forwardGeocode = forwardGeocode;
window.ensureCoordinates = ensureCoordinates;
window.distanceKm = distanceKm;
window.nearestKnownCity = nearestKnownCity;
window.findNearbyTowns = findNearbyTowns;
window.renderZoneLabel = renderZoneLabel;
