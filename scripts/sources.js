// Sources de recherche de L'Antre — mode agrégateur.
//
// Principe : L'Antre ne contourne pas les protections des sites et n'invente
// aucun profil. Pour chaque source, elle construit un lien de recherche réel,
// prêt à ouvrir. Quand une source expose une API publique consultable depuis un
// navigateur (aujourd'hui : Reddit), les résultats sont récupérés et affichés
// directement. Sinon, seule la carte « lien de recherche » est proposée.

/** Serveur Overpass interrogé pour les lieux réels (données OpenStreetMap). */
const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';

/** Libellés lisibles des catégories de lieux OpenStreetMap. */
const PLACE_LABELS = {
  swingerclub: 'Club libertin',
  swinger: 'Club échangiste',
  sauna: 'Sauna',
  erotic: 'Boutique érotique',
  nightclub: 'Club'
};

/**
 * Transforme un élément Overpass en fiche de lieu exploitable.
 * @param {Object} element - Élément renvoyé par Overpass.
 * @param {{lat: number, lng: number}} origin - Point de référence pour la distance.
 * @returns {Object|null}
 */
function buildPlace(element, origin) {
  const tags = element.tags || {};
  const lat = element.lat ?? (element.center && element.center.lat);
  const lng = element.lon ?? (element.center && element.center.lon);
  if (!tags.name && !tags['addr:street']) return null;

  const category = PLACE_LABELS[tags.amenity] || PLACE_LABELS[tags.club]
    || PLACE_LABELS[tags.leisure] || PLACE_LABELS[tags.shop] || 'Lieu';

  const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:postcode'],
    tags['addr:city']].filter(Boolean).join(' ');

  const distance = (lat !== undefined && lng !== undefined && origin)
    ? distanceKm(origin.lat, origin.lng, lat, lng)
    : null;

  const website = tags.website || tags['contact:website'] || tags.url;
  const osmLink = `https://www.openstreetmap.org/${element.type}/${element.id}`;

  return {
    type: 'place',
    id: hashId(`osm:${element.type}:${element.id}`),
    source: 'maps',
    platform: `${category} · OpenStreetMap`,
    icon: 'fas fa-location-dot',
    title: tags.name || category,
    bio: [address, tags.opening_hours ? `Horaires : ${tags.opening_hours}` : '',
      tags.description || ''].filter(Boolean).join(' — ') || 'Adresse relevée dans OpenStreetMap.',
    link: website || osmLink,
    image: null,
    date: null,
    address,
    phone: tags.phone || tags['contact:phone'] || null,
    openingHours: tags.opening_hours || null,
    website: website || null,
    lat,
    lng,
    distance,
    location: distance !== null ? `${distance} km` : (filters.location.city || null),
    gender: null,
    role: null,
    verified: false
  };
}

/** Sites Craigslist par pays, pour construire un lien de recherche local. */
const CRAIGSLIST_SITES = {
  fr: ['paris', 'marseille', 'lyon', 'toulouse', 'nice', 'bordeaux', 'nantes', 'strasbourg'],
  be: ['brussels', 'antwerp'],
  ch: ['geneva', 'zurich', 'lausanne', 'bern'],
  ca: ['montreal', 'quebec', 'toronto', 'ottawa', 'vancouver']
};

/**
 * Choisit le sous-domaine Craigslist le plus proche de la ville saisie.
 * @returns {string}
 */
function craigslistSite() {
  const sites = CRAIGSLIST_SITES[filters.location.country] || CRAIGSLIST_SITES.fr;
  const city = normalizeText(filters.location.city);
  return sites.find(site => city && (city.includes(site) || site.includes(city))) || sites[0];
}

/**
 * Déduit un genre depuis le texte d'une annonce (formats r4r : [25F], F4M…).
 * @param {string} text
 * @returns {string|null}
 */
function inferGender(text) {
  const source = normalizeText(text);
  if (/\bcouple\b|\bc4[mfa]\b/.test(source)) return 'Couple';
  if (/\btrans\b|\bmtf\b|\btgirl\b/.test(source)) return 'Trans (H→F)';
  if (/\bftm\b/.test(source)) return 'Trans (F→H)';
  if (/\bnon[- ]binaire\b|\bnb\b|\benby\b/.test(source)) return 'Non-binaire';
  if (/\bgroupe\b|\bgangbang\b|\bgroup\b/.test(source)) return 'Groupe';
  if (/\[\s*\d{2}\s*f\s*\]|\b\d{2}\s*f\b|\bf4[mfa]\b|\bfemme\b|\bfemale\b/.test(source)) return 'Femme';
  if (/\[\s*\d{2}\s*[mh]\s*\]|\b\d{2}\s*[mh]\b|\b[mh]4[mfa]\b|\bhomme\b|\bmale\b/.test(source)) return 'Homme';
  return null;
}

/** Rôles BDSM reconnus dans le texte d'une annonce. */
const ROLE_TERMS = ['Dominatrice', 'Dominant', 'Soumise', 'Soumis', 'Switch',
  'Amatrice', 'Amateur', 'Maîtresse', 'Esclave'];

/**
 * Déduit un rôle BDSM depuis le texte d'une annonce.
 * @param {string} text
 * @returns {string|null}
 */
function inferRole(text) {
  const found = ROLE_TERMS.find(role => containsTerm(text, role));
  if (found) return found;
  if (containsTerm(text, 'domme') || containsTerm(text, 'domina')) return 'Dominatrice';
  if (containsTerm(text, 'sub') || containsTerm(text, 'submissive')) return 'Soumis';
  return null;
}

/**
 * Récupère la meilleure image disponible pour un post Reddit.
 * @param {Object} post - post.data de l'API Reddit.
 * @returns {string|null}
 */
function redditImage(post) {
  const preview = post.preview && post.preview.images && post.preview.images[0];
  if (preview && preview.source && /^https?:/.test(preview.source.url)) {
    return preview.source.url;
  }
  if (post.thumbnail && /^https?:\/\//.test(post.thumbnail)) return post.thumbnail;
  return null;
}

// =============================================
// Registre des sources
// =============================================
const SOURCES = [
  {
    id: 'serveur',
    name: 'Serveur L\'Antre',
    icon: 'fas fa-satellite-dish',
    note: 'Reddit, fédivers, flux de forums et lieux, agrégés côté serveur — '
      + 'sans dépendre des blocages de ton réseau.',
    searchUrl() {
      const base = getBackendUrl();
      return base ? `${base}/api/health` : 'https://developers.cloudflare.com/workers/';
    },
    async fetchLive() {
      if (!getBackendUrl()) throw new Error('Aucun serveur configuré');

      const { results, sources } = await searchViaBackend();
      const echecs = sources.filter(s => s.status !== 'ok').map(s => s.id);

      if (echecs.length) {
        showNotification(`Serveur : ${echecs.join(', ')} sans réponse.`, 'warning');
      }
      return results;
    }
  },
  {
    id: 'reddit',
    name: 'Reddit',
    icon: 'fab fa-reddit-alien',
    note: 'Annonces r4r publiques — résultats récupérés en direct.',
    searchUrl() {
      const query = encodeURIComponent(buildRedditQuery() || locationCityOrEmpty());
      return `https://www.reddit.com/search/?q=${query}&sort=new&t=year`;
    },
    async fetchLive() {
      const query = buildRedditQuery() || locationCityOrEmpty();
      // Recherche sur tout Reddit : restreindre à une poignée de subs
      // anglophones écartait d'office les annonces francophones.
      const url = 'https://www.reddit.com/search.json'
        + `?q=${encodeURIComponent(query)}&sort=new&t=year&limit=50&raw_json=1`;

      const { data: payload, via } = await fetchJsonResilient(url, {
        timeout: 6000,
        totalBudget: 14000,
        validate: json => json && json.data && Array.isArray(json.data.children)
      });

      if (via !== 'direct') {
        showNotification(`Reddit joint via ${relayLabel(via)}.`, 'info');
      }

      const children = (payload.data && payload.data.children) || [];

      return children
        .map(child => child.data)
        .filter(post => post && !post.stickied)
        .map(post => {
          const text = `${post.title || ''} ${post.selftext || ''}`.trim();
          return {
            type: 'post',
            id: hashId(post.permalink),
            source: 'reddit',
            platform: `Reddit · r/${post.subreddit}`,
            title: post.title || 'Sans titre',
            username: post.author ? `u/${post.author}` : 'Anonyme',
            bio: (post.selftext || '').slice(0, 600),
            link: `https://www.reddit.com${post.permalink}`,
            // Une annonce peut renvoyer vers un site payant : on garde la cible
            // pour pouvoir l'écarter.
            outboundUrl: post.url && !post.is_self ? post.url : null,
            image: redditImage(post),
            date: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
            location: filters.location.city || null,
            gender: inferGender(text),
            role: inferRole(text),
            age: extractAge(text),
            verified: false
          };
        });
    }
  },
  {
    id: 'fetlife',
    name: 'FetLife — profils',
    icon: 'fas fa-mask',
    note: 'Kinksters de ta ville. La recherche porte sur le nom de lieu seul : '
      + 'y ajouter des critères exigerait qu’un profil contienne tous les mots.',
    searchUrl() {
      return `https://fetlife.com/search?q=${encodeURIComponent(baseQuery(0) || 'bdsm')}`;
    }
  },
  {
    id: 'fetlife-groups',
    name: 'FetLife — groupes',
    icon: 'fas fa-users',
    note: 'Les groupes régionaux sont le meilleur point d’entrée : on y annonce '
      + 'les rencontres et on y écrit sans être un inconnu.',
    searchUrl() {
      return `https://fetlife.com/groups/search?q=${encodeURIComponent(baseQuery(0) || 'bdsm')}`;
    }
  },
  {
    id: 'fetlife-events',
    name: 'FetLife — événements',
    icon: 'fas fa-calendar-days',
    note: 'Soirées et munchs à venir. FetLife les liste selon la ville de ton '
      + 'profil : renseigne-la pour que la liste corresponde à ta zone.',
    searchUrl() {
      return 'https://fetlife.com/events';
    }
  },
  {
    id: 'maps',
    name: 'Lieux',
    icon: 'fas fa-map-location-dot',
    note: 'Clubs libertins, saunas et adresses réelles autour de toi.',
    searchUrl() {
      const query = encodeURIComponent(buildPlacesQuery());
      const { lat, lng } = filters.location;
      if (lat !== null && lng !== null) {
        return `https://www.google.com/maps/search/${query}/@${lat},${lng},${radiusToZoom()}z`;
      }
      return `https://www.google.com/maps/search/${query}`;
    },
    async fetchLive() {
      const point = await ensureCoordinates();
      if (!point) throw new Error('Coordonnées inconnues');

      // Rayon plafonné : au-delà, la requête devient trop lourde pour Overpass.
      const radius = Math.min(filters.radius, 100) * 1000;
      const query = `[out:json][timeout:20];(`
        + `nwr["amenity"="swingerclub"](around:${radius},${point.lat},${point.lng});`
        + `nwr["club"="swinger"](around:${radius},${point.lat},${point.lng});`
        + `nwr["leisure"="sauna"](around:${radius},${point.lat},${point.lng});`
        + `nwr["shop"="erotic"](around:${radius},${point.lat},${point.lng});`
        + `nwr["amenity"="nightclub"]["name"~"libertin|echangiste|échangiste|fetish|bdsm|swing",i](around:${radius},${point.lat},${point.lng});`
        + `);out center 60;`;

      // GET plutôt que POST : une requête GET peut passer par un relais.
      const { data: payload } = await fetchJsonResilient(
        `${OVERPASS_ENDPOINT}?data=${encodeURIComponent(query)}`,
        { timeout: 15000, totalBudget: 25000, validate: json => json && Array.isArray(json.elements) }
      );

      return (payload.elements || [])
        .map(element => buildPlace(element, point))
        .filter(Boolean)
        .sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999));
    }
  },
  {
    id: 'forums',
    name: 'Forums libertins',
    icon: 'fas fa-comments',
    note: 'Recherche ciblée sur les forums et petites annonces francophones.',
    searchUrl() {
      const terms = [baseQuery(0), 'forum libertin'].filter(Boolean).join(' ');
      const query = filters.excludePaid ? `${terms} ${blocklistOperators(3)}`.trim() : terms;
      return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    }
  },
  {
    id: 'craigslist',
    name: 'Craigslist',
    icon: 'fas fa-newspaper',
    note: 'Section « activity partners » du site local.',
    searchUrl() {
      return `https://${craigslistSite()}.craigslist.org/search/act?query=${encodeURIComponent(baseQuery(0))}`;
    }
  },
  {
    id: 'web',
    name: 'Recherche web',
    icon: 'fas fa-globe',
    note: 'Requête générale construite à partir de tes filtres.',
    searchUrl() {
      return `https://duckduckgo.com/?q=${encodeURIComponent(buildWebQuery())}`;
    }
  },
  {
    id: 'facebook',
    name: 'Groupes Facebook',
    icon: 'fab fa-facebook',
    note: 'Groupes libertins et BDSM de ta région — c\'est là que s\'organisent '
      + 'les soirées. Gratuit, et tu écris depuis ton compte.',
    searchUrl() {
      const terms = filters.query || [themeTerm(), locationCityOrEmpty()].filter(Boolean).join(' ');
      return `https://www.facebook.com/search/groups/?q=${encodeURIComponent(terms)}`;
    }
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: 'fab fa-instagram',
    note: 'Hashtag local : les comptes amateurs de ta ville s\'y regroupent.',
    searchUrl() {
      const tag = normalizeText(`${themeTerm()}${locationCityOrEmpty()}`).replace(/[^a-z0-9]/g, '');
      return tag
        ? `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`
        : 'https://www.instagram.com/explore/';
    }
  },
  {
    id: 'x',
    name: 'X (Twitter)',
    icon: 'fab fa-x-twitter',
    note: 'Annonces récentes : l\'onglet « Récent » montre ce qui vient d\'être publié.',
    searchUrl() {
      const terms = filters.query || [locationCityOrEmpty(), themeTerm()].filter(Boolean).join(' ');
      return `https://x.com/search?q=${encodeURIComponent(terms)}&f=live`;
    }
  },
  {
    id: 'happn',
    name: 'Happn',
    icon: 'fas fa-heart-circle-bolt',
    note: 'Happn fonctionne par croisement de trajets, sans recherche par mots-clés : '
      + 'l\'app s\'ouvre sur ton compte, les critères ne peuvent pas y être transmis.',
    searchUrl() {
      return 'https://www.happn.com/';
    }
  }
];


/**
 * Ville courante, ou chaîne vide.
 * @returns {string}
 */
function locationCityOrEmpty() {
  return filters.location.city || '';
}

/**
 * Construit la carte « lien de recherche » d'une source.
 * @param {Object} source
 * @param {string} [extraNote]
 * @returns {Object}
 */
function buildLinkCard(source, extraNote) {
  const url = source.searchUrl();
  return {
    type: 'link',
    id: hashId(`${source.id}:${url}`),
    source: source.id,
    platform: source.name,
    icon: source.icon,
    title: `Ouvrir la recherche sur ${source.name}`,
    username: source.name,
    bio: extraNote ? `${source.note} ${extraNote}` : source.note,
    link: url,
    image: null,
    date: null,
    location: filters.location.city || (filters.location.lat !== null ? 'Position GPS' : null),
    gender: null,
    role: null,
    verified: false
  };
}

/**
 * Supprime les doublons (même lien).
 * @param {Object[]} results
 * @returns {Object[]}
 */
function dedupeResults(results) {
  const seen = new Set();
  return results.filter(result => {
    const key = normalizeText(result.link || result.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Trie les résultats selon le critère choisi.
 * Les lieux et les annonces sont classés ensemble ; les cartes « lien de
 * recherche » restent groupées en fin de liste.
 * @param {Object[]} results
 * @returns {Object[]}
 */
function sortResults(results) {
  const found = results.filter(result => result.type !== 'link');
  const links = results.filter(result => result.type === 'link');

  const byDistance = (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity);

  if (filters.sortBy === 'distance') {
    found.sort(byDistance);
  } else if (filters.sortBy === 'source') {
    found.sort((a, b) => String(a.platform).localeCompare(String(b.platform), 'fr'));
  } else if (filters.sortBy === 'recent') {
    found.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  } else {
    // Pertinence : les annonces notées d'abord, puis les lieux par distance.
    found.sort((a, b) => {
      const scoreDiff = (b.score ?? -1) - (a.score ?? -1);
      return scoreDiff !== 0 ? scoreDiff : byDistance(a, b);
    });
  }

  return [...found, ...links];
}

/**
 * Lance la recherche sur toutes les sources activées.
 * @returns {Promise<Object[]>}
 */
async function searchAll() {
  updateFilters();

  if (!filters.location.city && filters.location.lat === null) {
    showNotification('Indique une ville ou active la géolocalisation.', 'error');
    return [];
  }

  const activeSources = SOURCES.filter(source => filters.sources.includes(source.id));
  if (!activeSources.length) {
    showNotification('Aucune source sélectionnée.', 'error');
    return [];
  }

  const liveSources = activeSources.filter(source => typeof source.fetchLive === 'function');

  // Les liens de recherche ne dépendent d'aucun réseau : ils s'affichent tout de
  // suite. Une source en direct lente ou bloquée ne doit jamais retarder — ni
  // faire disparaître — le reste des résultats.
  const linkCards = activeSources
    .map(source => buildLinkCard(source))
    .filter(card => !(filters.excludePaid && isBlockedUrl(card.link)));
  renderResults(sortResults(dedupeResults([...linkCards])), {
    pendingMessage: liveSources.length
      ? `Interrogation de ${liveSources.map(source => source.name).join(', ')}…`
      : ''
  });

  const posts = [];
  const failed = [];

  // Journal de la recherche : sans lui, « ça ne trouve rien » reste
  // indiagnosticable une fois l'app sur le téléphone.
  lastDiagnostics = {
    startedAt: new Date().toISOString(),
    city: filters.location.city,
    coords: filters.location.lat !== null
      ? `${filters.location.lat.toFixed(3)}, ${filters.location.lng.toFixed(3)}` : null,
    radius: filters.radius,
    mode: filters.searchMode,
    query: filters.query || '(calculée)',
    sources: [],
    // Les URL réellement ouvertes : c'est là qu'on voit si une requête est
    // trop étroite pour renvoyer quoi que ce soit.
    urls: activeSources.map(source => `${source.name} → ${decodeURIComponent(source.searchUrl())}`)
  };

  if (liveSources.length) {
    const started = liveSources.map(() => Date.now());

    try {
      const settled = await Promise.allSettled(
        liveSources.map((source, index) => {
          started[index] = Date.now();
          return source.fetchLive();
        }));

      settled.forEach((outcome, index) => {
        const source = liveSources[index];
        const ms = Date.now() - started[index];

        if (outcome.status === 'fulfilled') {
          const raw = outcome.value || [];
          // Exclusions dures d'abord (pros, âge, ancienneté), puis notation.
          const kept = rankResults(raw.filter(matchesFilters));
          posts.push(...kept);

          lastDiagnostics.sources.push({
            name: source.name,
            status: 'ok',
            detail: `${raw.length} reçu(s), ${kept.length} retenu(s) après filtres`,
            ms
          });
          showNotification(`${source.name} : ${kept.length} résultat(s) sur ${raw.length}.`,
            kept.length ? 'success' : 'info');
        } else {
          failed.push(source.id);
          console.warn(`Source ${source.id} indisponible :`, outcome.reason);

          lastDiagnostics.sources.push({
            name: source.name,
            status: 'échec',
            detail: String((outcome.reason && outcome.reason.message) || outcome.reason),
            ms
          });
          showNotification(`${source.name} injoignable — le lien de recherche reste utilisable.`, 'warning');
        }
      });
    } catch (error) {
      // Filet de sécurité : même un imprévu ici ne doit pas vider la liste.
      console.error('Phase de récupération interrompue :', error);
      lastDiagnostics.sources.push({ name: 'Récupération', status: 'échec', detail: error.message, ms: 0 });
      showNotification('Récupération directe interrompue — les liens restent disponibles.', 'warning');
    }
  }

  let finalResults = dedupeResults([
    ...posts,
    ...activeSources
      .map(source => buildLinkCard(source, failed.includes(source.id) ? '(récupération directe indisponible)' : ''))
      .filter(card => !(filters.excludePaid && isBlockedUrl(card.link)))
  ]);

  if (filters.vision.enabled && posts.length) {
    try {
      finalResults = await analyzeResultImages(finalResults);
    } catch (error) {
      console.warn('Analyse d\'image ignorée :', error);
    }
  }

  finalResults = sortResults(finalResults);

  lastDiagnostics.total = finalResults.length;
  lastDiagnostics.direct = posts.length;
  lastDiagnostics.links = finalResults.length - posts.length;

  renderResults(finalResults);
  renderDiagnostics(lastDiagnostics);
  saveToHistory(filters, posts.length);

  return finalResults;
}

/** Journal de la dernière recherche, affiché dans le bloc « Diagnostic ». */
let lastDiagnostics = null;

window.SOURCES = SOURCES;
window.getLastDiagnostics = () => lastDiagnostics;
window.searchAll = searchAll;
window.sortResults = sortResults;
window.dedupeResults = dedupeResults;
window.buildLinkCard = buildLinkCard;
window.inferGender = inferGender;
window.inferRole = inferRole;
