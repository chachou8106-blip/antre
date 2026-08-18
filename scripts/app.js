// Point d'entrée de L'Antre : câblage de l'interface.

/**
 * Version affichée en pied de page et dans le diagnostic. Sans elle, impossible
 * de savoir si l'appareil tourne bien sur la dernière mise à jour.
 */
const APP_VERSION = 'v12';

/**
 * Enregistre le service worker (mode hors-ligne + installation PWA).
 * Chemin relatif : l'app est servie depuis un sous-dossier sur GitHub Pages.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .catch(error => console.warn('Service worker non enregistré :', error));
  });
}

/**
 * Lance une recherche en protégeant contre les clics répétés.
 */
let searchInFlight = false;
async function runSearch() {
  if (searchInFlight) return;
  searchInFlight = true;

  const buttons = [document.getElementById('search-button'), document.getElementById('refresh-button')];
  buttons.forEach(button => { if (button) button.disabled = true; });

  try {
    await searchAll();
  } catch (error) {
    console.error('Recherche interrompue :', error);
    showNotification('La recherche a échoué. Réessaie.', 'error');
  } finally {
    searchInFlight = false;
    buttons.forEach(button => { if (button) button.disabled = false; });
    enableSearchButton();
  }
}

/**
 * Vide la zone de résultats.
 */
function clearResults() {
  const container = document.getElementById('results');
  const counter = document.getElementById('result-count');
  if (container) container.innerHTML = '<p class="no-results">Aucun résultat à afficher.</p>';
  if (counter) counter.textContent = '0';

  // Le diagnostic décrit la recherche effacée : le laisser serait trompeur.
  const diagnostics = document.getElementById('diagnostics');
  if (diagnostics) {
    diagnostics.hidden = true;
    diagnostics.open = false;
  }

  showNotification('Résultats effacés.', 'info');
}

/**
 * Efface historique et favoris.
 */
function clearAllData() {
  if (!confirm('Effacer tout l\'historique et tous les favoris ? Cette action est définitive.')) return;

  localStorage.removeItem('lAntreHistory');
  localStorage.removeItem('lAntreFavorites');
  updateHistoryDisplay();
  updateFavoritesDisplay();
  showNotification('Données locales effacées.', 'success');
}

/**
 * Affiche ou masque les options d'analyse d'image.
 */
function syncVisionOptions() {
  const enabled = document.getElementById('vision-enabled');
  const options = document.getElementById('vision-options');
  if (!enabled || !options) return;

  options.hidden = !enabled.checked;
  if (enabled.checked) {
    // Précharger le modèle pour que la première recherche ne bloque pas.
    ensureVisionModel().catch(() => {});
  }
}

/**
 * Met à jour le compteur de sites bannis affiché dans le résumé.
 */
function syncBlocklistCount() {
  const counter = document.getElementById('blocklist-count');
  if (counter) counter.textContent = String(getBlocklist().length);
}

/**
 * Branche l'édition de la liste des sites bannis.
 */
function setupBlocklistControls() {
  renderBlocklistField();
  syncBlocklistCount();

  document.getElementById('blocklist-save')?.addEventListener('click', () => {
    const field = document.getElementById('blocklist-field');
    if (!field) return;

    saveBlocklist(field.value.split('\n'));
    renderBlocklistField();
    syncBlocklistCount();
    showNotification(`${getBlocklist().length} site(s) banni(s) enregistré(s).`, 'success');
  });

  document.getElementById('blocklist-reset')?.addEventListener('click', () => {
    saveBlocklist([...DEFAULT_BLOCKLIST]);
    renderBlocklistField();
    syncBlocklistCount();
    showNotification('Liste par défaut rétablie.', 'info');
  });
}

/**
 * Branche la configuration du relais réseau personnel.
 */
function setupRelayControls() {
  const field = document.getElementById('relay-field');
  const state = document.getElementById('relay-state');

  const sync = () => {
    const custom = getCustomRelay();
    if (field) field.value = custom || '';
    if (state) state.textContent = custom ? '(relais personnel actif)' : '(automatique)';
  };

  sync();

  document.getElementById('relay-save')?.addEventListener('click', () => {
    if (!field) return;

    if (setCustomRelay(field.value)) {
      sync();
      showNotification(field.value.trim()
        ? 'Relais personnel enregistré.'
        : 'Relais personnel retiré.', 'success');
    } else {
      showNotification('Adresse invalide : elle doit commencer par https://', 'error');
    }
  });

  document.getElementById('relay-clear')?.addEventListener('click', () => {
    setCustomRelay('');
    sync();
    showNotification('Retour au mode automatique.', 'info');
  });

  document.getElementById('relay-test')?.addEventListener('click', async () => {
    const report = document.getElementById('relay-health');
    if (!report) return;

    report.hidden = false;
    report.textContent = 'Test en cours…';

    try {
      const checks = await checkBackendHealth();
      report.textContent = checks
        .map(c => `${c.status === 'ok' ? '[ok]' : '[échec]'} ${c.label} — `
          + `${c.status === 'ok' ? `${c.count} résultat(s)` : c.detail} (${c.ms} ms)`)
        .join('\n');
      showNotification('Sources testées.', 'success');
    } catch (error) {
      report.textContent = `Échec : ${error.message}`;
      showNotification(`Test impossible : ${error.message}`, 'error');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  // Tout changement de filtre met à jour l'objet `filters`.
  document.querySelectorAll('select, input[type="checkbox"], input[type="range"]')
    .forEach(element => element.addEventListener('change', updateFilters));

  // Les curseurs d'âge se mettent à jour pendant le glissement.
  ['age-min', 'age-max'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateFilters);
  });

  document.getElementById('search-button')?.addEventListener('click', runSearch);
  document.getElementById('refresh-button')?.addEventListener('click', runSearch);
  document.getElementById('clear-results')?.addEventListener('click', clearResults);
  document.getElementById('clear-all-data')?.addEventListener('click', event => {
    event.preventDefault();
    clearAllData();
  });

  document.getElementById('use-gps')?.addEventListener('click', initGeolocation);

  const cityInput = document.getElementById('city-input');
  if (cityInput) {
    cityInput.addEventListener('input', updateManualLocation);
    cityInput.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !document.getElementById('search-button')?.disabled) {
        runSearch();
      }
    });
  }

  document.getElementById('vision-enabled')?.addEventListener('change', syncVisionOptions);

  document.getElementById('select-all-sources')?.addEventListener('click', () => {
    const boxes = document.querySelectorAll('input[name="source"]');
    const allChecked = Array.from(boxes).every(box => box.checked);
    boxes.forEach(box => { box.checked = !allChecked; });
    updateFilters();
  });

  setupBlocklistControls();
  setupRelayControls();

  const versionLabel = document.getElementById('app-version');
  if (versionLabel) versionLabel.textContent = APP_VERSION;

  document.getElementById('diagnostics-copy')?.addEventListener('click', async () => {
    const text = diagnosticsToText(getLastDiagnostics());
    try {
      await navigator.clipboard.writeText(text);
      showNotification('Diagnostic copié.', 'success');
    } catch (error) {
      // Le presse-papiers est refusé hors HTTPS ou sans geste utilisateur reconnu.
      showNotification('Copie refusée par le navigateur : sélectionne le texte à la main.', 'warning');
    }
  });

  updateFilters();
  syncVisionOptions();
  enableSearchButton();
  renderZoneLabel();
  setupModal();
  updateHistoryDisplay();
  updateFavoritesDisplay();
});

registerServiceWorker();
