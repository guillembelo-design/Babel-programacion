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

export type ScreeningDragState = {
  clientX: number;
  clientY: number;
  dropTarget: ScreeningDropTarget | null;
  screeningId: string;
};

type ActiveDrag = {
  isDragging: boolean;
  screening: Screening;
  startX: number;
  startY: number;
};

type UseScreeningDragAndDropParams = {
  activeDay: WeekdayKey;
  movies: Movie[];
  onBlockedDrop: (message: string) => void;
  onDrop: (drop: ScreeningDropResult) => void | Promise<void>;
  onSelectScreening: (screeningId: string) => void;
  screenings: Screening[];
  timelineRange: TimelineRange;
  turnoverMinutes: number;
  weekStart: string;
};

export function useScreeningDragAndDrop({
  activeDay,
  movies,
  onBlockedDrop,
  onDrop,
  onSelectScreening,
  screenings,
  timelineRange,
  turnoverMinutes,
  weekStart
}: UseScreeningDragAndDropParams) {
  const activeDragRef = useRef<ActiveDrag | null>(null);
  const suppressNextClickRef = useRef(false);
  const [dragState, setDragState] = useState<ScreeningDragState | null>(null);

  const getDropTarget = useCallback(
    (clientX: number, clientY: number, draggedScreening: Screening) => {
      const timelineElement = getTimelineElementFromPoint(clientX, clientY);
      if (!timelineElement) return null;

      const roomId = timelineElement.dataset.timelineRoomId;
      if (!roomId) return null;

      const rect = timelineElement.getBoundingClientRect();
      if (clientY < rect.top || clientY > rect.bottom) return null;

      const replacementScreening = getReplacementScreeningFromPoint(
        clientX,
        clientY,
        draggedScreening.id,
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
      const movedScreening: Screening = {
        ...draggedScreening,
        day: activeDay,
        roomId,
        startsAt: formatMinutesAsTime(startMinutes),
        weekStart
      };
      const nextScreenings = [
        ...screenings.filter((screening) => screening.id !== draggedScreening.id),
        movedScreening
      ];
      const hasConflict = getTurnoverConflicts(nextScreenings, movies, turnoverMinutes).some(
        (conflict) =>
          conflict.previousScreeningId === draggedScreening.id ||
          conflict.currentScreeningId === draggedScreening.id
      );

      return {
        roomId,
        startMinutes,
        startsAt: movedScreening.startsAt,
        status: hasConflict ? "invalid" as const : "free" as const,
        targetScreeningId: null
      };
    },
    [activeDay, movies, screenings, timelineRange, turnoverMinutes, weekStart]
  );

  const startScreeningDrag = useCallback(
    (screening: Screening, event: ReactPointerEvent<HTMLElement>) => {
      if (
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

  const consumeDragClickSuppression = useCallback(() => {
    if (!suppressNextClickRef.current) {
      return false;
    }

    suppressNextClickRef.current = false;
    return true;
  }, []);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
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
        dropTarget: getDropTarget(event.clientX, event.clientY, activeDrag.screening),
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

      const dropTarget = getDropTarget(event.clientX, event.clientY, activeDrag.screening);
      setDragState(null);

      if (!dropTarget) return;

      if (dropTarget.status === "invalid") {
        onBlockedDrop("No cabe ahi");
        return;
      }

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
  }, [getDropTarget, onBlockedDrop, onDrop, onSelectScreening]);

  useEffect(() => {
    activeDragRef.current = null;
    setDragState(null);
  }, [activeDay, weekStart]);

  useEffect(() => {
    if (!dragState) return;

    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";

    return () => {
      document.body.style.cursor = previousCursor;
    };
  }, [dragState]);

  return {
    consumeDragClickSuppression,
    dragState,
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

function getReplacementScreeningFromPoint(
  clientX: number,
  clientY: number,
  draggedScreeningId: string,
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

      return element.dataset.screeningId !== draggedScreeningId;
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
