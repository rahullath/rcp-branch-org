import Link from "next/link";

/** On every specific importer: the main Import page handles a mixed dump in one go. */
export function ImportHint() {
  return (
    <Link className="linkcard" href="/import">
      <span className="lc-k">Got a mix of notes?</span>
      <span className="t">Import everything at once</span>
      <span className="small">Copy the prompt, paste it and your notes into any AI chat, then paste the reply back. It sorts contacts, events, tasks and stock for you.</span>
    </Link>
  );
}
