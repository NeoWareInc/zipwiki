import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

export function AdminCreditsLock() {
  const controls = useQuery(api.admin.creditControls);
  const setLocked = useMutation(api.admin.setGlobalCreditsLocked);
  const [error, setError] = useState("");
  const locked = controls?.creditsLocked === true;

  async function toggle() {
    setError("");
    try {
      await setLocked({ locked: !locked });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the credit lock");
    }
  }

  return (
    <div className="rounded-xl border border-(--border) bg-white p-4 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">Lock all ZipWiki credits</p>
          <p className="mt-1 text-sm text-(--muted)">
            {locked
              ? "Hosted parse, OKF, and package questions cannot spend credits."
              : "Every account can spend credits it still has."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void toggle()}
          className={
            locked
              ? "rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white"
              : "rounded-md border border-(--border) px-3 py-2 text-sm font-semibold"
          }
        >
          {locked ? "Unlock all credits" : "Lock all credits"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
