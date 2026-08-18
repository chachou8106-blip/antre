// Notifications éphémères empilées dans un coin de l'écran.

const NOTIFICATION_ICONS = {
  success: 'fa-check-circle',
  error: 'fa-exclamation-circle',
  warning: 'fa-triangle-exclamation',
  info: 'fa-info-circle'
};

/**
 * Conteneur unique : sans lui les notifications se superposaient au même endroit.
 * @returns {HTMLElement}
 */
function notificationContainer() {
  let container = document.getElementById('notifications');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notifications';
    container.className = 'notification-stack';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Affiche une notification temporaire.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} [type]
 * @param {number} [duration] - Durée d'affichage en ms.
 */
function showNotification(message, type = 'info', duration = 4500) {
  const container = notificationContainer();
  const icon = NOTIFICATION_ICONS[type] || NOTIFICATION_ICONS.info;

  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `<i class="fas ${icon}"></i><span>${escapeHtml(message)}</span>`;
  notification.addEventListener('click', () => dismiss());

  container.appendChild(notification);

  // Au-delà de 4 notifications visibles, on retire les plus anciennes.
  while (container.children.length > 4) {
    container.removeChild(container.firstChild);
  }

  let removed = false;
  function dismiss() {
    if (removed) return;
    removed = true;
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 400);
  }

  setTimeout(dismiss, duration);
}

window.showNotification = showNotification;
