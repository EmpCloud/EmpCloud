import { useEffect, useState } from "react";

const STORAGE_KEY = "empcloud:filter:location_id";

function readStored(): number | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

// Persists the user's chosen location filter across pages and sessions so
// HR/managers don't have to reselect "Bangalore HQ" every time they open
// Attendance, Leave, or Regularizations. Multiple tabs stay in sync via the
// browser's `storage` event.
export function useStickyLocationFilter(): [number | undefined, (id: number | undefined) => void] {
  const [value, setValue] = useState<number | undefined>(() => readStored());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (value == null) window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // localStorage may throw in private mode / quota exceeded — silently
      // ignore and keep the in-memory state.
    }
  }, [value]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = e.newValue ? Number(e.newValue) : undefined;
      setValue(Number.isFinite(next as number) && (next as number) > 0 ? (next as number) : undefined);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return [value, setValue];
}
