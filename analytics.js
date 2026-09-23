(function () {
  const GTM_ID = 'GTM-5FK2DJ7F'; // Replace with your actual GTM ID
  let gtmLoaded = false;

  function hasOptionalConsent() {
    return window.siteConsent?.hasConsent('analytics') === true ||
      window.siteConsent?.hasConsent('advertising') === true;
  }

  function loadGtm() {
    if (gtmLoaded || !hasOptionalConsent()) return;
    gtmLoaded = true;

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      'gtm.start': new Date().getTime(),
      event: 'gtm.js'
    });

    const noscript = document.createElement('noscript');
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.googletagmanager.com/ns.html?id=${GTM_ID}`;
    iframe.height = '0';
    iframe.width = '0';
    iframe.style.display = 'none';
    iframe.style.visibility = 'hidden';
    noscript.appendChild(iframe);

    if (document.body) {
      document.body.insertBefore(noscript, document.body.firstChild);
    }
  }

  loadGtm();
  window.addEventListener('site-consent-updated', loadGtm);
})();