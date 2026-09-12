/**
 * Loads the Cal.com calendar into the page and keeps it in step with the site.
 *
 * Nothing here is required for booking to work: the markup already contains a
 * real link to the same Cal.com booking page, and this only upgrades that into
 * an inline calendar. Every failure path therefore has to leave that link
 * standing.
 *
 * That is harder than it looks. Installing the embed never throws — it appends
 * a script tag and queues instructions against it — so a blocked or unreachable
 * Cal.com produces no error at all, just instructions that are never executed.
 * Removing the link up front and trusting a try/catch leaves an empty panel.
 * So the link is kept until an iframe actually appears, and if none does within
 * the timeout the calendar is torn back down and the link stays.
 *
 * The embed is fetched when the section nears the viewport, not on load, so a
 * reader who never scrolls this far pays nothing for a third-party script.
 */
import EmbedSnippet from '@calcom/embed-snippet';

type CalApi = (...args: unknown[]) => void;
type Cal = CalApi & { ns: Record<string, CalApi> };

/** How long to let the calendar appear before giving the link back. */
const SETTLE_MS = 8000;

const root = document.querySelector<HTMLElement>('[data-booking]');
const mount = root?.querySelector<HTMLElement>('[data-booking-mount]');
const original = mount?.firstElementChild ?? null;

if (root && mount && original) {
  const origin = (root.dataset.origin ?? 'https://cal.com').replace(/\/$/, '');
  const html = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  /** The site's current theme, which the calendar is told to match. */
  const theme = (): 'light' | 'dark' =>
    html.dataset.theme === 'dark' || (!html.dataset.theme && systemDark.matches) ? 'dark' : 'light';

  /**
   * Dress the calendar in the site's own palette.
   *
   * Cal.com exposes its colours as CSS custom properties, so the calendar can
   * read as part of the page instead of as a widget dropped into it. The values
   * are read from the live stylesheet rather than copied here, so there is no
   * second palette to keep in step with global.css.
   *
   * Both key spellings are sent. The package ships only the type for this, not
   * the code that consumes it — that comes from cal.com at runtime — so which
   * of the two it expects could not be checked here. The unused one is ignored.
   */
  const palette = (): Record<string, string> => {
    const computed = getComputedStyle(html);
    const read = (name: string) => computed.getPropertyValue(name).trim();
    const map: Record<string, string> = {
      // Grounds: the calendar sits on the page, not on a card of its own.
      'cal-bg': read('--bg'),
      'cal-bg-subtle': read('--tint'),
      'cal-bg-muted': read('--tint'),
      'cal-bg-emphasis': read('--tint'),
      'cal-bg-inverted': read('--ink'),
      'cal-border': read('--rule'),
      'cal-border-subtle': read('--rule'),
      'cal-border-booker': read('--rule'),
      'cal-border-emphasis': read('--rule-strong'),
      'cal-text': read('--ink'),
      'cal-text-emphasis': read('--ink'),
      'cal-text-subtle': read('--sec'),
      'cal-text-muted': read('--sec'),
      'cal-text-inverted': read('--bg'),
      'cal-brand': read('--navy'),
      'cal-brand-emphasis': read('--navy'),
      'cal-brand-text': read('--on-accent'),
    };
    return { ...map, ...Object.fromEntries(Object.entries(map).map(([k, v]) => [`--${k}`, v])) };
  };

  /**
   * The `ui` payload. Both theme keys carry the palette that is live right now:
   * only the active one is used, and a theme change re-sends this with the new
   * values, so the inactive set never gets a chance to be wrong.
   */
  const ui = () => {
    const vars = palette();
    return {
      theme: theme(),
      layout: 'month_view' as const,
      // The page already states the duration, the price and who I am, in its
      // own typography. Cal repeating it is duplication in a second typeface.
      hideEventTypeDetails: true,
      cssVarsPerTheme: { light: vars, dark: vars },
    };
  };

  let cal: Cal | null = null;
  /** Namespace of the calendar on screen, for theme updates. */
  let current: string | null = null;
  let shown: string | null = null;
  /** A namespace per calendar, so switching type inherits no stale state. */
  let seq = 0;

  /** The shipped link, pointed at `url` and optionally carrying a message. */
  const linkTo = (url: string, hint?: string): Element => {
    const node = original.cloneNode(true) as Element;
    node.querySelector('a')?.setAttribute('href', url);
    const note = node.querySelector('.bk__hint');
    if (note && hint) note.textContent = hint;
    return node;
  };

  /**
   * Give up on the calendar and hand the link back. The reserved height lives
   * on the frame, so removing it also gives the space back rather than leaving
   * a tall gap around a single link.
   */
  const fail = (url: string): void => {
    mount.removeAttribute('data-booking-ready');
    mount.replaceChildren(linkTo(url, 'The calendar could not load here. The link still works.'));
  };

  /** Resolves true once the calendar has really rendered, false on timeout. */
  const settled = (frame: HTMLElement): Promise<boolean> =>
    new Promise((resolve) => {
      if (frame.querySelector('iframe')) return resolve(true);
      const done = (ok: boolean) => {
        watcher.disconnect();
        clearTimeout(timer);
        resolve(ok);
      };
      const watcher = new MutationObserver(() => {
        if (frame.querySelector('iframe')) done(true);
      });
      watcher.observe(frame, { childList: true, subtree: true });
      const timer = setTimeout(() => done(false), SETTLE_MS);
    });

  const install = (): Cal | null => {
    if (cal) return cal;
    try {
      cal = EmbedSnippet(`${origin}/embed/embed.js`) as unknown as Cal;
      return cal;
    } catch {
      return null;
    }
  };

  /** Render `calLink` into the mount, keeping `url` as the way out. */
  const show = async (calLink: string, url: string): Promise<void> => {
    if (shown === calLink) return;
    shown = calLink;

    const api = install();
    if (!api) {
      fail(url);
      return;
    }

    const frame = document.createElement('div');
    frame.className = 'bk__frame';
    // The link stays beside the frame until the calendar proves it rendered.
    mount.replaceChildren(linkTo(url), frame);
    mount.setAttribute('aria-busy', 'true');

    const ns = `bk-${seq++}`;
    try {
      api('init', ns, { origin });
      api.ns[ns]('inline', {
        elementOrSelector: frame,
        calLink,
        config: { layout: 'month_view', theme: theme() },
      });
      api.ns[ns]('ui', ui());
    } catch {
      mount.removeAttribute('aria-busy');
      fail(url);
      return;
    }

    const ok = await settled(frame);
    mount.removeAttribute('aria-busy');
    if (shown !== calLink) return; // a newer choice won while this one waited

    if (ok) {
      current = ns;
      mount.dataset.bookingReady = '';
      mount.replaceChildren(frame);
    } else {
      current = null;
      fail(url);
    }
  };

  // Switch calendars in place instead of navigating to Cal.com.
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[data-cal-link]')) {
    link.addEventListener('click', (event) => {
      const calLink = link.dataset.calLink;
      // Let modified clicks and middle clicks open Cal.com the usual way.
      if (!calLink || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      for (const other of root.querySelectorAll('a[data-cal-link][aria-current]')) {
        other.removeAttribute('aria-current');
      }
      link.setAttribute('aria-current', 'true');
      void show(calLink, link.href);
    });
  }

  // Follow the site's theme toggle, and the system preference behind it.
  const retheme = () => {
    if (!cal || !current) return;
    try {
      cal.ns[current]('ui', ui());
    } catch {
      /* the calendar keeps the theme it has */
    }
  };
  new MutationObserver(retheme).observe(html, { attributes: true, attributeFilter: ['data-theme'] });
  systemDark.addEventListener('change', retheme);

  const first = mount.dataset.calLink;
  const firstUrl = original.querySelector('a')?.getAttribute('href');
  if (first && firstUrl) {
    // Load a little before the section arrives, so it is ready on sight.
    const watcher = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        watcher.disconnect();
        void show(first, firstUrl);
      },
      { rootMargin: '400px 0px' },
    );
    watcher.observe(root);
  }
}
