"use client";

import { useId, useState } from "react";
import { useProfiles } from "@/lib/profiles-context";
import type { Profile } from "@/lib/types";
import { cn, initials } from "@/lib/utils";
import { inputClasses } from "@/components/ui";
import { useWorkload } from "@/components/v2/workload";

interface BaseProps {
  placeholder?: string;
  className?: string;
}

interface TextModeProps extends BaseProps {
  mode?: "text";
  value: string;
  onChange: (value: string) => void;
}

interface IdModeProps extends BaseProps {
  mode: "id";
  value: string | null;
  onChange: (id: string | null) => void;
}

function optionLabel(p: Profile) {
  return `${initials(p.name)} — ${p.name}`;
}

/**
 * Suggests comrades' initials from the branch directory. Native
 * `<input list>` + `<datalist>` — no autocomplete library, matches the
 * rest of this codebase's zero-extra-deps style. Free text always stays
 * possible (e.g. "All" as an agenda-item owner).
 *
 * `mode="text"` binds to a plain text column (agenda leadoff/owner,
 * session leadoff/chair) — value/onChange are the raw string.
 * `mode="id"` binds to a profile-id FK column (event chair/minutes) —
 * value/onChange are a profile id or null, resolved from typed text
 * against the directory.
 */
export function PersonPicker(props: TextModeProps | IdModeProps) {
  const listId = useId();
  const { profiles: options } = useProfiles();

  if (props.mode === "id") {
    return <IdPersonPicker {...props} options={options} listId={listId} />;
  }
  return <TextPersonPicker {...props} options={options} listId={listId} />;
}

function TextPersonPicker({
  value,
  onChange,
  placeholder,
  className,
  options,
  listId,
}: TextModeProps & { options: Profile[]; listId: string }) {
  return (
    <>
      <input
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Initials or name…"}
        className={cn(inputClasses, className)}
      />
      <datalist id={listId}>
        {options.map((p) => (
          <option key={p.id} value={initials(p.name)}>
            {p.name}
          </option>
        ))}
      </datalist>
    </>
  );
}

function IdPersonPicker({
  value,
  onChange,
  placeholder,
  className,
  options,
  listId,
}: IdModeProps & { options: Profile[]; listId: string }) {
  const { hint } = useWorkload();
  const [text, setText] = useState("");
  const [synced, setSynced] = useState<{ value: string | null; options: Profile[] } | null>(null);

  // Resync the visible text whenever `value` or the fetched profile list
  // changes — adjusted during render (not an effect) per React's guidance
  // for deriving state from props: https://react.dev/learn/you-might-not-need-an-effect
  if (!synced || synced.value !== value || synced.options !== options) {
    setSynced({ value, options });
    const match = options.find((p) => p.id === value) ?? null;
    setText(match ? optionLabel(match) : "");
  }

  function resolve(raw: string) {
    const q = raw.trim().toLowerCase();
    if (!q) return null;
    return (
      options.find(
        (p) => optionLabel(p).toLowerCase() === q || initials(p.name).toLowerCase() === q || p.name.toLowerCase() === q,
      ) ?? null
    );
  }

  function handleChange(raw: string) {
    setText(raw);
    const match = resolve(raw);
    if (match) onChange(match.id);
  }

  function handleBlur(raw: string) {
    const match = resolve(raw);
    onChange(match ? match.id : null);
    setText(match ? optionLabel(match) : "");
  }

  return (
    <>
      <input
        list={listId}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={(e) => handleBlur(e.target.value)}
        placeholder={placeholder ?? "Pick a comrade…"}
        className={cn(inputClasses, className)}
      />
      <datalist id={listId}>
        {options.map((p) => (
          <option key={p.id} value={optionLabel(p)}>
            {hint(p.id)}
          </option>
        ))}
      </datalist>
    </>
  );
}
