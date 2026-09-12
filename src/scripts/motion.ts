/**
 * The motion layer.
 *
 * Nothing here is required for the page to be complete: the markup ships in
 * its finished state and this only adds the arrival. So the whole layer is
 * behind the `anim` class, which is never added when the reader has asked for
 * reduced motion — and is never added at all if this script does not run.
 *
 * One effect: the hairline rules that separate sections draw themselves in, in
 * the reading order of whatever container they sit in.
 */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Rules draw in when their element first comes into view. */
function drawRules(): () => void {
  const rules = [...document.querySelectorAll<HTMLElement>('[data-rule]')];
  if (!rules.length) return () => {};

  // Stagger within a shared parent, so a row of practice areas reads left to
  // right rather than all at once, but two distant sections do not queue up.
  const seen = new Map<Element, number>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        const parent = el.parentElement ?? document.body;
        const nth = seen.get(parent) ?? 0;
        seen.set(parent, nth + 1);
        el.style.transitionDelay = `${Math.min(nth, 6) * 70}ms`;
        el.classList.add('is-in');
        observer.unobserve(el);
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0 },
  );

  for (const rule of rules) observer.observe(rule);
  return () => observer.disconnect();
}

let teardown: Array<() => void> = [];

function apply(): void {
  for (const off of teardown) off();
  teardown = [];

  if (reduced.matches) {
    document.documentElement.classList.remove('anim');
    // Anything mid-flight is put straight into its finished state.
    for (const el of document.querySelectorAll<HTMLElement>('[data-rule]')) {
      el.style.transitionDelay = '';
      el.classList.remove('is-in');
    }
    return;
  }

  document.documentElement.classList.add('anim');
  teardown = [drawRules()];
}

apply();
// Respect a preference changed after load, in either direction.
reduced.addEventListener('change', apply);
