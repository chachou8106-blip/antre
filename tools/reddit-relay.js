/**
 * Relais personnel pour L'Antre — Cloudflare Worker.
 *
 * À quoi ça sert : quand ton réseau bloque reddit.com, ou qu'une API refuse le
 * CORS, l'app passe par ce relais. Comme il tourne sur ton propre compte, tes
 * recherches ne transitent chez aucun tiers.
 *
 * Déploiement (gratuit, ~3 minutes) :
 *   1. Crée un compte sur https://dash.cloudflare.com puis ouvre
 *      « Workers & Pages » → « Create » → « Start with Hello World! ».
 *   2. Remplace tout le code de l'éditeur par ce fichier, puis « Deploy ».
 *   3. Copie l'adresse du worker (https://<nom>.<compte>.workers.dev).
 *   4. Dans L'Antre : « Exclusions → Relais réseau », colle l'adresse, Enregistrer.
 *
 * Usage : GET https://<ton-worker>/?url=<url encodée>
 */

/** Seuls ces domaines peuvent être relayés — le worker n'est pas un proxy ouvert. */
const ALLOWED_HOSTS = [
  'www.reddit.com',
  'old.reddit.com',
  'api.reddit.com',
  'overpass-api.de',
  'overpass.kumi.systems',
  'nominatim.openstreetmap.org'
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Accept, Content-Type'
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'GET') {
      return json({ error: 'Méthode non autorisée' }, 405);
    }

    const target = new URL(request.url).searchParams.get('url');
    if (!target) {
      return json({ error: 'Paramètre « url » manquant' }, 400);
    }

    let parsed;
    try {
      parsed = new URL(target);
    } catch (error) {
      return json({ error: 'URL invalide' }, 400);
    }

    if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.includes(parsed.hostname)) {
      return json({ error: `Domaine non autorisé : ${parsed.hostname}` }, 403);
    }

    try {
      const upstream = await fetch(parsed.toString(), {
        headers: {
          // Reddit refuse les requêtes sans User-Agent identifiable.
          'User-Agent': 'l-antre-relay/1.0 (personal use)',
          Accept: 'application/json'
        },
        cf: { cacheTtl: 60, cacheEverything: true }
      });

      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
          'Cache-Control': 'public, max-age=60'
        }
      });
    } catch (error) {
      return json({ error: `Relais en échec : ${error.message}` }, 502);
    }
  }
};

/**
 * Réponse JSON avec les en-têtes CORS.
 * @param {Object} body
 * @param {number} status
 * @returns {Response}
 */
function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}
