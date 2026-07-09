"use client";

import { useCallback, useEffect, useRef } from "react";
import { Screening } from "@/lib/schedule/types";
import { supabase } from "@/lib/supabase/client";

const REALTIME_RELOAD_DEBOUNCE_MS = 450;
const WEEKLY_MOVIES_DELETE_CONFIRM_RELOAD_MS = 700;

type RealtimeEventType = "INSERT" | "UPDATE" | "DELETE";
type RealtimeRecord = Record<string, unknown>;

type RealtimePayload = {
  eventType: RealtimeEventType;
  new?: RealtimeRecord;
  old?: RealtimeRecord;
};

type RealtimeNoticeOptions = {
  notify?: boolean;
};

type WeeklyMoviesBroadcastPayload = {
  weekStart: string;
};

type WeeklyMoviesBroadcastMessage = {
  payload?: {
    weekStart?: unknown;
  };
};

type WeeklyMoviesBroadcastChannel = {
  send: (message: {
    event: "weekly_movies_changed";
    payload: WeeklyMoviesBroadcastPayload;
    type: "broadcast";
  }) => Promise<unknown>;
};

type UseScheduleRealtimeParams = {
  onError: (error: unknown) => void;
  onReload: () => Promise<boolean>;
  onRemoteChange: (options?: RealtimeNoticeOptions) => void;
  screenings: Screening[];
  weekStart: string;
};

export function useScheduleRealtime({
  onError,
  onReload,
  onRemoteChange,
  screenings,
  weekStart
}: UseScheduleRealtimeParams) {
  const onErrorRef = useRef(onError);
  const onReloadRef = useRef(onReload);
  const onRemoteChangeRef = useRef(onRemoteChange);
  const screeningsRef = useRef(screenings);
  const weeklyMoviesBroadcastChannelRef = useRef<WeeklyMoviesBroadcastChannel | null>(null);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onReloadRef.current = onReload;
  }, [onReload]);

  useEffect(() => {
    onRemoteChangeRef.current = onRemoteChange;
  }, [onRemoteChange]);

  useEffect(() => {
    screeningsRef.current = screenings;
  }, [screenings]);

  useEffect(() => {
    const client = supabase;

    if (!client || !weekStart) return;

    let isActive = true;
    let confirmReloadTimeoutId: number | null = null;
    let reloadTimeoutId: number | null = null;

    const clearReloadTimeout = () => {
      if (reloadTimeoutId === null) return;
      window.clearTimeout(reloadTimeoutId);
      reloadTimeoutId = null;
    };

    const clearConfirmReloadTimeout = () => {
      if (confirmReloadTimeoutId === null) return;
      window.clearTimeout(confirmReloadTimeoutId);
      confirmReloadTimeoutId = null;
    };

    const runReload = async ({ notify = true }: RealtimeNoticeOptions = {}) => {
      if (!isActive) return;

      try {
        const changed = await onReloadRef.current();

        if (changed && isActive) {
          onRemoteChangeRef.current({ notify });
        }
      } catch (error) {
        if (isActive) {
          onErrorRef.current(error);
        }
      }
    };

    const scheduleReload = ({
      confirm = false,
      notify = true
    }: { confirm?: boolean; notify?: boolean } = {}) => {
      clearReloadTimeout();
      if (confirm) {
        clearConfirmReloadTimeout();
      }

      reloadTimeoutId = window.setTimeout(async () => {
        await runReload({ notify });
      }, REALTIME_RELOAD_DEBOUNCE_MS);

      if (confirm) {
        confirmReloadTimeoutId = window.setTimeout(async () => {
          await runReload({ notify });
        }, WEEKLY_MOVIES_DELETE_CONFIRM_RELOAD_MS);
      }
    };

    const handleRealtimeChange = (payload: RealtimePayload) => {
      if (!doesScreeningPayloadChangeVisibleState(payload, screeningsRef.current)) {
        return;
      }

      scheduleReload();
    };

    const handleWeeklyMoviesChange = () => {
      scheduleReload();
    };

    const handleWeeklyMoviesDelete = () => {
      scheduleReload({ confirm: true });
    };

    const handleWeeklyMoviesBroadcast = (message: WeeklyMoviesBroadcastMessage) => {
      if (message.payload?.weekStart !== weekStart) {
        return;
      }

      scheduleReload();
    };

    const handleFocusReload = () => {
      scheduleReload({ notify: false });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        scheduleReload({ notify: false });
      }
    };

    const screeningsChannel = client
      .channel(`schedule-screenings-${weekStart}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `week_start=eq.${weekStart}`,
          schema: "public",
          table: "screenings"
        },
        (payload) => handleRealtimeChange(payload as RealtimePayload)
      )
      .subscribe((status) => {
        if (!isActive) return;

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          onErrorRef.current(new Error("No se pudo activar la actualización en directo."));
        }
      });

    const weeklyMoviesChannel = client
      .channel(`schedule-weekly-movies-${weekStart}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          filter: `week_start=eq.${weekStart}`,
          schema: "public",
          table: "weekly_movies"
        },
        handleWeeklyMoviesChange
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          filter: `week_start=eq.${weekStart}`,
          schema: "public",
          table: "weekly_movies"
        },
        handleWeeklyMoviesChange
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "weekly_movies"
        },
        handleWeeklyMoviesDelete
      )
      .subscribe((status) => {
        if (!isActive) return;

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          onErrorRef.current(new Error("No se pudo activar la actualización en directo."));
        }
      });

    const weeklyMoviesBroadcastChannel = client
      .channel(`schedule-week-${weekStart}`, {
        config: {
          broadcast: {
            self: false
          }
        }
      })
      .on("broadcast", { event: "weekly_movies_changed" }, handleWeeklyMoviesBroadcast)
      .subscribe((status) => {
        if (!isActive) return;

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          onErrorRef.current(new Error("No se pudo activar la sincronización del listado semanal."));
        }
      });

    weeklyMoviesBroadcastChannelRef.current = weeklyMoviesBroadcastChannel;
    window.addEventListener("focus", handleFocusReload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isActive = false;
      clearReloadTimeout();
      clearConfirmReloadTimeout();
      window.removeEventListener("focus", handleFocusReload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (weeklyMoviesBroadcastChannelRef.current === weeklyMoviesBroadcastChannel) {
        weeklyMoviesBroadcastChannelRef.current = null;
      }
      void client.removeChannel(screeningsChannel);
      void client.removeChannel(weeklyMoviesChannel);
      void client.removeChannel(weeklyMoviesBroadcastChannel);
    };
  }, [weekStart]);

  const broadcastWeeklyMoviesChanged = useCallback(async () => {
    const channel = weeklyMoviesBroadcastChannelRef.current;

    if (!channel) return;

    try {
      await channel.send({
        event: "weekly_movies_changed",
        payload: { weekStart },
        type: "broadcast"
      });
    } catch {
      // The database change already succeeded; broadcast is only a best-effort refresh signal.
    }
  }, [weekStart]);

  return {
    broadcastWeeklyMoviesChanged
  };
}

function doesScreeningPayloadChangeVisibleState(
  payload: RealtimePayload,
  screenings: Screening[]
) {
  const record = payload.eventType === "DELETE" ? payload.old : payload.new;
  const id = getString(record, "id");

  if (!id) {
    return true;
  }

  const currentScreening = screenings.find((screening) => screening.id === id);

  if (payload.eventType === "DELETE") {
    return Boolean(currentScreening);
  }

  if (!currentScreening) {
    return true;
  }

  return !screeningMatchesRecord(currentScreening, record);
}

function screeningMatchesRecord(screening: Screening, record: RealtimeRecord | undefined) {
  return (
    screening.id === getString(record, "id") &&
    screening.weekStart === getString(record, "week_start") &&
    screening.day === getString(record, "day") &&
    screening.roomId === getString(record, "room_id") &&
    screening.movieId === getNullableString(record, "movie_id") &&
    screening.startsAt === normalizeTime(getString(record, "starts_at")) &&
    (screening.sessionLabel ?? null) === getNullableString(record, "session_label")
  );
}

function getString(record: RealtimeRecord | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : "";
}

function getNullableString(record: RealtimeRecord | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : null;
}

function normalizeTime(value: string) {
  return value ? value.slice(0, 5) : "";
}
