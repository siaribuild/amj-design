import { useLocation } from "react-router";
import "./HoldingScreen.css";

// The whole of ops2, for now. It exists to prove four things are wired — the
// route reaches the Worker, Cloudflare Access let the person through, the
// bundle mounted, and the FrameFlow theme is applied — and to prove nothing
// else. Navigation comes next; the project tree after that.
export function HoldingScreen({ basename }: { basename: string }) {
  const { pathname } = useLocation();
  return (
    <main className="ops2-holding">
      <section className="ops2-holding__card ds-surface-card">
        <p className="ops2-holding__eyebrow ds-type-label-md">OpenFrame</p>
        <h1 className="ops2-holding__title ds-type-display-md">ops2</h1>
        <p className="ops2-holding__body ds-type-body-md">
          The new console is scaffolded and nothing is built on it yet. You are
          signed in, the route resolved, and the design system is loaded.
          Navigation is the next step.
        </p>
        <dl className="ops2-holding__facts ds-type-caption">
          <div className="ops2-holding__fact">
            <dt>Router base</dt>
            <dd>{basename}</dd>
          </div>
          <div className="ops2-holding__fact">
            <dt>Route</dt>
            <dd>{pathname}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
