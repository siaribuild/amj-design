// Cloudflare Turnstile widget mounting, shared by the Contact form and the
// customer sign-in screen.
//
// One copy on the client for the same reason there is one on the Worker
// (worker/lib/captcha.ts): the two forms must agree about when a captcha is
// required, and a duplicated widget lifecycle is how they stop agreeing.
//
// No-op without a site key, so dev, preview and the e2e run — none of which have
// a captcha provider — behave exactly as they did before.
import { useEffect, useRef } from "react";

export const TURNSTILE_SITE_KEY = (import.meta as any).env?.VITE_TURNSTILE_SITE_KEY as string | undefined;

/** Render a widget into the returned ref's container.
 *
 *  `dep` re-mounts it: the Contact page passes its active tab so switching panels
 *  moves the widget into the newly shown container instead of leaving it stranded
 *  in the unmounted one. Callers with a single container can pass a constant. */
export function useTurnstile(onToken: (t: string) => void, dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !ref.current) return;
    let cancelled = false;
    const render = () => {
      const ts = (window as any).turnstile;
      if (cancelled || !ts || !ref.current) return;
      if (widgetId.current != null) { try { ts.remove(widgetId.current); } catch { /* already gone */ } widgetId.current = null; }
      widgetId.current = ts.render(ref.current, { sitekey: TURNSTILE_SITE_KEY, callback: (t: string) => onToken(t), "expired-callback": () => onToken(""), "error-callback": () => onToken("") });
    };
    if ((window as any).turnstile) render();
    else {
      let script = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
      if (!script) {
        script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
        script.async = true; script.defer = true; script.setAttribute("data-turnstile", "");
        document.head.appendChild(script);
      }
      script.addEventListener("load", render);
    }
    return () => {
      cancelled = true;
      const ts = (window as any).turnstile;
      if (ts && widgetId.current != null) { try { ts.remove(widgetId.current); } catch { /* noop */ } widgetId.current = null; }
    };
  }, [onToken, dep]);
  return ref;
}
