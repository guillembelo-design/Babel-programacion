"use client";

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  formatMinutesAsTime,
  getTurnoverConflicts,
  timeToMinutes
} from "@/lib/schedule/conflicts";
import { Movie, Screening, WeekdayKey } from "@/lib/schedule/types";
import { roundMinutesToNearestFive, TimelineRange } from "@/lib/schedule/timeline";

const DRAG_THRESHOLD_PX = 7;
const PASTE_PREVIEW_SCREENING_ID = "__paste-preview__";

export type ScreeningDropStatus = "free" | "replace" | "invalid";

export type ScreeningDropTarget = {
  roomId: string;
  startMinutes: number;
  startsAt: string;
  status: ScreeningDropStatus;
  targetScreeningId: string | null;
};

export type ScreeningDropResult = ScreeningDropTarget & {
  screeningId: string;
};

export type ScreeningPasteResult = ScreeningDropTarget & {
  copiedScreening: Screening;
};

export type ScreeningDragState = {
  clientX: number;
  clientY: number;
  dropTarget: ScreeningDropTarget | null;
  screeningId: string;
};

export type ScreeningPasteState = {
  clientX: number;
  clientY: number;
  dropTarget: ScreeningDropTarget | null;
};

type ActiveDrag = {
  isDragging: boolean;
  screening: Screening;
  startX: number;
  startY: number;
};

type DropMode = "move" | "copy";

type UseScreeningDragAndDropParams = {
  activeDay: WeekdayKey;
  movies: Movie[];
  onCopyNotice: (message: string) => void;
  onDrop: (drop: ScreeningDropResult) => void | Promise<void>;
  onPaste: (drop: ScreeningPasteResult) => void | Promise<void>;
  onSelectScreening: (screeningId: string) => void;
  selectedScreeningId: string | null;
  screenings: Screening[];
  timelineRange: TimelineRange;
  turnoverMinutes: number;
  weekStart: string;
};

export function useScreeningDragAndDrop({
  activeDay,
  movies,
  onCopyNotice,
  onDrop,
  onPaste,
  onSelectScreening,
  selectedScreeningId,
  screenings,
  timelineRange,
  turnoverMinutes,
  weekStart
}: UseScreeningDragAndDropParams) {
  const activeDragRef = useRef<ActiveDrag | null>(null);
  const copiedScreeningRef = useRef<Screening | null>(null);
  const lastPointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const pasteStateRef = useRef<ScreeningPasteState | null>(null);
  const suppressNextClickRef = useRef(false);
  const [copiedScreening, setCopiedScreening] = useState<Screening | null>(null);
  const [dragState, setDragState] = useState<ScreeningDragState | null>(null);
  const [pasteState, setPasteState] = useState<ScreeningPasteState | null>(null);

  const getDropTarget = useCallback(
    (clientX: number, clientY: number, sourceScreening: Screening, mode: DropMode) => {
      const timelineElement = getTimelineElementFromPoint(clientX, clientY);
      if (!timelineElement) return null;

      const roomId = timelineElement.dataset.timelineRoomId;
      if (!roomId) return null;

      const rect = timelineElement.getBoundingClientRect();
      if (clientY < rect.top || clientY > rect.bottom) return null;

      const replacementScreening = getScreeningFromPoint(
        clientX,
        clientY,
        sourceScreening.id,
        screenings
      );

      if (replacementScreening) {
        const replacementStartMinutes =
          timeToMinutes(replacementScreening.startsAt) ??
          getRoundedMinutesFromPointer(clientY, rect, timelineRange);

        return {
          roomId: replacementScreening.roomId,
          startMinutes: replacementStartMinutes,
          startsAt: replacementScreening.startsAt,
          status: "replace" as const,
          targetScreeningId: replacementScreening.id
        };
      }

      const startMinutes = getRoundedMinutesFromPointer(clientY, rect, timelineRange);
      const previewScreening: Screening = {
        ...sourceScreening,
        id: mode === "copy" ? PASTE_PREVIEW_SCREENING_ID : sourceScreening.id,
        day: activeDay,
        roomId,
        startsAt: formatMinutesAsTime(startMinutes),
        weekStart
      };
      const nextScreenings =
        mode === "move"
          ? [
              ...screenings.filter((screening) => screening.id !== sourceScreening.id),
              previewScreening
            ]
          : [...screenings, previewScreening];
      const hasConflict = getTurnoverConflicts(nextScreenings, movies, turnoverMinutes).some(
        (conflict) =>
          conflict.previousScreeningId === previewScreening.id ||
          conflict.currentScreeningId === previewScreening.id
      );

      return {
        roomId,
        startMinutes,
        startsAt: previewScreening.startsAt,
        status: hasConflict ? "invalid" as const : "free" as const,
        targetScreeningId: null
      };
    },
    [activeDay, movies, screenings, timelineRange, turnoverMinutes, weekStart]
  );

  const startScreeningDrag = useCallback(
    (screening: Screening, event: ReactPointerEvent<HTMLElement>) => {
      if (
        pasteStateRef.current ||
        event.button !== 0 ||
        isInteractiveDragTarget(event.target) ||
        screening.day !== activeDay ||
        screening.weekStart !== weekStart
      ) {
        return;
      }

      activeDragRef.current = {
        isDragging: false,
        screening,
        startX: event.clientX,
        startY: event.clientY
      };
    },
    [activeDay, weekStart]
  );

  const activatePasteMode = useCallback(
    (screening: Screening) => {
      const pointer = lastPointerRef.current ?? {
        clientX: window.innerWidth / 2,
        clientY: window.innerHeight / 2
      };

      setPasteState({
        clientX: pointer.clientX,
        clientY: pointer.clientY,
        dropTarget: getDropTarget(pointer.clientX, pointer.clientY, screening, "copy")
      });
    },
    [getDropTarget]
  );

  const cancelPasteMode = useCallback(() => {
    setPasteState(null);
  }, []);

  const consumeDragClickSuppression = useCallback(() => {
    if (!suppressNextClickRef.current) {
      return false;
    }

    suppressNextClickRef.current = false;
    return true;
  }, []);

  useEffect(() => {
    copiedScreeningRef.current = copiedScreening;
  }, [copiedScreening]);

  useEffect(() => {
    pasteStateRef.current = pasteState;
  }, [pasteState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isShortcut = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey;

      if (key === "escape" && pasteStateRef.current) {
        event.preventDefault();
        setPasteState(null);
        return;
      }

      if (!isShortcut || isEditableShortcutTarget(event.target)) {
        return;
      }

      if (key === "c") {
        const pointer = lastPointerRef.current;
        const hoveredScreening =
          pasteStateRef.current && pointer
            ? getScreeningFromPoint(pointer.clientX, pointer.clientY, null, screenings)
            : null;
        const selectedScreening =
          hoveredScreening ??
          screenings.find((screening) => screening.id === selectedScreeningId);

        if (!selectedScreening) return;

        event.preventDefault();
        const nextCopiedScreening = { ...selectedScreening };

        setCopiedScreening(nextCopiedScreening);
        setPasteState(null);
        onSelectScreening(selectedScreening.id);
        onCopyNotice(`Copiado: ${getScreeningTitle(selectedScreening, movies)}`);
        return;
      }

      if (key === "v") {
        event.preventDefault();

        const screeningToPaste = copiedScreeningRef.current;
        if (!screeningToPaste) {
          onCopyNotice("No hay sesión copiada");
          return;
        }

        activatePasteMode(screeningToPaste);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    activatePasteMode,
    movies,
    onCopyNotice,
    onSelectScreening,
    screenings,
    selectedScreeningId
  ]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      lastPointerRef.current = {
        clientX: event.clientX,
        clientY: event.clientY
      };

      const screeningToPaste = copiedScreeningRef.current;
      if (pasteStateRef.current && screeningToPaste) {
        setPasteState({
          clientX: event.clientX,
          clientY: event.clientY,
          dropTarget: getDropTarget(event.clientX, event.clientY, screeningToPaste, "copy")
        });
      }

      const activeDrag = activeDragRef.current;
      if (!activeDrag) return;

      const deltaX = event.clientX - activeDrag.startX;
      const deltaY = event.clientY - activeDrag.startY;
      const distance = Math.hypot(deltaX, deltaY);

      if (!activeDrag.isDragging) {
        if (distance < DRAG_THRESHOLD_PX) return;

        activeDrag.isDragging = true;
        onSelectScreening(activeDrag.screening.id);
      }

      event.preventDefault();
      setDragState({
        clientX: event.clientX,
        clientY: event.clientY,
        dropTarget: getDropTarget(event.clientX, event.clientY, activeDrag.screening, "move"),
        screeningId: activeDrag.screening.id
      });
    };

    const finishDrag = (event: PointerEvent) => {
      const activeDrag = activeDragRef.current;
      if (!activeDrag) return;

      activeDragRef.current = null;

      if (!activeDrag.isDragging) {
        setDragState(null);
        return;
      }

      event.preventDefault();
      suppressNextClickRef.current = true;

      const dropTarget = getDropTarget(event.clientX, event.clientY, activeDrag.screening, "move");
      setDragState(null);

      if (!dropTarget) return;

      void onDrop({
        ...dropTarget,
        screeningId: activeDrag.screening.id
      });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [getDropTarget, onDrop, onSelectScreening]);

  useEffect(() => {
    const handlePasteClick = (event: MouseEvent) => {
      const screeningToPaste = copiedScreeningRef.current;

      if (!pasteStateRef.current || !screeningToPaste) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const dropTarget = getDropTarget(event.clientX, event.clientY, screeningToPaste, "copy");

      if (!dropTarget) {
        setPasteState(null);
        return;
      }

      void onPaste({
        ...dropTarget,
        copiedScreening: screeningToPaste
      });
    };

    const handleContextMenu = (event: MouseEvent) => {
      if (!pasteStateRef.current) return;

      event.preventDefault();
      setPasteState(null);
    };

    window.addEventListener("click", handlePasteClick, true);
    window.addEventListener("contextmenu", handleContextMenu);

    return () => {
      window.removeEventListener("click", handlePasteClick, true);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [getDropTarget, onPaste]);

  useEffect(() => {
    activeDragRef.current = null;
    setDragState(null);
    setPasteState(null);
  }, [activeDay, weekStart]);

  useEffect(() => {
    if (!dragState && !pasteState) return;

    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = dragState ? "grabbing" : "copy";

    return () => {
      document.body.style.cursor = previousCursor;
    };
  }, [dragState, pasteState]);

  return {
    cancelPasteMode,
    copiedScreening,
    consumeDragClickSuppression,
    dragState,
    pasteState,
    startScreeningDrag
  };
}

function getTimelineElementFromPoint(clientX: number, clientY: number) {
  return document
    .elementsFromPoint(clientX, clientY)
    .map((element) =>
      element instanceof HTMLElement
        ? element.closest<HTMLElement>("[data-timeline-room-id]")
        : null
    )
    .find((element): element is HTMLElement => Boolean(element));
}

function getScreeningFromPoint(
  clientX: number,
  clientY: number,
  ignoredScreeningId: string | null,
  screenings: Screening[]
) {
  const screeningElement = document
    .elementsFromPoint(clientX, clientY)
    .map((element) =>
      element instanceof HTMLElement
        ? element.closest<HTMLElement>("[data-screening-id]")
        : null
    )
    .find((element): element is HTMLElement => {
      if (!element?.dataset.screeningId) {
        return false;
      }

      return !ignoredScreeningId || element.dataset.screeningId !== ignoredScreeningId;
    });

  if (!screeningElement?.dataset.screeningId) {
    return null;
  }

  return (
    screenings.find((screening) => screening.id === screeningElement.dataset.screeningId) ?? null
  );
}

function getRoundedMinutesFromPointer(
  clientY: number,
  rect: DOMRect,
  timelineRange: TimelineRange
) {
  const pixelsPerMinute =
    rect.height / Math.max(1, timelineRange.endMinutes - timelineRange.startMinutes);
  const offsetY = Math.min(Math.max(clientY - rect.top, 0), rect.height);
  const rawMinutes = timelineRange.startMinutes + offsetY / pixelsPerMinute;

  return roundMinutesToNearestFive(rawMinutes);
}

function isInteractiveDragTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.isContentEditable ||
      target.closest("input, textarea, select, button, [data-selection-ignore='true']")
  );
}

function isEditableShortcutTarget(target: EventTarget | null) {
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

function getScreeningTitle(screening: Screening, movies: Movie[]) {
  return movies.find((movie) => movie.id === screening.movieId)?.title ?? "Película";
}
