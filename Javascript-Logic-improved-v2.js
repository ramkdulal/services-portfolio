/*
 * Consent Manager — GDPR/ePrivacy-oriented custom implementation
 */

'use strict';

const CONSENT_KEY = 'site_consent_v1';
const CONSENT_VERSION = '1.0';
const RECONSENT_DAYS = 180;

const NON_ESSENTIAL_STORAGE = {
  analytics: {
    local: [],
    session: [],
    cookies: ['_ga', '_gid', '_gat', '_ga_']
  },
  advertising: {
    local: [],
    session: [],
    cookies: ['_gcl_au', '_gac_']
  }
};

const state = {
  banner: null,
  modal: null,
  modalContent: null,
  previousFocus: null
};

function ensureDataLayer() {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () {
    window.dataLayer.push(arguments);
  };
}

function normalizeConsent(value) {
  return value === true;
}

function getStoredConsent() {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;

    const record = JSON.parse(raw);

    if (
      !record ||
      record.version !== CONSENT_VERSION ||
      typeof record.timestamp !== 'number'
    ) {
      return null;
    }

    return {
      version: record.version,
      timestamp: record.timestamp,
      analytics: normalizeConsent(record.analytics),
      advertising: normalizeConsent(record.advertising)
    };
  } catch {
    return null;
  }
}

function isConsentExpired(record) {
  if (!record) return true;
  const maxAge = RECONSENT_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - record.timestamp > maxAge;
}

function storeConsent(analytics, advertising) {
  const record = {
    version: CONSENT_VERSION,
    timestamp: Date.now(),
    analytics: !!analytics,
    advertising: !!advertising
  };

  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
  } catch {
    // Consent must still be applied even if localStorage is unavailable.
  }

  return record;
}

function applyGoogleConsent(analytics, advertising) {
  ensureDataLayer();

  window.gtag('consent', 'update', {
    analytics_storage: analytics ? 'granted' : 'denied',
    ad_storage: advertising ? 'granted' : 'denied',
    ad_user_data: advertising ? 'granted' : 'denied',
    ad_personalization: advertising ? 'granted' : 'denied',
    functionality_storage: 'denied',
    personalization_storage: 'denied',
    security_storage: 'granted'
  });
}

function publishConsentState(record, eventName = 'consent_state_updated', source = null) {
  ensureDataLayer();

  window.siteConsentState = {
    analytics: !!record.analytics,
    advertising: !!record.advertising,
    version: record.version,
    timestamp: record.timestamp
  };

  const payload = {
    event: eventName,
    consent_analytics: !!record.analytics,
    consent_advertising: !!record.advertising,
    consent_version: record.version
  };

  if (source) {
    payload.consent_source = source;
  }

  window.dataLayer.push(payload);
}

function deleteCookieByName(name) {
  const hostname = location.hostname;
  const domainVariants = ['', hostname, '.' + hostname];
  const paths = ['/', location.pathname || '/'];

  for (const domain of domainVariants) {
    for (const path of paths) {
      let cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; path=${path};`;
      if (domain) cookie += ` domain=${domain};`;
      document.cookie = cookie;
    }
  }
}

function clearCookieList(cookieNames) {
  for (const name of cookieNames) {
    deleteCookieByName(name);
  }
}

function clearStorageList(storage, keys) {
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch {}
  }
}

function clearCategoryClientStorage(category) {
  const config = NON_ESSENTIAL_STORAGE[category];
  if (!config) return;

  clearCookieList(config.cookies || []);

  try {
    clearStorageList(localStorage, config.local || []);
  } catch {}

  try {
    clearStorageList(sessionStorage, config.session || []);
  } catch {}
}

function clearWithdrawnCategories(previous, next) {
  if (previous.analytics && !next.analytics) {
    clearCategoryClientStorage('analytics');
  }

  if (previous.advertising && !next.advertising) {
    clearCategoryClientStorage('advertising');
  }
}

function clearAllConfiguredNonEssentialStorage() {
  clearCategoryClientStorage('analytics');
  clearCategoryClientStorage('advertising');
}

function getConsentToggles() {
  return {
    analytics: document.getElementById('toggle-analytics')?.checked === true,
    advertising: document.getElementById('toggle-advertising')?.checked === true
  };
}

function syncConsentToggles(record) {
  const analyticsToggle = document.getElementById('toggle-analytics');
  const advertisingToggle = document.getElementById('toggle-advertising');

  if (analyticsToggle) {
    analyticsToggle.checked = !!record?.analytics;
  }

  if (advertisingToggle) {
    advertisingToggle.checked = !!record?.advertising;
  }
}

function saveConsent(analytics, advertising, source = 'preferences') {
  const previous = getStoredConsent();
  const next = storeConsent(analytics, advertising);

  applyGoogleConsent(next.analytics, next.advertising);

  if (previous) {
    clearWithdrawnCategories(previous, next);
  }

  publishConsentState(next, 'consent_updated', source);

  return next;
}

function withdrawConsent() {
  const previous = getStoredConsent();

  applyGoogleConsent(false, false);
  const next = storeConsent(false, false);

  if (previous) {
    clearWithdrawnCategories(previous, next);
  }

  clearAllConfiguredNonEssentialStorage();
  publishConsentState(next, 'consent_withdrawn');

  hideModal();
  hideBanner();

  return next;
}

function getFocusableElements(container) {
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), ' +
      'select:not([disabled]), textarea:not([disabled]), ' +
      '[tabindex]:not([tabindex="-1"])'
    )
  ).filter(el => {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

function trapModalFocus(event) {
  if (!state.modal || state.modal.hidden || event.key !== 'Tab') return;

  const focusable = getFocusableElements(state.modal);

  if (!focusable.length) {
    event.preventDefault();
    state.modalContent?.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openModal() {
  if (!state.modal) return;

  state.previousFocus = document.activeElement;
  state.modal.hidden = false;
  document.body.classList.add('consent-modal-open');

  syncConsentToggles(getStoredConsent());

  state.modalContent?.focus();
  document.addEventListener('keydown', trapModalFocus);
}

function hideModal() {
  if (!state.modal) return;

  state.modal.hidden = true;
  document.body.classList.remove('consent-modal-open');
  document.removeEventListener('keydown', trapModalFocus);

  if (
    state.previousFocus &&
    typeof state.previousFocus.focus === 'function' &&
    document.contains(state.previousFocus)
  ) {
    state.previousFocus.focus();
  }

  state.previousFocus = null;
}

function showBanner() {
  if (!state.banner) return;
  state.banner.hidden = false;
}

function hideBanner() {
  if (!state.banner) return;
  state.banner.hidden = true;
}

function hasUsableStoredConsent(record) {
  return !!record && !isConsentExpired(record);
}

function showConsentManager() {
  const stored = getStoredConsent();

  if (!hasUsableStoredConsent(stored)) {
    showBanner();
    return;
  }

  hideBanner();
  openModal();
}

function rejectAll(source = 'reject_all') {
  saveConsent(false, false, source);
  hideModal();
  hideBanner();
}

function acceptAll(source = 'accept_all') {
  saveConsent(true, true, source);
  hideModal();
  hideBanner();
}

function savePreferences(source = 'save_preferences') {
  const { analytics, advertising } = getConsentToggles();

  saveConsent(analytics, advertising, source);
  hideModal();
  hideBanner();
}

function bindUI() {
  const elements = {
    banner: document.getElementById('consent-banner'),
    modal: document.getElementById('consent-modal'),
    modalContent: document.getElementById('consent-modal-content'),
    rejectAll: document.getElementById('consent-reject-all'),
    acceptAll: document.getElementById('consent-accept-all'),
    manage: document.getElementById('consent-manage'),
    bannerClose: document.getElementById('consent-banner-close'),
    savePreferences: document.getElementById('consent-save-preferences'),
    modalReject: document.getElementById('consent-modal-reject'),
    modalClose: document.getElementById('consent-modal-close'),
    settingsLink: document.getElementById('consent-settings-link')
  };

  state.banner = elements.banner;
  state.modal = elements.modal;
  state.modalContent = elements.modalContent;

  elements.rejectAll?.addEventListener('click', () => {
    rejectAll('reject_all');
  });

  elements.acceptAll?.addEventListener('click', () => {
    acceptAll('accept_all');
  });

  elements.manage?.addEventListener('click', () => {
    openModal();
  });

  elements.bannerClose?.addEventListener('click', () => {
    rejectAll('banner_close');
  });

  elements.savePreferences?.addEventListener('click', () => {
    savePreferences('save_preferences');
  });

  elements.modalReject?.addEventListener('click', () => {
    rejectAll('modal_reject_all');
  });

  elements.modalClose?.addEventListener('click', () => {
    const stored = getStoredConsent();
    if (!stored) {
      rejectAll('modal_close');
    } else {
      hideModal();
    }
  });

  elements.settingsLink?.addEventListener('click', () => {
    openModal();
  });

  elements.modal?.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;

    const stored = getStoredConsent();
    if (!stored) {
      rejectAll('modal_escape');
    } else {
      hideModal();
    }
  });
}

function initializeConsent() {
  ensureDataLayer();
  bindUI();

  const stored = getStoredConsent();

  if (!hasUsableStoredConsent(stored)) {
    showBanner();
    return;
  }

  applyGoogleConsent(stored.analytics, stored.advertising);
  publishConsentState(stored, 'consent_restored');

  hideBanner();
  hideModal();
}

// Public API
window.siteConsent = {
  getState() {
    const stored = getStoredConsent();
    return stored
      ? {
          analytics: !!stored.analytics,
          advertising: !!stored.advertising,
          version: stored.version,
          timestamp: stored.timestamp
        }
      : {
          analytics: false,
          advertising: false,
          version: CONSENT_VERSION,
          timestamp: null
        };
  },

  hasConsent(category) {
    const state = this.getState();
    return state[category] === true;
  },

  whenGranted(category, callback) {
    if (this.hasConsent(category) && typeof callback === 'function') {
      callback(this.getState());
      return true;
    }
    return false;
  },

  withdraw() {
    return withdrawConsent();
  },

  open() {
    showConsentManager();
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeConsent);
} else {
  initializeConsent();
}