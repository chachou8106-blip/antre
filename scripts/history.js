// Historique des recherches (localStorage)

const HISTORY_KEY = 'lAntreHistory';
const HISTORY_LIMIT = 20;

/**
 * Lit l'historique enregistré.
 * @returns {Object[]}
 */
function getHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY));
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    console.warn('Historique illisible, réinitialisation :', error);
    return [];
  }
}

/**
 * Enregistre une recherche dans l'historique.
 * @param {Object} usedFilters - L'objet `filters` au moment de la recherche.
 * @param {number} resultCount - Nombre d'annonces récupérées.
 */
function saveToHistory(usedFilters, resultCount) {
  const history = getHistory();

  history.unshift({
    id: Date.now(),
    date: new Date().toISOString(),
    resultCount,
    filters: {
      location: { ...usedFilters.location },
      radius: usedFilters.radius,
      sortBy: usedFilters.sortBy,
      gender: [...usedFilters.gender],
      role: [...usedFilters.role],
      practices: [...usedFilters.practices],
      attributes: [...usedFilters.attributes],
      sources: [...usedFilters.sources],
      ageMin: usedFilters.ageMin,
      ageMax: usedFilters.ageMax,
      excludePros: usedFilters.excludePros,
      excludeVerified: usedFilters.excludeVerified,
      excludeNoPic: usedFilters.excludeNoPic,
      excludeOld: usedFilters.excludeOld,
      excludePaid: usedFilters.excludePaid,
      searchMode: usedFilters.searchMode
    }
  });

  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
  } catch (error) {
    console.warn('Impossible d\'enregistrer l\'historique :', error);
  }

  updateHistoryDisplay();
}

/**
 * Redessine la liste de l'historique.
 */
function updateHistoryDisplay() {
  const container = document.getElementById('history');
  if (!container) return;

  const history = getHistory();
  container.innerHTML = '';

  if (!history.length) {
    container.innerHTML = '<p class="no-results">Aucune recherche dans l\'historique.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();

  history.forEach(entry => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.tabIndex = 0;
    item.setAttribute('role', 'button');

    const place = entry.filters.location.city
      || (entry.filters.location.lat !== null ? 'Position GPS' : 'Non précisée');

    item.innerHTML = `
      <div class="history-header">
        <span class="history-date"><i class="fas fa-clock"></i> ${escapeHtml(formatDate(entry.date) || entry.date)}</span>
        <span class="history-count">${escapeHtml(entry.resultCount)} annonce(s)</span>
      </div>
      <div class="history-filters">
        <p><strong>Zone :</strong> ${escapeHtml(place)} — ${escapeHtml(entry.filters.radius)} km</p>
        <p><strong>Genres :</strong> ${escapeHtml(entry.filters.gender.join(', ') || 'Tous')}</p>
        <p><strong>Rôles :</strong> ${escapeHtml(entry.filters.role.join(', ') || 'Tous')}</p>
        ${entry.filters.practices.length
          ? `<p><strong>Pratiques :</strong> ${escapeHtml(entry.filters.practices.join(', '))}</p>` : ''}
        ${entry.filters.attributes.length
          ? `<p><strong>Attributs :</strong> ${escapeHtml(entry.filters.attributes.join(', '))}</p>` : ''}
      </div>
    `;

    const reload = () => {
      loadFilters(entry.filters);
      showNotification('Filtres rechargés depuis l\'historique.', 'info');
      document.getElementById('search-button')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    item.addEventListener('click', reload);
    item.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        reload();
      }
    });

    fragment.appendChild(item);
  });

  container.appendChild(fragment);
}

/**
 * Coche les options d'une liste de cases à cocher selon les valeurs fournies.
 * @param {string} name - Attribut name des cases.
 * @param {string[]} values
 */
function applyCheckboxGroup(name, values) {
  if (!Array.isArray(values)) return;
  document.querySelectorAll(`input[name="${name}"]`).forEach(checkbox => {
    checkbox.checked = values.includes(checkbox.value);
  });
}

/**
 * Sélectionne les options d'un `<select multiple>`.
 * @param {string} id
 * @param {string[]} values
 */
function applyMultiSelect(id, values) {
  const select = document.getElementById(id);
  if (!select || !Array.isArray(values)) return;
  Array.from(select.options).forEach(option => {
    option.selected = values.includes(option.value);
  });
}

/**
 * Recharge des filtres sauvegardés dans l'interface.
 * @param {Object} savedFilters
 */
function loadFilters(savedFilters) {
  if (!savedFilters) return;

  if (savedFilters.location) {
    filters.location = { ...filters.location, ...savedFilters.location };
    const cityInput = document.getElementById('city-input');
    if (cityInput) cityInput.value = savedFilters.location.city || '';
    const countrySelect = document.getElementById('country-select');
    if (countrySelect && savedFilters.location.country) {
      countrySelect.value = savedFilters.location.country;
    }
  }

  const radiusSelect = document.getElementById('radius-select');
  if (radiusSelect && savedFilters.radius) radiusSelect.value = String(savedFilters.radius);

  const sortSelect = document.getElementById('sort-select');
  if (sortSelect && savedFilters.sortBy) sortSelect.value = savedFilters.sortBy;

  applyMultiSelect('gender-select', savedFilters.gender);
  applyMultiSelect('role-select', savedFilters.role);
  applyCheckboxGroup('practice', savedFilters.practices);
  applyCheckboxGroup('attribute', savedFilters.attributes);
  applyCheckboxGroup('source', savedFilters.sources);

  const ageMin = document.getElementById('age-min');
  const ageMax = document.getElementById('age-max');
  if (ageMin && savedFilters.ageMin !== undefined) ageMin.value = String(savedFilters.ageMin);
  if (ageMax && savedFilters.ageMax !== undefined) ageMax.value = String(savedFilters.ageMax);

  [['exclude-pros', 'excludePros'], ['exclude-verified', 'excludeVerified'],
    ['exclude-no-pic', 'excludeNoPic'], ['exclude-old', 'excludeOld'],
    ['exclude-paid', 'excludePaid']].forEach(([id, key]) => {
    const element = document.getElementById(id);
    if (element && savedFilters[key] !== undefined) element.checked = savedFilters[key];
  });

  const searchModeSelect = document.getElementById('search-mode');
  if (searchModeSelect && savedFilters.searchMode) {
    searchModeSelect.value = savedFilters.searchMode;
  }

  updateFilters();
  enableSearchButton();
}

window.getHistory = getHistory;
window.saveToHistory = saveToHistory;
window.updateHistoryDisplay = updateHistoryDisplay;
window.loadFilters = loadFilters;
