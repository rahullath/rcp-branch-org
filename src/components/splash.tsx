import { APP_ORG, APP_PRODUCT } from "@/lib/config";
import { HammerSickle } from "./emblem";

/** Full-screen opening screen: shown while the app's first page loads. */
export function Splash() {
  return (
    <div className="splash" role="status" aria-live="polite">
      <div className="splash-glow" aria-hidden />
      <HammerSickle className="splash-emblem" color="yellow" height="min(46vh, 74vw, 380px)" title="Hammer and sickle" />
      <p className="splash-org">{APP_ORG}</p>
      <p className="splash-product">{APP_PRODUCT}</p>
      <div className="splash-bar" aria-hidden>
        <span />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}

/** Inside the app, between pages: the emblem, small, while the next page loads. */
export function PageLoading() {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <HammerSickle className="page-loading-emblem" color="red" height={52} />
      <span className="sr-only">Loading</span>
    </div>
  );
}
