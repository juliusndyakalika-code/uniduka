/*
 * The manual's behaviour: the language switch and the contents list.
 *
 * This lives in its own file rather than inline because the app is served
 * under a Content Security Policy of script-src 'self', which blocks inline
 * script outright. Inline, the toggle was dead and the contents empty.
 */
// ---- language ----
const btnEn = document.getElementById('btn-en');
const btnSw = document.getElementById('btn-sw');
function setLang(l){
  document.documentElement.setAttribute('data-lang', l);
  document.documentElement.setAttribute('lang', l);
  btnEn.setAttribute('aria-pressed', String(l === 'en'));
  btnSw.setAttribute('aria-pressed', String(l === 'sw'));
  buildToc();
  try { localStorage.setItem('mh-manual-lang', l); } catch (e) {}
}
btnEn.addEventListener('click', () => setLang('en'));
btnSw.addEventListener('click', () => setLang('sw'));

// ---- contents, built from the headings actually on the page ----
// Two lists, the same entries: the sidebar on a wide screen, the panel behind
// the Contents button on a narrow one.
const toc = document.getElementById('toc');
const tocMobile = document.getElementById('toc-mobile');
function buildToc(){
  const lang = document.documentElement.getAttribute('data-lang');
  toc.replaceChildren();
  tocMobile.replaceChildren();
  document.querySelectorAll('section[id]').forEach(sec => {
    const h = sec.querySelector('h2[lang="' + lang + '"]');
    const n = sec.querySelector('.kicker');
    if (!h) return;
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + sec.id;
    // Built as nodes, not markup. This page shares an origin with the app,
    // so an HTML sink here would be an HTML sink on the app's origin; there
    // is no reason to have one when there is nothing to interpolate.
    const num = document.createElement('em');
    num.textContent = n ? n.textContent : '';
    const label = document.createElement('span');
    label.textContent = h.textContent;
    a.append(num, label);
    li.appendChild(a);
    toc.appendChild(li);

    const liM = li.cloneNode(true);
    liM.querySelector('a').addEventListener('click', closeMenu);
    tocMobile.appendChild(liM);
  });
  markCurrent();
}

// ---- which section you are in ----
let links = [];
function markCurrent(){
  links = Array.from(document.querySelectorAll('nav.toc a, .menu-panel a'));
}
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    const id = e.target.id;
    links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + id));
  });
}, { rootMargin: '-80px 0px -70% 0px' });
document.querySelectorAll('section[id]').forEach(s => io.observe(s));

// ---- the contents button, on narrow screens ----
const menuBtn = document.getElementById('menu-btn');
const menuPanel = document.getElementById('menu-panel');

function setMenu(open){
  menuPanel.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('menu-open', open);
  if (open) {
    // The panel hangs below the bar, whatever height the bar happens to be.
    document.documentElement.style.setProperty(
      '--bar-h', document.querySelector('header').offsetHeight + 'px');
  }
}
function closeMenu(){ setMenu(false); }

menuBtn.addEventListener('click', () => setMenu(menuPanel.hidden));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !menuPanel.hidden) { closeMenu(); menuBtn.focus(); }
});
// A rotation or a resize onto a wide screen leaves the panel stranded over a
// sidebar that is now visible, so it is dismissed.
window.addEventListener('resize', () => {
  if (window.innerWidth >= 960 && !menuPanel.hidden) closeMenu();
});

let saved = null;
try { saved = localStorage.getItem('mh-manual-lang'); } catch (e) {}
setLang(saved === 'sw' ? 'sw' : 'en');
