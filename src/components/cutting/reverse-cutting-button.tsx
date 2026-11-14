"use client";

import { useActionState, useState } from "react";
import { ArrowCounterClockwise, WarningCircle } from "@phosphor-icons/react";
import { reverseCutting, type ReverseCuttingState } from "@/server/actions/cutting";

const initialState: ReverseCuttingState = { error: null };

export default function ReverseCuttingButton({
  cuttingRecordId,
  cutNumber,
  outputCount,
  hasScrap,
}: {
  cuttingRecordId: string;
  cutNumber: string;
  outputCount: number;
  hasScrap: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, isPending] = useActionState(reverseCutting, initialState);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex h-11 items-center gap-2 rounded-lg border border-error/40 bg-error-soft/40 px-4 text-sm font-semibold text-error-ink transition-colors hover:bg-error-soft"
      >
        <ArrowCounterClockwise size={18} />
        Reverse cutting
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-error/30 bg-error-soft/40 p-4"
    >
      <input type="hidden" name="cutting_record_id" value={cuttingRecordId} />
      <div className="flex items-start gap-2">
        <WarningCircle size={20} className="mt-0.5 shrink-0 text-error-ink" weight="fill" />
        <div className="text-sm text-ink">
          <p className="font-semibold">Reverse {cutNumber}?</p>
          <p className="mt-1 text-ink-soft">
            The source piece is restored to stock and the {outputCount} output piece
            {outputCount === 1 ? "" : "s"}
            {hasScrap ? " and the scrap lot" : ""} are retired. This only works while every
            output and the scrap lot are still untouched. A corrective process is required
            otherwise.
          </p>
        </div>
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-error/30 bg-error-soft/60 px-3 py-2 text-sm text-error-ink"
        >
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-11 rounded-lg bg-error px-5 text-sm font-semibold text-white transition-colors hover:bg-error/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Reversing…" : "Yes, reverse"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setConfirming(false)}
          className="h-11 rounded-lg border border-outline-soft px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-sand disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
