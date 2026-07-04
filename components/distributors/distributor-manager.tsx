"use client";

import { Distributor } from "@/lib/schedule/types";

type DistributorManagerProps = {
  activeActionId: string | null;
  activeAction: "remove" | "merge" | null;
  distributors: Distributor[];
  editingDistributorId: string | null;
  isOpen: boolean;
  mergeTargetDistributorId: string;
  movieCounts: Map<string, number>;
  renameDraft: string;
  onCancelAction: () => void;
  onCancelRename: () => void;
  onDetachAndRemove: (distributor: Distributor) => void;
  onMerge: (distributor: Distributor) => void;
  onRequestMerge: (distributor: Distributor) => void;
  onRemove: (distributor: Distributor) => void;
  onRename: (distributor: Distributor) => void;
  onRenameDraftChange: (value: string) => void;
  onSelectMergeTarget: (distributorId: string) => void;
  onStartRename: (distributor: Distributor) => void;
  onToggle: () => void;
};

export function DistributorManager({
  activeActionId,
  activeAction,
  distributors,
  editingDistributorId,
  isOpen,
  mergeTargetDistributorId,
  movieCounts,
  renameDraft,
  onCancelAction,
  onCancelRename,
  onDetachAndRemove,
  onMerge,
  onRequestMerge,
  onRemove,
  onRename,
  onRenameDraftChange,
  onSelectMergeTarget,
  onStartRename,
  onToggle
}: DistributorManagerProps) {
  return (
    <section className="rounded-md border border-babel-line bg-babel-panel p-4">
      <button
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={onToggle}
      >
        <span>
          <span className="block font-medium">Distribuidoras</span>
          <span className="text-xs text-zinc-500">{distributors.length} registradas</span>
        </span>
        <span className="rounded border border-babel-line px-2 py-1 text-xs text-zinc-300">
          {isOpen ? "Ocultar" : "Ver"}
        </span>
      </button>

      {isOpen ? (
        <div className="mt-3 space-y-2">
          {distributors.length ? (
            distributors.map((distributor) => {
              const usageCount = movieCounts.get(distributor.id) ?? 0;
              const isEditing = editingDistributorId === distributor.id;
              const isActionOpen = activeActionId === distributor.id;
              const isMergeOpen = isActionOpen && activeAction === "merge";
              const isRemoveOpen = isActionOpen && activeAction === "remove";
              const mergeTargets = distributors.filter((item) => item.id !== distributor.id);

              return (
                <div key={distributor.id} className="rounded-md bg-babel-card p-2">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        value={renameDraft}
                        onChange={(event) => onRenameDraftChange(event.target.value)}
                        className="h-9 w-full rounded-md border border-babel-line bg-zinc-950/40 px-2 text-sm text-white outline-none transition focus:border-babel-red"
                      />
                      <div className="flex gap-2">
                        <button
                          className="h-8 flex-1 rounded bg-babel-red px-2 text-xs font-medium text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => onRename(distributor)}
                          disabled={!renameDraft.trim()}
                        >
                          Guardar
                        </button>
                        <button
                          className="h-8 rounded border border-babel-line px-2 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                          onClick={onCancelRename}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {distributor.name}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {usageCount === 1 ? "1 pelicula" : `${usageCount} peliculas`}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          <button
                            className="h-7 rounded border border-babel-line px-2 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                            onClick={() => onStartRename(distributor)}
                          >
                            Editar
                          </button>
                          <button
                            className="h-7 rounded border border-babel-line px-2 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => onRequestMerge(distributor)}
                            disabled={mergeTargets.length === 0}
                          >
                            Fusionar
                          </button>
                          <button
                            className="h-7 rounded border border-babel-line px-2 text-xs text-zinc-300 transition hover:border-red-500 hover:bg-red-950/30 hover:text-white"
                            onClick={() => onRemove(distributor)}
                          >
                            Borrar
                          </button>
                        </div>
                      </div>

                      {isRemoveOpen && usageCount > 0 ? (
                        <div className="mt-2 space-y-2 rounded border border-red-500/40 bg-red-950/20 p-2">
                          <p className="text-xs text-red-200">
                            Esta distribuidora esta usada en {usageCount}{" "}
                            {usageCount === 1 ? "pelicula" : "peliculas"}.
                          </p>
                          <button
                            className="h-8 w-full rounded border border-babel-line px-2 text-xs text-zinc-200 transition hover:border-red-500 hover:bg-red-950/40"
                            onClick={() => onDetachAndRemove(distributor)}
                          >
                            Quitar distribuidora de esas peliculas
                          </button>
                          <button
                            className="h-8 w-full rounded border border-babel-line px-2 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                            onClick={onCancelAction}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : null}

                      {isMergeOpen ? (
                        <div className="mt-2 space-y-2 rounded border border-babel-line bg-zinc-950/30 p-2">
                          <p className="text-xs text-zinc-400">
                            Mover {usageCount}{" "}
                            {usageCount === 1 ? "pelicula" : "peliculas"} a:
                          </p>
                          <div className="grid grid-cols-[1fr_auto] gap-2">
                            <select
                              value={mergeTargetDistributorId}
                              onChange={(event) => onSelectMergeTarget(event.target.value)}
                              className="h-8 min-w-0 rounded border border-babel-line bg-zinc-950/40 px-2 text-xs text-white outline-none transition focus:border-babel-red"
                            >
                              {mergeTargets.map((target) => (
                                <option key={target.id} value={target.id}>
                                  {target.name}
                                </option>
                              ))}
                            </select>
                            <button
                              className="h-8 rounded bg-white px-2 text-xs font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                              onClick={() => onMerge(distributor)}
                              disabled={!mergeTargets.length || !mergeTargetDistributorId}
                            >
                              Confirmar
                            </button>
                          </div>
                          <button
                            className="h-8 w-full rounded border border-babel-line px-2 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                            onClick={onCancelAction}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })
          ) : (
            <div className="rounded-md border border-dashed border-zinc-700 p-4 text-center text-sm text-zinc-500">
              Sin distribuidoras
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
