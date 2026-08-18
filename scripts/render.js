// Rendu des cartes et de la modale — définition unique, utilisée par les
// résultats comme par les favoris.

/**
 * Affiche l'indicateur de chargement dans la zone de résultats.
 * @param {string} message
 */
function renderLoading(message) {
  const container = document.getElementById('results');
  if (!container) return;
  container.innerHTML = `<div class="loading"><div class="spinner"></div><p>${escapeHtml(message)}</p></div>`;
}

/**
 * Indique si un lien est déjà en favori.
 * @param {string} link
 * @returns {boolean}
 */
function isFavorite(link) {
  return getFavorites().some(favorite => favorite.link === link);
}

/**
 * Construit le bloc de métadonnées d'une carte.
 * @param {Object} result
 * @returns {string} - HTML échappé.
 */
function metaHtml(result) {
  const items = [];

  if (typeof result.percent === 'number') {
    const level = result.percent >= 60 ? 'high' : result.percent >= 30 ? 'mid' : 'low';
    items.push(`<span class="tag-score ${level}"><i class="fas fa-bullseye"></i> `
      + `${escapeHtml(result.percent)} %</span>`);
  }
  if (result.location) {
    items.push(`<span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(result.location)}</span>`);
  }
  if (result.openingHours) {
    items.push(`<span><i class="fas fa-clock"></i> ${escapeHtml(result.openingHours)}</span>`);
  }
  items.push(`<span><i class="fas fa-globe"></i> ${escapeHtml(result.platform || 'Inconnu')}</span>`);
  if (result.gender) {
    items.push(`<span><i class="fas fa-venus-mars"></i> ${escapeHtml(result.gender)}</span>`);
  }
  if (result.role) {
    items.push(`<span><i class="fas fa-theater-masks"></i> ${escapeHtml(result.role)}</span>`);
  }
  if (result.age) {
    items.push(`<span><i class="fas fa-birthday-cake"></i> ${escapeHtml(result.age)} ans</span>`);
  }
  const date = formatDate(result.date);
  if (date) {
    items.push(`<span><i class="fas fa-clock"></i> ${escapeHtml(date)}</span>`);
  }
  (result.labels || []).slice(0, 3).forEach(label => {
    items.push(`<span class="tag-vision"><i class="fas fa-eye"></i> ${escapeHtml(label.name)}</span>`);
  });
  (result.matched || []).slice(0, 5).forEach(term => {
    items.push(`<span class="tag-match"><i class="fas fa-check"></i> ${escapeHtml(term)}</span>`);
  });

  return `<div class="result-meta">${items.join('')}</div>`;
}

/**
 * Actions propres à un lieu réel : itinéraire et appel.
 * @param {Object} result
 * @returns {string} - HTML échappé.
 */
function placeActionsHtml(result) {
  if (result.type !== 'place') return '';
  const actions = [];

  if (result.lat !== undefined && result.lng !== undefined) {
    const itinerary = `https://www.google.com/maps/dir/?api=1&destination=${result.lat},${result.lng}`;
    actions.push(`<a href="${safeUrl(itinerary)}" target="_blank" rel="noopener noreferrer"
      class="btn btn-secondary"><i class="fas fa-diamond-turn-right"></i> Itinéraire</a>`);
  }
  if (result.phone) {
    const tel = String(result.phone).replace(/[^+0-9]/g, '');
    actions.push(`<a href="tel:${escapeHtml(tel)}" class="btn btn-secondary">
      <i class="fas fa-phone"></i> Appeler</a>`);
  }

  return actions.length ? `<div class="place-actions">${actions.join('')}</div>` : '';
}

/**
 * Crée la carte DOM d'un résultat.
 * @param {Object} result
 * @param {{favorite?: boolean}} [options]
 * @returns {HTMLElement}
 */
function createResultCard(result, options = {}) {
  const card = document.createElement('div');
  card.className = result.type === 'link' ? 'result-card link-card' : 'result-card';

  const favoriteButton = document.createElement('button');
  favoriteButton.className = 'favorite-button';
  favoriteButton.type = 'button';
  favoriteButton.title = 'Ajouter aux favoris';
  favoriteButton.setAttribute('aria-label', 'Ajouter aux favoris');
  favoriteButton.innerHTML = '<i class="fas fa-heart"></i>';
  if (options.favorite || isFavorite(result.link)) favoriteButton.classList.add('favorited');
  favoriteButton.addEventListener('click', event => {
    event.stopPropagation();
    toggleFavorite(result);
    favoriteButton.classList.toggle('favorited');
  });
  card.appendChild(favoriteButton);

  if (result.type === 'link' || result.type === 'place') {
    const badge = document.createElement('div');
    badge.className = result.type === 'place' ? 'link-badge place-badge' : 'link-badge';
    badge.innerHTML = `<i class="${escapeHtml(result.icon || 'fas fa-link')}"></i>`;
    card.appendChild(badge);
  } else {
    const image = document.createElement('img');
    image.loading = 'lazy';
    image.alt = '';
    image.src = result.image || 'assets/default-profile.png';
    image.addEventListener('error', () => { image.src = 'assets/default-profile.png'; }, { once: true });
    card.appendChild(image);
  }

  const info = document.createElement('div');
  info.className = 'result-info';
  info.innerHTML = `
    <h3>${escapeHtml(result.title || result.username || 'Anonyme')}</h3>
    ${result.type !== 'link' && result.username
      ? `<p class="result-author">${escapeHtml(result.username)}</p>` : ''}
    <p class="bio">${escapeHtml(result.bio || 'Aucune description')}</p>
    ${metaHtml(result)}
    <a href="${safeUrl(result.link)}" target="_blank" rel="noopener noreferrer nofollow"
       class="btn btn-secondary">
      <i class="fas fa-external-link-alt"></i>
      ${result.type === 'link' ? 'Ouvrir la recherche'
        : result.type === 'place' ? 'Voir le lieu' : "Voir l'annonce"}
    </a>
    ${placeActionsHtml(result)}
  `;
  info.querySelectorAll('a').forEach(anchor =>
    anchor.addEventListener('click', event => event.stopPropagation()));
  card.appendChild(info);

  card.addEventListener('click', () => showProfileModal(result));
  return card;
}

/**
 * Affiche la liste de résultats.
 * @param {Object[]} results
 * @param {{pendingMessage?: string}} [options] - Message affiché tant qu'une
 *   source en direct est encore interrogée.
 */
function renderResults(results, options = {}) {
  const container = document.getElementById('results');
  const counter = document.getElementById('result-count');
  if (!container) return;

  container.innerHTML = '';
  const posts = results.filter(result => result.type !== 'link');
  const links = results.length - posts.length;

  // Le compteur reflète ce qui est réellement à l'écran : afficher « 0 » alors
  // que dix pistes sont affichées se lit comme un échec de la recherche.
  if (counter) counter.textContent = String(results.length);

  if (!results.length) {
    container.innerHTML = '<p class="no-results">Aucun résultat. Élargis tes critères ou change de source.</p>';
    return;
  }

  if (options.pendingMessage) {
    const pending = document.createElement('p');
    pending.className = 'results-notice pending';
    pending.innerHTML = `<span class="spinner-inline"></span> ${escapeHtml(options.pendingMessage)}`;
    container.appendChild(pending);
  } else {
    const notice = document.createElement('p');
    notice.className = 'results-notice';
    notice.textContent = posts.length
      ? `${posts.length} résultat(s) récupéré(s) en direct, et ${links} recherche(s) prêtes à ouvrir.`
      : `${links} recherche(s) prêtes à ouvrir, déjà remplies avec tes critères. `
        + 'Aucune source n\'a pu être interrogée en direct — voir le diagnostic sous les résultats.';
    container.appendChild(notice);
  }

  const fragment = document.createDocumentFragment();
  results.forEach(result => fragment.appendChild(createResultCard(result)));
  container.appendChild(fragment);
}

/**
 * Met en forme le journal de la dernière recherche.
 * @param {Object} diagnostics
 * @returns {string} - Texte brut, copiable.
 */
function diagnosticsToText(diagnostics) {
  if (!diagnostics) return 'Aucune recherche lancée.';

  const lines = [
    `L'Antre ${APP_VERSION}`,
    `Zone : ${diagnostics.city || '—'}${diagnostics.coords ? ` (${diagnostics.coords})` : ''}`
      + ` · rayon ${diagnostics.radius} km · mode ${diagnostics.mode}`,
    `Total affiché : ${diagnostics.total} (${diagnostics.direct} en direct, ${diagnostics.links} liens)`,
    ''
  ];

  diagnostics.sources.forEach(source => {
    lines.push(`${source.status === 'ok' ? '[ok]' : '[échec]'} ${source.name} — ${source.detail} (${source.ms} ms)`);
  });

  if (!diagnostics.sources.length) {
    lines.push('Aucune source interrogeable en direct n\'était activée.');
  }

  if (diagnostics.urls && diagnostics.urls.length) {
    lines.push('', `Requête : ${diagnostics.query}`, '', 'Recherches ouvertes :');
    diagnostics.urls.forEach(url => lines.push(`  ${url}`));
  }

  return lines.join('\n');
}

/**
 * Affiche le bloc « Diagnostic de la dernière recherche ».
 * @param {Object} diagnostics
 */
function renderDiagnostics(diagnostics) {
  const block = document.getElementById('diagnostics');
  const body = document.getElementById('diagnostics-body');
  if (!block || !body) return;

  block.hidden = false;
  body.textContent = diagnosticsToText(diagnostics);
}

/**
 * Affiche la modale de détail d'un résultat.
 * @param {Object} result
 */
function showProfileModal(result) {
  const modal = document.getElementById('profile-modal');
  const body = document.getElementById('modal-body');
  if (!modal || !body) return;

  const favorited = isFavorite(result.link);
  const date = formatDate(result.date);

  body.innerHTML = `
    ${result.type === 'link' || result.type === 'place'
      ? `<div class="modal-badge"><i class="${escapeHtml(result.icon || 'fas fa-link')}"></i></div>`
      : `<img src="${safeUrl(result.image) === '#' ? 'assets/default-profile.png' : safeUrl(result.image)}"
              alt="" onerror="this.src='assets/default-profile.png';">`}
    <h2>${escapeHtml(result.title || result.username || 'Anonyme')}</h2>
    <p><strong>Source :</strong> ${escapeHtml(result.platform || 'Inconnue')}</p>
    ${result.username && result.type !== 'link'
      ? `<p><strong>Auteur :</strong> ${escapeHtml(result.username)}</p>` : ''}
    <p><strong>Description :</strong> ${escapeHtml(result.bio || 'Aucune description')}</p>
    ${result.location ? `<p><strong>Zone :</strong> ${escapeHtml(result.location)}</p>` : ''}
    ${result.address ? `<p><strong>Adresse :</strong> ${escapeHtml(result.address)}</p>` : ''}
    ${result.phone ? `<p><strong>Téléphone :</strong> ${escapeHtml(result.phone)}</p>` : ''}
    ${result.openingHours ? `<p><strong>Horaires :</strong> ${escapeHtml(result.openingHours)}</p>` : ''}
    ${typeof result.percent === 'number'
      ? `<p><strong>Correspondance :</strong> ${escapeHtml(result.percent)} %`
        + `${(result.matched || []).length ? ` (${escapeHtml(result.matched.join(', '))})` : ''}</p>`
      : ''}
    ${result.gender ? `<p><strong>Genre :</strong> ${escapeHtml(result.gender)}</p>` : ''}
    ${result.role ? `<p><strong>Rôle :</strong> ${escapeHtml(result.role)}</p>` : ''}
    ${result.age ? `<p><strong>Âge annoncé :</strong> ${escapeHtml(result.age)} ans</p>` : ''}
    ${date ? `<p><strong>Publié :</strong> ${escapeHtml(date)}</p>` : ''}
    ${(result.labels || []).length
      ? `<p><strong>Analyse d'image :</strong> ${escapeHtml(result.labels.map(l => l.name).join(', '))}</p>`
      : ''}
    <div class="modal-actions">
      <a href="${safeUrl(result.link)}" target="_blank" rel="noopener noreferrer nofollow"
         class="btn btn-primary">
        <i class="fas fa-external-link-alt"></i>
        ${result.type === 'place' ? 'Ouvrir la fiche' : `Ouvrir sur ${escapeHtml(result.platform || 'le site')}`}
      </a>
      ${placeActionsHtml(result)}
      <button type="button" id="modal-favorite" class="btn btn-secondary">
        <i class="fas fa-heart"></i> ${favorited ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      </button>
    </div>
  `;

  const favoriteButton = document.getElementById('modal-favorite');
  if (favoriteButton) {
    favoriteButton.addEventListener('click', () => {
      toggleFavorite(result);
      closeModal();
    });
  }

  modal.classList.add('open');
  document.body.classList.add('modal-open');
}

/** Ferme la modale. */
function closeModal() {
  const modal = document.getElementById('profile-modal');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.classList.remove('modal-open');
}

/** Branche la fermeture de la modale (croix, clic extérieur, Échap). */
function setupModal() {
  const modal = document.getElementById('profile-modal');
  if (!modal) return;

  const closeButton = modal.querySelector('.close-modal');
  if (closeButton) closeButton.addEventListener('click', closeModal);

  modal.addEventListener('click', event => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeModal();
  });
}

window.renderLoading = renderLoading;
window.renderDiagnostics = renderDiagnostics;
window.diagnosticsToText = diagnosticsToText;
window.renderResults = renderResults;
window.createResultCard = createResultCard;
window.showProfileModal = showProfileModal;
window.closeModal = closeModal;
window.setupModal = setupModal;
window.isFavorite = isFavorite;
