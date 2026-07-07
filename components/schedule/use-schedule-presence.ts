"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

const PRESENCE_CHANNEL = "schedule-presence";
const PRESENCE_CLIENT_ID_KEY = "babel-programacion-presence-client-id";

type PresenceMeta = {
  clientId?: unknown;
  onlineAt?: unknown;
  weekStart?: unknown;
};

type PresenceState = Record<string, PresenceMeta[]>;

type PresenceCounts = {
  otherClientCount: number;
  sameWeekClientCount: number;
};

export function useSchedulePresence(weekStart: string) {
  const [clientId] = useState(() => getOrCreatePresenceClientId());
  const [presenceCounts, setPresenceCounts] = useState<PresenceCounts>({
    otherClientCount: 0,
    sameWeekClientCount: 0
  });

  useEffect(() => {
    const client = supabase;

    if (!client || !clientId || !weekStart) {
      return;
    }

    let isActive = true;

    const channel = client
      .channel(PRESENCE_CHANNEL, {
        config: {
          presence: {
            key: clientId
          }
        }
      })
      .on("presence", { event: "sync" }, () => {
        if (!isActive) return;

        setPresenceCounts(
          getPresenceCounts(channel.presenceState() as PresenceState, clientId, weekStart)
        );
      })
      .subscribe((status) => {
        if (!isActive || status !== "SUBSCRIBED") return;

        void channel
          .track({
            clientId,
            onlineAt: new Date().toISOString(),
            weekStart
          })
          .catch(() => undefined);
      });

    return () => {
      isActive = false;
      void channel.untrack().catch(() => undefined);
      void client.removeChannel(channel);
    };
  }, [clientId, weekStart]);

  return presenceCounts;
}

function getOrCreatePresenceClientId() {
  const fallbackId = createPresenceClientId();

  if (typeof window === "undefined") {
    return fallbackId;
  }

  try {
    const storedClientId = window.sessionStorage.getItem(PRESENCE_CLIENT_ID_KEY);

    if (storedClientId) {
      return storedClientId;
    }

    window.sessionStorage.setItem(PRESENCE_CLIENT_ID_KEY, fallbackId);
    return fallbackId;
  } catch {
    return fallbackId;
  }
}

function createPresenceClientId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getPresenceCounts(
  presenceState: PresenceState,
  currentClientId: string,
  currentWeekStart: string
): PresenceCounts {
  const otherClientIds = new Set<string>();
  const sameWeekClientIds = new Set<string>();

  Object.values(presenceState).forEach((metas) => {
    metas.forEach((meta) => {
      if (typeof meta.clientId !== "string" || meta.clientId === currentClientId) {
        return;
      }

      otherClientIds.add(meta.clientId);

      if (meta.weekStart === currentWeekStart) {
        sameWeekClientIds.add(meta.clientId);
      }
    });
  });

  return {
    otherClientCount: otherClientIds.size,
    sameWeekClientCount: sameWeekClientIds.size
  };
}
