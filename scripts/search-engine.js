// Moteur de recherche de L'Antre : pondération, score et classement.
//
// L'ancienne logique était binaire — une annonce devait contenir au moins un
// mot de chaque groupe coché, sinon elle disparaissait. Résultat : presque tout
// était écarté, parce qu'une annonce réelle n'écrit jamais tous les mots-clés
// d'une grille de filtres.
//
// Ici, les critères ne suppriment plus : ils notent. Chaque annonce reçoit un
// score, les mieux notées remontent, et le mode de recherche décide seulement
// du minimum exigé pour rester dans la liste.

/** Poids de chaque famille de critères dans le score. */
const CRITERION_WEIGHTS = {
  city: 3.5,
  role: 3,
  gender: 2.5,
  practice: 2,
  attribute: 1.2
};

/** Signaux d'une annonce qui cherche vraiment à rencontrer (et non à discuter). */
const INTENT_TERMS = ['cherche', 'recherche', 'dispo', 'disponible', 'ce soir', 'week-end',
  'weekend', 'rencontre', 'rdv', 'mp', 'dm', 'contacte', 'contactez', 'écris', 'ecris',
  'looking', 'hosting', 'tonight', 'today'];

/**
 * Construit la liste des critères actifs à partir des filtres.
 * @returns {{group: string, term: string, weight: number}[]}
 */
function buildCriteria() {
  const criteria = [];

  const add = (group, terms) => {
    (terms || []).forEach(term => {
      if (term) criteria.push({ group, term, weight: CRITERION_WEIGHTS[group] || 1 });
    });
  };

  if (filters.location.city) add('city', [filters.location.city]);
  add('role', filters.role);
  add('gender', filters.gender);
  add('practice', filters.practices);
  add('attribute', filters.attributes);

  return criteria;
}

/**
 * Bonus de fraîcheur : une annonce d'hier vaut mieux qu'une de l'an dernier.
 * @param {string} isoDate
 * @returns {number}
 */
function recencyBonus(isoDate) {
  if (!isoDate) return 0;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 0;

  const days = (Date.now() - date.getTime()) / 86400000;
  if (days <= 2) return 3;
  if (days <= 7) return 2;
  if (days <= 30) return 1;
  return 0;
}

/**
 * Bonus d'intention : l'annonce propose-t-elle un contact concret ?
 * @param {string} text
 * @returns {number}
 */
function intentBonus(text) {
  const hits = INTENT_TERMS.filter(term => containsTerm(text, term)).length;
  return Math.min(hits, 3);
}

/**
 * Score maximum atteignable, pour exprimer la correspondance en pourcentage.
 * @param {Object[]} criteria
 * @returns {number}
 */
function maxScore(criteria) {
  return criteria.reduce((total, criterion) => total + criterion.weight, 0) + 3 + 3;
}

/**
 * Note une annonce au regard des critères actifs.
 * @param {Object} result
 * @param {Object[]} criteria
 * @returns {{score: number, matched: string[], groups: Set<string>, percent: number}}
 */
function scoreResult(result, criteria) {
  const text = `${result.title || ''} ${result.bio || ''}`;
  const matched = [];
  const groups = new Set();
  let score = 0;

  criteria.forEach(criterion => {
    // Le genre et le rôle déduits comptent autant qu'une mention dans le texte.
    const structured = criterion.group === 'gender' ? result.gender
      : criterion.group === 'role' ? result.role
        : null;

    const hit = (structured && containsTerm(structured, criterion.term))
      || containsTerm(text, criterion.term);

    if (hit) {
      score += criterion.weight;
      matched.push(criterion.term);
      groups.add(criterion.group);
    }
  });

  score += recencyBonus(result.date);
  score += intentBonus(text);

  const ceiling = maxScore(criteria);
  return {
    score,
    matched,
    groups,
    percent: ceiling ? Math.min(100, Math.round((score / ceiling) * 100)) : 0
  };
}

/**
 * Familles de critères réellement cochées par l'utilisateur.
 * @param {Object[]} criteria
 * @returns {Set<string>}
 */
function activeGroups(criteria) {
  return new Set(criteria.map(criterion => criterion.group));
}

/**
 * Une annonce passe-t-elle le seuil du mode de recherche choisi ?
 * @param {Object} scored - Résultat de scoreResult.
 * @param {Set<string>} groups - Familles de critères actives.
 * @returns {boolean}
 */
function passesSearchMode(scored, groups) {
  if (filters.searchMode === 'strict') {
    return Array.from(groups).every(group => scored.groups.has(group));
  }
  if (filters.searchMode === 'cible') {
    return scored.matched.length > 0;
  }
  return true; // mode « large » : on garde tout et on classe
}

/**
 * Note, filtre selon le mode, et annote les résultats.
 * Les lieux et les liens de recherche ne sont jamais notés ni écartés.
 * @param {Object[]} results
 * @returns {Object[]}
 */
function rankResults(results) {
  const criteria = buildCriteria();
  const groups = activeGroups(criteria);

  return results.filter(result => {
    if (result.type !== 'post') return true;

    const scored = scoreResult(result, criteria);
    result.score = scored.score;
    result.percent = scored.percent;
    result.matched = scored.matched;

    return passesSearchMode(scored, groups);
  });
}

window.buildCriteria = buildCriteria;
window.scoreResult = scoreResult;
window.rankResults = rankResults;
window.CRITERION_WEIGHTS = CRITERION_WEIGHTS;
