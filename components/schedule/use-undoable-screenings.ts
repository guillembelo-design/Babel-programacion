"use client";

import { useCallback, useEffect, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { compareScreeningStartTimes } from "@/lib/schedule/conflicts";
import { ScheduleState, Screening } from "@/lib/schedule/types";
import { deleteScreening, loadSchedule, saveScreening } from "@/lib/schedule/store";
import { SaveState } from "./status-badge";

const UNDO_STACK_LIMIT = 10;

type UseUndoableScreeningsParams = {
  persistedScreeningsRef: MutableRefObject<Screening[]>;
  rememberPersistedScreenings: (screenings: Screening[]) => void;
  runSaving: (operation: () => Promise<void>) => Promise<boolean>;
  saveState: SaveState;
  screenings: Screening[];
  setState: Dispatch<SetStateAction<ScheduleState>>;
};

export function useUndoableScreenings({
  persistedScreeningsRef,
  rememberPersistedScreenings,
  runSaving,
  saveState,
  screenings,
  setState
}: UseUndoableScreeningsParams) {
  const [undoNotice, setUndoNotice] = useState("");
  const [undoStack, setUndoStack] = useState<Screening[][]>([]);

  const cloneScreenings = useCallback(
    (items: Screening[]) =>
      items.map((screening) => ({ ...screening })).sort(compareScreeningStartTimes),
    []
  );

  const pushUndoSnapshot = useCallback(
    (items: Screening[]) => {
      setUndoStack((current) => [
        cloneScreenings(items),
        ...current
      ].slice(0, UNDO_STACK_LIMIT));
    },
    [cloneScreenings]
  );

  const restoreScreeningsSnapshot = useCallback(
    async (targetScreenings: Screening[]) => {
      const previousScreenings = screenings;
      const previousPersistedScreenings = persistedScreeningsRef.current;
      const targetSnapshot = cloneScreenings(targetScreenings);
      const targetIds = new Set(targetSnapshot.map((screening) => screening.id));
      const screeningsToDelete = persistedScreeningsRef.current.filter(
        (screening) => !targetIds.has(screening.id)
      );

      setState((current) => ({
        ...current,
        screenings: targetSnapshot
      }));

      const saved = await runSaving(async () => {
        await Promise.all([
          ...screeningsToDelete.map((screening) => deleteScreening(screening.id)),
          ...targetSnapshot.map((screening) => saveScreening(screening))
        ]);
      });

      if (!saved) {
        const loadedState = await loadSchedule().catch(() => null);

        if (loadedState) {
          setState(loadedState);
          rememberPersistedScreenings(loadedState.screenings);
        } else {
          setState((current) => ({ ...current, screenings: previousScreenings }));
          rememberPersistedScreenings(previousPersistedScreenings);
        }

        return false;
      }

      rememberPersistedScreenings(targetSnapshot);
      return true;
    },
    [
      cloneScreenings,
      persistedScreeningsRef,
      rememberPersistedScreenings,
      runSaving,
      screenings,
      setState
    ]
  );

  const undoLastSessionAction = useCallback(async () => {
    const [snapshotToRestore, ...remainingSnapshots] = undoStack;

    if (!snapshotToRestore || saveState === "saving") {
      return;
    }

    const restored = await restoreScreeningsSnapshot(snapshotToRestore);

    if (!restored) {
      return;
    }

    setUndoStack(remainingSnapshots);
    setUndoNotice("Cambio deshecho");
  }, [restoreScreeningsSnapshot, saveState, undoStack]);

  useEffect(() => {
    if (!undoNotice) return;

    const timeoutId = window.setTimeout(() => setUndoNotice(""), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [undoNotice]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "z" ||
        (!event.ctrlKey && !event.metaKey) ||
        event.altKey ||
        event.shiftKey ||
        isEditableUndoTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      void undoLastSessionAction();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [undoLastSessionAction]);

  return {
    canUndo: Boolean(undoStack.length) && saveState !== "saving",
    pushUndoSnapshot,
    undoLastSessionAction,
    undoNotice
  };
}

function isEditableUndoTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
