"use client";

import { clsx } from "clsx";

export type SaveState = "saved" | "saving" | "error";

type StatusBadgeProps = {
  isConfigured: boolean;
  saveError: string;
  saveState: SaveState;
};

export function StatusBadge({ isConfigured, saveError, saveState }: StatusBadgeProps) {
  const label =
    saveState === "saving"
      ? "Guardando"
      : saveState === "error"
        ? saveError || "Error al guardar"
        : isConfigured
          ? "Supabase guardado"
          : "Local guardado";

  return (
    <div
      className="inline-flex min-h-10 items-center gap-2 rounded-md border border-babel-line bg-babel-panel px-3 py-2 text-xs text-zinc-300"
      title={saveError}
    >
      <span
        className={clsx(
          "h-2 w-2 rounded-full",
          saveState === "saving" && "bg-yellow-300",
          saveState === "saved" && "bg-green-400",
          saveState === "error" && "bg-red-400"
        )}
      />
      {label}
    </div>
  );
}
