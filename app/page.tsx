"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EntryGate from "./components/EntryGate";
import WorldMap, { type WorldMapHandle } from "./components/WorldMap";
import Hud from "./components/Hud";
import Toast from "./components/Toast";
import RequestingCard from "./components/RequestingCard";
import ConnectionPrompt from "./components/ConnectionPrompt";
import ChatPanel, { type ChatMessage } from "./components/ChatPanel";
import VideoPanel from "./components/VideoPanel";
import { VideoIcon } from "./components/icons";
import { ApiError, block, join, leave, poll, sendSignal } from "@/lib/api";
import {
  PeerSession,
  type DescType,
  type MediaState,
  type PeerControl,
} from "@/lib/webrtc";
import { POLL_INTERVAL_MS, REQUEST_TIMEOUT_MS } from "@/lib/presence";
import type { JoinResponse, PeerDot, SignalMsg, SignalType } from "@/lib/types";
import { DEFAULT_VIBE, getVibe, type VibeId } from "@/lib/vibes";

type Conn =
  | { kind: "idle" }
  | { kind: "requesting"; peerId: string; vibe: VibeId }
  | { kind: "incoming"; peerId: string; vibe: VibeId }
  | { kind: "connecting"; peerId: string; vibe: VibeId }
  | { kind: "connected"; peerId: string; vibe: VibeId };

type VideoState = "none" | "requesting" | "incoming" | "active";

const CONNECT_TIMEOUT_MS = 25_000;
const DEFAULT_MEDIA: MediaState = { mic: true, cam: true, revealed: false };
const TITLE = "Pulse - a living globe of strangers";

function distanceLabel(
  a: { lat: number; lng: number } | null,
  b: { lat: number; lng: number } | undefined,
): string | null {
  if (!a || !b) return null;
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(h));
  if (km < 10) return "close by";
  const step = km < 100 ? 10 : km < 1000 ? 50 : 100;
  return `~${(Math.round(km / step) * step).toLocaleString()} km away`;
}

export default function Home() {
  const [phase, setPhase] = useState<"gate" | "live">("gate");
  const [gateNotice, setGateNotice] = useState<string | null>(null);
  const [session, _setSession] = useState<JoinResponse | null>(null);
  const sessionRef = useRef<JoinResponse | null>(null);
  const setSession = (s: JoinResponse | null) => {
    sessionRef.current = s;
    _setSession(s);
  };
  const rawLocRef = useRef<{ lat: number; lng: number } | null>(null);
  const [vibe, setVibe] = useState<VibeId>(DEFAULT_VIBE);
  const vibeRef = useRef<VibeId>(vibe);

  const [peers, setPeers] = useState<PeerDot[]>([]);
  const peersRef = useRef<PeerDot[]>(peers);
  const [filter, setFilter] = useState<VibeId | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localMedia, setLocalMedia] = useState<MediaState>(DEFAULT_MEDIA);
  const [remoteMedia, _setRemoteMedia] = useState<MediaState | null>(null);
  const remoteMediaRef = useRef<MediaState | null>(null);
  const setRemoteMedia = (m: MediaState | null) => {
    remoteMediaRef.current = m;
    _setRemoteMedia(m);
  };
  const [remoteTyping, setRemoteTyping] = useState(false);
  const [chatOpenMobile, _setChatOpenMobile] = useState(false);
  const chatOpenMobileRef = useRef(false);
  const setChatOpenMobile = (v: boolean) => {
    chatOpenMobileRef.current = v;
    _setChatOpenMobile(v);
    if (v) setUnread(false);
  };
  const [unread, setUnread] = useState(false);

  const [conn, _setConn] = useState<Conn>({ kind: "idle" });
  const connRef = useRef<Conn>(conn);
  const setConn = (c: Conn) => {
    connRef.current = c;
    _setConn(c);
  };

  const [video, _setVideo] = useState<VideoState>("none");
  const videoRef = useRef<VideoState>(video);
  const setVideo = (v: VideoState) => {
    videoRef.current = v;
    _setVideo(v);
  };

  const mapRef = useRef<WorldMapHandle>(null);
  const peerRef = useRef<PeerSession | null>(null);
  const msgId = useRef(0);
  const requestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recovering = useRef(false);

  useEffect(() => {
    peersRef.current = peers;
    vibeRef.current = vibe;
  });

  const myDot = useMemo(
    () => (session ? { lat: session.lat, lng: session.lng } : null),
    [session],
  );

  function signal(toId: string, type: SignalType, payload?: string) {
    return sendSignal(sessionRef.current?.token ?? "", toId, type, payload);
  }

  function peerVibeOf(id: string): VibeId {
    return peersRef.current.find((p) => p.id === id)?.vibe ?? DEFAULT_VIBE;
  }

  function showNotice(text: string) {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(null), 3800);
  }

  function addMessage(from: ChatMessage["from"], text: string) {
    setMessages((prev) => [...prev, { id: msgId.current++, from, text, at: Date.now() }]);
  }

  function clearTimers() {
    for (const t of [requestTimer, connectTimer, typingTimer]) {
      if (t.current) clearTimeout(t.current);
      t.current = null;
    }
  }

  function teardown(message?: string) {
    clearTimers();
    peerRef.current?.close();
    peerRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setLocalMedia(DEFAULT_MEDIA);
    setRemoteMedia(null);
    setRemoteTyping(false);
    setChatOpenMobile(false);
    setUnread(false);
    setVideo("none");
    setMessages([]);
    setConn({ kind: "idle" });
    if (message) showNotice(message);
  }

  function startPeer(peerId: string, initiator: boolean, peerVibe: VibeId) {
    const ps = new PeerSession(initiator, {
      onSignal: (type: DescType, payload: string) => {
        void signal(peerId, type, payload);
      },
      onChat: (text) => {
        addMessage("them", text);
        setRemoteTyping(false);
        if (videoRef.current === "active" && !chatOpenMobileRef.current) setUnread(true);
      },
      onTyping: () => {
        setRemoteTyping(true);
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setRemoteTyping(false), 3500);
      },
      onControl: (ctrl) => handleControl(ctrl),
      onRemoteMedia: (state) => {
        const prev = remoteMediaRef.current;
        if (prev && !prev.revealed && state.revealed) addMessage("system", "Stranger revealed their camera");
        setRemoteMedia(state);
      },
      onRemoteStream: (stream) => setRemoteStream(stream),
      onConnectionState: (state) => {
        if (state === "failed") {
          void signal(peerId, "end");
          teardown("Connection lost. The network blocked a direct link.");
        }
      },
      onChannelOpen: () => {
        if (connectTimer.current) clearTimeout(connectTimer.current);
        setConn({ kind: "connected", peerId, vibe: peerVibe });
        addMessage("system", "Connected directly · nothing passes through our servers");
      },
    });
    peerRef.current = ps;

    connectTimer.current = setTimeout(() => {
      const c = connRef.current;
      if (c.kind === "connecting" && c.peerId === peerId) {
        void signal(peerId, "end");
        teardown("Couldn't open a direct connection. Their network may block peer-to-peer.");
      }
    }, CONNECT_TIMEOUT_MS);
  }

  function beginVideo(ps: PeerSession, announce: () => void) {
    ps.startVideo()
      .then((stream) => {
        setLocalStream(stream);
        setLocalMedia(ps.mediaState);
        announce();
        setVideo("active");
        addMessage("system", "Video started · you both begin blurred");
      })
      .catch(() => {
        ps.sendControl(videoRef.current === "requesting" ? "video-end" : "video-decline");
        setVideo("none");
        showNotice("Camera or microphone unavailable.");
      });
  }

  function stopVideoLocally(announce: boolean) {
    const wasActive = videoRef.current === "active";
    peerRef.current?.stopVideo();
    setLocalStream(null);
    setRemoteStream(null);
    setLocalMedia(DEFAULT_MEDIA);
    setRemoteMedia(null);
    setChatOpenMobile(false);
    setVideo("none");
    if (announce && wasActive) addMessage("system", "Video ended");
  }

  function handleControl(ctrl: PeerControl) {
    const ps = peerRef.current;
    if (!ps) return;
    switch (ctrl) {
      case "video-request":
        if (videoRef.current === "none") setVideo("incoming");
        else if (videoRef.current === "requesting") beginVideo(ps, () => ps.sendControl("video-accept"));
        break;
      case "video-accept":
        if (videoRef.current === "requesting") beginVideo(ps, () => {});
        break;
      case "video-decline":
        if (videoRef.current === "requesting") {
          setVideo("none");
          showNotice("They'd rather keep it to text for now.");
        }
        break;
      case "video-end":
        if (videoRef.current === "incoming") showNotice("Video request withdrawn.");
        stopVideoLocally(true);
        break;
    }
  }

  async function requestConnection(peerId: string) {
    if (connRef.current.kind !== "idle" || !sessionRef.current) return;
    const peerVibe = peerVibeOf(peerId);
    setConn({ kind: "requesting", peerId, vibe: peerVibe });
    const r = await signal(peerId, "request");

    const c = connRef.current as Conn;
    if (c.kind !== "requesting" || c.peerId !== peerId) {
      if (r.ok && !r.autoDeclined) void signal(peerId, "end");
      return;
    }
    if (!r.ok) {
      teardown(
        r.status === 429
          ? "Easy there. Wait a moment before knocking again."
          : "Couldn't send the request. Try again.",
      );
      return;
    }
    if (r.autoDeclined) {
      teardown("They're not available right now.");
      return;
    }
    requestTimer.current = setTimeout(() => {
      const cur = connRef.current;
      if (cur.kind === "requesting" && cur.peerId === peerId) {
        void signal(peerId, "end");
        teardown("No answer this time. Try another dot!");
      }
    }, REQUEST_TIMEOUT_MS);
  }

  function surpriseMe() {
    const candidates = peersRef.current.filter(
      (p) => !p.busy && (filter === null || p.vibe === filter),
    );
    if (candidates.length === 0) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    void requestConnection(pick.id);
  }

  function cancelRequest() {
    const c = connRef.current;
    if (c.kind === "requesting") void signal(c.peerId, "end");
    teardown();
  }

  async function acceptIncoming() {
    const c = connRef.current;
    if (c.kind !== "incoming") return;
    startPeer(c.peerId, false, c.vibe);
    setConn({ kind: "connecting", peerId: c.peerId, vibe: c.vibe });
    const r = await signal(c.peerId, "accept");
    const cur = connRef.current;
    if (!r.ok && cur.kind === "connecting" && cur.peerId === c.peerId) {
      teardown(r.status === 409 ? "That request has already expired." : "Couldn't connect. Try again.");
    }
  }

  function declineIncoming() {
    const c = connRef.current;
    if (c.kind !== "incoming") return;
    void signal(c.peerId, "decline");
    setConn({ kind: "idle" });
  }

  function endConnection() {
    const c = connRef.current;
    if (c.kind === "connecting" || c.kind === "connected") {
      void signal(c.peerId, "end");
    }
    teardown();
  }

  function blockPeer() {
    const c = connRef.current;
    const token = sessionRef.current?.token;
    if (c.kind === "idle" || !token) return;
    void block(token, c.peerId);
    teardown("Blocked. You won't see each other again this session.");
  }

  function startVideoRequest() {
    if (videoRef.current !== "none" || !peerRef.current) return;
    setVideo("requesting");
    peerRef.current.sendControl("video-request");
  }

  function cancelVideoRequest() {
    if (videoRef.current !== "requesting") return;
    peerRef.current?.sendControl("video-end");
    setVideo("none");
  }

  function acceptVideo() {
    const ps = peerRef.current;
    if (!ps || videoRef.current !== "incoming") return;
    beginVideo(ps, () => ps.sendControl("video-accept"));
  }

  function declineVideo() {
    peerRef.current?.sendControl("video-decline");
    setVideo("none");
  }

  function endVideo() {
    peerRef.current?.sendControl("video-end");
    stopVideoLocally(true);
  }

  function toggleMic() {
    const ps = peerRef.current;
    if (!ps) return;
    ps.setMic(!ps.mediaState.mic);
    setLocalMedia(ps.mediaState);
  }

  function toggleCam() {
    const ps = peerRef.current;
    if (!ps) return;
    ps.setCam(!ps.mediaState.cam);
    setLocalMedia(ps.mediaState);
  }

  async function toggleReveal() {
    const ps = peerRef.current;
    if (!ps) return;
    await ps.setRevealed(!ps.mediaState.revealed);
    setLocalMedia(ps.mediaState);
  }

  function processSignal(sig: SignalMsg) {
    const c = connRef.current;
    const fromCurrent = c.kind !== "idle" && c.peerId === sig.fromId;
    switch (sig.type) {
      case "request": {
        if (c.kind === "idle") {
          setConn({ kind: "incoming", peerId: sig.fromId, vibe: peerVibeOf(sig.fromId) });
          navigator.vibrate?.(60);
        } else {
          void signal(sig.fromId, "decline");
        }
        break;
      }
      case "accept": {
        if (c.kind === "requesting" && fromCurrent) {
          if (requestTimer.current) clearTimeout(requestTimer.current);
          startPeer(sig.fromId, true, c.vibe);
          setConn({ kind: "connecting", peerId: sig.fromId, vibe: c.vibe });
        }
        break;
      }
      case "decline": {
        if (c.kind === "requesting" && fromCurrent) {
          teardown("They passed this time. Plenty more dots out there!");
        }
        break;
      }
      case "offer":
      case "answer":
      case "ice": {
        if ((c.kind === "connecting" || c.kind === "connected") && fromCurrent && peerRef.current) {
          void peerRef.current.handleSignal(sig.type as DescType, sig.payload ?? "");
        }
        break;
      }
      case "end": {
        if (!fromCurrent) break;
        if (c.kind === "incoming") {
          setConn({ kind: "idle" });
          showNotice("They withdrew the request.");
        } else if (c.kind === "requesting") {
          teardown("They left before answering.");
        } else {
          teardown("The stranger left the chat.");
        }
        break;
      }
    }
  }

  async function recoverSession() {
    if (recovering.current) return;
    recovering.current = true;
    const hadConn = connRef.current.kind !== "idle";
    teardown(hadConn ? "You were away for a while, so we reconnected you with a fresh dot." : undefined);
    try {
      const raw = rawLocRef.current;
      if (!raw) throw new Error("no location");
      setSession(await join(raw.lat, raw.lng, vibeRef.current));
    } catch {
      setSession(null);
      setPeers([]);
      setPhase("gate");
      setGateNotice("Lost connection to Pulse. Please enter again.");
    } finally {
      recovering.current = false;
    }
  }

  const processSignalRef = useRef(processSignal);
  const recoverRef = useRef(recoverSession);
  useEffect(() => {
    processSignalRef.current = processSignal;
    recoverRef.current = recoverSession;
  });

  useEffect(() => {
    if (phase !== "live") return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const token = sessionRef.current?.token;
      if (token) {
        try {
          const data = await poll(token);
          if (!active || sessionRef.current?.token !== token) return schedule();
          setPeers(data.peers);
          for (const s of data.signals) processSignalRef.current(s);
          const stuck = data.self.peerId ?? data.self.pendingTo;
          if (stuck && connRef.current.kind === "idle") {
            void sendSignal(token, stuck, "end");
          }
        } catch (err) {
          if (active && err instanceof ApiError && err.status === 401) {
            await recoverRef.current();
          }
        }
      }
      schedule();
    };
    const schedule = () => {
      if (active) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    void tick();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "live") return;
    const onLeave = () => {
      const token = sessionRef.current?.token;
      if (token) leave(token);
    };
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, [phase]);

  useEffect(() => {
    document.title = conn.kind === "incoming" ? "● Someone wants to talk · Pulse" : TITLE;
  }, [conn.kind]);

  async function handleEnter(lat: number, lng: number, v: VibeId) {
    rawLocRef.current = { lat, lng };
    setVibe(v);
    vibeRef.current = v;
    const res = await join(lat, lng, v);
    setSession(res);
    setGateNotice(null);
    setPhase("live");
  }

  function handleLeave() {
    endConnection();
    const token = sessionRef.current?.token;
    if (token) leave(token);
    setSession(null);
    setPeers([]);
    setFilter(null);
    rawLocRef.current = null;
    setPhase("gate");
  }

  const inChat = conn.kind === "connecting" || conn.kind === "connected";
  const activePeer = conn.kind === "idle" ? undefined : peers.find((p) => p.id === conn.peerId);
  const peerVibe = getVibe(conn.kind === "idle" ? null : conn.vibe);
  const distance = distanceLabel(myDot, activePeer);

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      <WorldMap
        ref={mapRef}
        peers={phase === "live" ? peers : []}
        me={phase === "live" ? myDot : null}
        onPeerClick={(id) => void requestConnection(id)}
        canConnect={conn.kind === "idle"}
        filter={filter}
        idle={phase === "gate"}
      />

      {phase === "gate" && <EntryGate onEnter={handleEnter} notice={gateNotice} />}

      {phase === "live" && (
        <>
          <Hud
            peers={peers}
            myVibe={vibe}
            filter={filter}
            onFilter={setFilter}
            onLeave={handleLeave}
            onRecenter={() => mapRef.current?.recenter()}
            onSurprise={surpriseMe}
            canConnect={conn.kind === "idle"}
            inChat={inChat}
          />

          {notice && <Toast text={notice} />}

          {conn.kind === "requesting" && (
            <RequestingCard
              vibe={peerVibe}
              distance={distance}
              timeoutMs={REQUEST_TIMEOUT_MS}
              onCancel={cancelRequest}
            />
          )}

          {conn.kind === "incoming" && (
            <ConnectionPrompt
              title="Someone wants to talk"
              subtitle={`${peerVibe.emoji} ${peerVibe.label}${distance ? ` · ${distance}` : ""}`}
              vibe={peerVibe}
              acceptLabel="Say hi"
              declineLabel="Not now"
              countdownMs={REQUEST_TIMEOUT_MS - POLL_INTERVAL_MS}
              onAccept={() => void acceptIncoming()}
              onDecline={declineIncoming}
            />
          )}

          {inChat && (
            <ChatPanel
              messages={messages}
              connected={conn.kind === "connected"}
              peerVibe={peerVibe}
              distance={distance}
              remoteTyping={remoteTyping}
              videoBusy={video !== "none"}
              hiddenOnMobile={video === "active" && !chatOpenMobile}
              onSend={(text) => {
                peerRef.current?.sendChat(text);
                addMessage("me", text);
              }}
              onTyping={() => peerRef.current?.sendTyping()}
              onStartVideo={startVideoRequest}
              onBlock={blockPeer}
              onEnd={endConnection}
              onCloseMobile={video === "active" ? () => setChatOpenMobile(false) : undefined}
            />
          )}

          {video === "requesting" && (
            <div className="anim-drop-in glass-strong absolute left-1/2 top-20 z-50 flex items-center gap-3 rounded-full py-2 pl-4 pr-2 text-sm text-ink md:left-[calc((100%-452px)/2)]">
              <VideoIcon size={16} className="text-accent" />
              Waiting for them to accept video...
              <button onClick={cancelVideoRequest} className="btn-ghost rounded-full px-3 py-1 text-xs">
                Cancel
              </button>
            </div>
          )}

          {video === "incoming" && (
            <ConnectionPrompt
              title="Start a video call?"
              subtitle="You'll both start blurred. Reveal only when you're ready."
              vibe={peerVibe}
              icon={<VideoIcon size={26} />}
              acceptLabel="Join video"
              declineLabel="Keep texting"
              onAccept={acceptVideo}
              onDecline={declineVideo}
            />
          )}

          {video === "active" && (
            <VideoPanel
              localStream={localStream}
              remoteStream={remoteStream}
              local={localMedia}
              remote={remoteMedia}
              unread={unread}
              onToggleMic={toggleMic}
              onToggleCam={toggleCam}
              onToggleReveal={() => void toggleReveal()}
              onOpenChat={() => setChatOpenMobile(true)}
              onEnd={endVideo}
            />
          )}
        </>
      )}
    </main>
  );
}
