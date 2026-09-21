/**
 * Interactive Functionality
 * Minimalist, performance-optimised JavaScript.
 */

document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initFaqAccordion();
});

/**
 * Handles mobile menu toggle and accessibility attributes.
 */
function initMobileNav() {
  const navToggle = document.querySelector('.nav-toggle');
  const siteNav = document.querySelector('.site-nav');

  if (!navToggle || !siteNav) return;

  navToggle.addEventListener('click', () => {
    const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', !isExpanded);
    siteNav.classList.toggle('is-open');
  });
}

/**
 * Ensures clean toggle experience for native HTML5 <details> elements.
 */
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach((item) => {
    item.addEventListener('toggle', (event) => {
      if (item.open) {
        faqItems.forEach((otherItem) => {
          if (otherItem !== item && otherItem.open) {
            otherItem.open = false;
          }
        });
      }
    });
  });
}