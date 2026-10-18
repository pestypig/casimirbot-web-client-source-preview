import React from "react";
import {
  FileText,
  Link2,
  Plus,
  Radio,
  Save,
  Square,
  Waves,
} from "lucide-react";
import {
  selectSituationRoomEvents,
  selectSituationRoomTranscript,
  useSituationRoomStore,
  type SituationRoom,
  type SituationRoomSource,
  type SituationRoomStoredEvent,
  type SituationRoomStoreState,
} from "@/store/useSituationRoomStore";
import { cn } from "@/lib/utils";

function formatClock(value?: string): string {
  if (!value) return "not started";
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function statusTone(status: SituationRoomSource["status"]): string {
  switch (status) {
    case "active":
    case "transcribing":
      return "border-emerald-400/50 bg-emerald-500/10 text-emerald-100";
    case "requesting":
    case "stopping":
      return "border-amber-400/50 bg-amber-500/10 text-amber-100";
    case "error":
      return "border-rose-400/50 bg-rose-500/10 text-rose-100";
    case "stopped":
      return "border-slate-500/50 bg-slate-700/20 text-slate-300";
    default:
      return "border-cyan-400/40 bg-cyan-500/10 text-cyan-100";
  }
}

function SourceTile({
  source,
  selected,
  onSelect,
  onStop,
  onAttach,
}: {
  source: SituationRoomSource;
  selected: boolean;
  onSelect: () => void;
  onStop: () => void;
  onAttach: () => void;
}) {
  const canStop = source.status === "active" || source.status === "transcribing" || source.status === "error";
  return (
    <article
      className={cn(
        "rounded-lg border bg-black/20 p-3 text-left transition-colors",
        selected ? "border-cyan-400/70 ring-1 ring-cyan-400/30" : "border-white/10 hover:border-white/25",
      )}
    >
      <button type="button" onClick={onSelect} className="block w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{source.label}</p>
            <p className="mt-1 break-all text-[11px] text-slate-400">{source.capture_source}</p>
          </div>
          <span className={cn("shrink-0 rounded border px-2 py-0.5 text-[10px]", statusTone(source.status))}>
            {source.status}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
          <span>chunks {source.chunk_index}</span>
          <span>started {formatClock(source.started_at)}</span>
        </div>
        <p className="mt-3 min-h-[38px] rounded border border-white/10 bg-slate-950/50 px-2 py-1.5 text-xs leading-5 text-slate-200">
          {source.transcript_preview || source.last_error || "Waiting for transcript audio..."}
        </p>
      </button>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onAttach}
          className="inline-flex items-center gap-1 rounded border border-white/15 bg-white/5 px-2 py-1 text-xs text-slate-200 hover:bg-white/10"
        >
          <Link2 className="h-3.5 w-3.5" />
          Attach
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={!canStop}
          className="inline-flex items-center gap-1 rounded border border-rose-400/35 bg-rose-500/10 px-2 py-1 text-xs text-rose-100 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Square className="h-3.5 w-3.5" />
          Stop
        </button>
      </div>
    </article>
  );
}

function EventRow({ event }: { event: SituationRoomStoredEvent }) {
  return (
    <div className="rounded border border-white/10 bg-black/20 px-2 py-2">
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>{event.event_type}</span>
        <span>{formatClock(event.ts)}</span>
      </div>
      {event.text ? <p className="mt-1 text-xs leading-5 text-slate-200">{event.text}</p> : null}
    </div>
  );
}

export default function SituationRoomSourcesPanel() {
  const rooms = useSituationRoomStore((state: SituationRoomStoreState) => state.rooms);
  const roomOrder = useSituationRoomStore((state: SituationRoomStoreState) => state.room_order);
  const activeRoomId = useSituationRoomStore((state: SituationRoomStoreState) => state.active_room_id);
  const sources = useSituationRoomStore((state: SituationRoomStoreState) => state.sources);
  const events = useSituationRoomStore((state: SituationRoomStoreState) => state.events);
  const createRoom = useSituationRoomStore((state: SituationRoomStoreState) => state.createRoom);
  const renameRoom = useSituationRoomStore((state: SituationRoomStoreState) => state.renameRoom);
  const setActiveRoom = useSituationRoomStore((state: SituationRoomStoreState) => state.setActiveRoom);
  const attachDisplayAudioSource = useSituationRoomStore((state: SituationRoomStoreState) => state.attachDisplayAudioSource);
  const attachMicAudioSource = useSituationRoomStore((state: SituationRoomStoreState) => state.attachMicAudioSource);
  const stopSource = useSituationRoomStore((state: SituationRoomStoreState) => state.stopSource);
  const stopRoom = useSituationRoomStore((state: SituationRoomStoreState) => state.stopRoom);
  const saveRoomAsNote = useSituationRoomStore((state: SituationRoomStoreState) => state.saveRoomAsNote);
  const attachRoomToHelixAsk = useSituationRoomStore((state: SituationRoomStoreState) => state.attachRoomToHelixAsk);
  const [selectedSourceId, setSelectedSourceId] = React.useState<string | undefined>();
  const [draftTitle, setDraftTitle] = React.useState("New Situation Room");

  const roomList = React.useMemo(
    () =>
      roomOrder
        .map((roomId: string) => rooms[roomId])
        .filter((room): room is SituationRoom => Boolean(room)),
    [roomOrder, rooms],
  );
  const activeRoom = activeRoomId ? rooms[activeRoomId] : undefined;
  const activeSources = React.useMemo(
    () =>
      activeRoom
        ? activeRoom.source_ids
            .map((sourceId: string) => sources[sourceId])
            .filter((source): source is SituationRoomSource => Boolean(source))
        : [],
    [activeRoom, sources],
  );
  const roomEvents = React.useMemo(
    () => (activeRoom ? selectSituationRoomEvents({ rooms, events }, activeRoom.room_id).slice(-80) : []),
    [activeRoom, events, rooms],
  );
  const transcript = React.useMemo(
    () => (activeRoom ? selectSituationRoomTranscript({ rooms, events }, activeRoom.room_id).slice(-80) : []),
    [activeRoom, events, rooms],
  );
  const selectedSource = selectedSourceId ? sources[selectedSourceId] : undefined;

  React.useEffect(() => {
    if (activeRoom || roomList.length > 0) return;
    createRoom("Situation Room");
  }, [activeRoom, createRoom, roomList.length]);

  React.useEffect(() => {
    if (!activeRoom || (selectedSourceId && activeRoom.source_ids.includes(selectedSourceId))) return;
    setSelectedSourceId(activeRoom.source_ids[0]);
  }, [activeRoom, selectedSourceId]);

  const handleCreateRoom = React.useCallback(() => {
    const room = createRoom(draftTitle);
    setSelectedSourceId(undefined);
    setDraftTitle("New Situation Room");
    return room;
  }, [createRoom, draftTitle]);

  const handleAttachSource = React.useCallback(() => {
    if (!activeRoom) return;
    void attachDisplayAudioSource(activeRoom.room_id).then((source: SituationRoomSource | null) => {
      if (source) setSelectedSourceId(source.source_id);
    });
  }, [activeRoom, attachDisplayAudioSource]);

  const handleAttachMicSource = React.useCallback(() => {
    if (!activeRoom) return;
    void attachMicAudioSource(activeRoom.room_id).then((source: SituationRoomSource | null) => {
      if (source) setSelectedSourceId(source.source_id);
    });
  }, [activeRoom, attachMicAudioSource]);

  return (
    <div className="grid min-h-full w-full grid-cols-1 overflow-visible bg-slate-950/95 text-slate-100 lg:grid-cols-[240px_minmax(320px,1fr)_360px]">
      <section className="flex min-h-0 flex-col border-b border-white/10 bg-slate-950/70 lg:border-b-0 lg:border-r">
        <div className="border-b border-white/10 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Radio className="h-4 w-4 text-cyan-300" />
            Situation Rooms
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              className="min-w-0 flex-1 rounded border border-white/15 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none"
            />
            <button
              type="button"
              aria-label="Create situation room"
              onClick={handleCreateRoom}
              className="h-8 w-8 shrink-0 rounded border border-cyan-400/40 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
            >
              <Plus className="mx-auto h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {roomList.length === 0 ? (
            <p className="text-xs text-slate-500">No rooms yet.</p>
          ) : (
            <div className="space-y-1.5">
              {roomList.map((room) => {
                const selected = room.room_id === activeRoomId;
                return (
                  <button
                    key={room.room_id}
                    type="button"
                    onClick={() => setActiveRoom(room.room_id)}
                    className={cn(
                      "w-full rounded-lg px-2 py-2 text-left transition-colors",
                      selected
                        ? "bg-cyan-500/20 text-white ring-1 ring-cyan-500/50"
                        : "text-slate-200 hover:bg-white/5",
                    )}
                  >
                    <p className="truncate text-sm font-medium">{room.title}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {room.source_ids.length} source{room.source_ids.length === 1 ? "" : "s"} / {room.status}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-col border-b border-white/10 lg:border-b-0 lg:border-r">
        {!activeRoom ? (
          <div className="flex h-full items-center justify-center p-6 text-sm text-slate-400">
            Create a room to attach audio sources.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 p-3">
              <input
                value={activeRoom.title}
                onChange={(event) => renameRoom(activeRoom.room_id, event.target.value)}
                className="min-w-[180px] flex-1 rounded border border-white/15 bg-slate-900 px-2 py-1.5 text-sm font-semibold text-white outline-none"
              />
              <button
                type="button"
                onClick={handleAttachSource}
                className="inline-flex items-center gap-1 rounded border border-cyan-400/40 bg-cyan-500/10 px-2 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/20"
              >
                <Waves className="h-3.5 w-3.5" />
                Attach Display Audio
              </button>
              <button
                type="button"
                onClick={handleAttachMicSource}
                className="inline-flex items-center gap-1 rounded border border-cyan-400/40 bg-cyan-500/10 px-2 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/20"
              >
                <Radio className="h-3.5 w-3.5" />
                Attach Mic
              </button>
              <button
                type="button"
                onClick={() => stopRoom(activeRoom.room_id)}
                className="inline-flex items-center gap-1 rounded border border-rose-400/35 bg-rose-500/10 px-2 py-1.5 text-xs text-rose-100 hover:bg-rose-500/20"
              >
                <Square className="h-3.5 w-3.5" />
                Stop All
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {activeSources.length === 0 ? (
                <div className="flex h-full min-h-[240px] items-center justify-center rounded-lg border border-dashed border-white/15 bg-black/20 px-6 text-center text-sm text-slate-400">
                  Attach browser tab audio, display audio, or microphone audio to start self-writing room notes. Visual screen capture is handled from the Live Answer visual source controls.
                </div>
              ) : (
                <div className="grid gap-3 xl:grid-cols-2">
                  {activeSources.map((source) => (
                    <SourceTile
                      key={source.source_id}
                      source={source}
                      selected={source.source_id === selectedSourceId}
                      onSelect={() => setSelectedSourceId(source.source_id)}
                      onStop={() => stopSource(source.source_id)}
                      onAttach={() => attachRoomToHelixAsk(activeRoom.room_id, source.source_id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <section className="flex min-h-0 flex-col bg-slate-950/70">
        <div className="border-b border-white/10 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => activeRoom && saveRoomAsNote(activeRoom.room_id)}
              disabled={!activeRoom}
              className="inline-flex items-center gap-1 rounded border border-emerald-400/40 bg-emerald-500/10 px-2 py-1.5 text-xs text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Save className="h-3.5 w-3.5" />
              Save Note
            </button>
            <button
              type="button"
              onClick={() => activeRoom && attachRoomToHelixAsk(activeRoom.room_id)}
              disabled={!activeRoom}
              className="inline-flex items-center gap-1 rounded border border-cyan-400/40 bg-cyan-500/10 px-2 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Link2 className="h-3.5 w-3.5" />
              Attach Room
            </button>
          </div>
          <div className="mt-3 rounded border border-white/10 bg-black/20 p-2 text-xs text-slate-300">
            <p className="flex items-center gap-1 font-medium text-white">
              <FileText className="h-3.5 w-3.5 text-cyan-300" />
              {selectedSource ? selectedSource.label : activeRoom?.title ?? "No active room"}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              {transcript.length} transcript chunk{transcript.length === 1 ? "" : "s"} / {roomEvents.length} event
              {roomEvents.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-rows-2">
          <div className="min-h-0 border-b border-white/10 p-3">
            <p className="mb-2 text-[11px] font-semibold text-slate-400">Transcript</p>
            <div className="h-full min-h-0 overflow-y-auto pr-1">
              {transcript.length === 0 ? (
                <p className="text-xs text-slate-500">Transcript chunks will appear here.</p>
              ) : (
                <div className="space-y-2">
                  {transcript.map((event) => (
                    <EventRow key={event.event_id} event={event} />
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="min-h-0 p-3">
            <p className="mb-2 text-[11px] font-semibold text-slate-400">Event Rail</p>
            <div className="h-full min-h-0 overflow-y-auto pr-1">
              {roomEvents.length === 0 ? (
                <p className="text-xs text-slate-500">Source lifecycle and transcript events will appear here.</p>
              ) : (
                <div className="space-y-2">
                  {roomEvents.map((event) => (
                    <EventRow key={event.event_id} event={event} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
