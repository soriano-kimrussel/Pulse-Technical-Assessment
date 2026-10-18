import { MAX_CHAT_LENGTH } from "@/lib/presence";

export type DescType = "offer" | "answer" | "ice";
export type PeerControl =
  | "video-request"
  | "video-accept"
  | "video-decline"
  | "video-end";

const CONTROLS: readonly PeerControl[] = [
  "video-request",
  "video-accept",
  "video-decline",
  "video-end",
];

export interface MediaState {
  mic: boolean;
  cam: boolean;
  revealed: boolean;
}

interface PeerCallbacks {
  onSignal: (type: DescType, payload: string) => void;
  onChat: (text: string) => void;
  onTyping: () => void;
  onControl: (ctrl: PeerControl) => void;
  onRemoteMedia: (state: MediaState) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onChannelOpen: () => void;
}

const ICE_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const BLUR_SRC = { w: 16, h: 12 };
const BLUR_OUT = { w: 320, h: 240 };
const BLUR_FPS = 15;

class BlurredTrack {
  readonly track: MediaStreamTrack;
  private timer: ReturnType<typeof setInterval>;
  private video: HTMLVideoElement;

  constructor(source: MediaStreamTrack) {
    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.srcObject = new MediaStream([source]);
    void this.video.play().catch(() => {});

    const small = document.createElement("canvas");
    small.width = BLUR_SRC.w;
    small.height = BLUR_SRC.h;
    const out = document.createElement("canvas");
    out.width = BLUR_OUT.w;
    out.height = BLUR_OUT.h;
    const sctx = small.getContext("2d")!;
    const octx = out.getContext("2d")!;
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";
    octx.fillStyle = "#000";
    octx.fillRect(0, 0, out.width, out.height);

    this.timer = setInterval(() => {
      if (this.video.readyState < 2) return;
      sctx.drawImage(this.video, 0, 0, small.width, small.height);
      octx.drawImage(small, 0, 0, out.width, out.height);
    }, 1000 / BLUR_FPS);

    this.track = out.captureStream(BLUR_FPS).getVideoTracks()[0];
  }

  stop() {
    clearInterval(this.timer);
    this.track.stop();
    this.video.srcObject = null;
  }
}

export class PeerSession {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private readonly polite: boolean;
  private makingOffer = false;
  private ignoreOffer = false;
  private closed = false;
  private readonly cb: PeerCallbacks;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  private localStream: MediaStream | null = null;
  private blurred: BlurredTrack | null = null;
  private videoSender: RTCRtpSender | null = null;
  private audioSender: RTCRtpSender | null = null;
  private media: MediaState = { mic: true, cam: true, revealed: false };

  constructor(initiator: boolean, cb: PeerCallbacks) {
    this.cb = cb;
    this.polite = !initiator;
    this.pc = new RTCPeerConnection(ICE_CONFIG);

    this.pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.cb.onSignal("ice", JSON.stringify(candidate));
      }
    };

    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) {
          this.cb.onSignal("offer", JSON.stringify(this.pc.localDescription));
        }
      } catch (err) {
        console.warn("negotiation failed", err);
      } finally {
        this.makingOffer = false;
      }
    };

    this.pc.ontrack = ({ streams }) => {
      this.cb.onRemoteStream(streams[0] ?? null);
    };

    this.pc.onconnectionstatechange = () => {
      this.cb.onConnectionState(this.pc.connectionState);
    };

    if (initiator) {
      this.dc = this.pc.createDataChannel("chat");
      this.wireDataChannel(this.dc);
    } else {
      this.pc.ondatachannel = (e) => {
        this.dc = e.channel;
        this.wireDataChannel(this.dc);
      };
    }
  }

  private wireDataChannel(dc: RTCDataChannel) {
    dc.onopen = () => this.cb.onChannelOpen();
    dc.onmessage = (e) => {
      if (typeof e.data !== "string" || e.data.length > MAX_CHAT_LENGTH * 4) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.t === "chat" && typeof msg.text === "string") {
          const text = msg.text.slice(0, MAX_CHAT_LENGTH).trim();
          if (text) this.cb.onChat(text);
        } else if (msg.t === "typing") {
          this.cb.onTyping();
        } else if (msg.t === "ctrl" && CONTROLS.includes(msg.ctrl)) {
          this.cb.onControl(msg.ctrl as PeerControl);
        } else if (msg.t === "media") {
          this.cb.onRemoteMedia({
            mic: msg.mic !== false,
            cam: msg.cam !== false,
            revealed: msg.revealed === true,
          });
        }
      } catch {}
    };
  }

  async handleSignal(type: DescType, payload: string) {
    if (this.closed) return;
    let data: unknown;
    try {
      data = JSON.parse(payload);
    } catch {
      return;
    }

    if (type === "ice") {
      const candidate = data as RTCIceCandidateInit;
      if (!this.pc.remoteDescription) {
        this.pendingCandidates.push(candidate);
        return;
      }
      try {
        await this.pc.addIceCandidate(candidate);
      } catch {}
      return;
    }

    const desc = data as RTCSessionDescriptionInit;
    const offerCollision =
      desc.type === "offer" &&
      (this.makingOffer || this.pc.signalingState !== "stable");
    this.ignoreOffer = !this.polite && offerCollision;
    if (this.ignoreOffer) return;

    try {
      await this.pc.setRemoteDescription(desc);
      await this.flushPendingCandidates();
      if (desc.type === "offer") {
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) {
          this.cb.onSignal("answer", JSON.stringify(this.pc.localDescription));
        }
      }
    } catch (err) {
      console.warn("failed to apply remote description", err);
    }
  }

  private async flushPendingCandidates() {
    if (this.pendingCandidates.length === 0) return;
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch {}
    }
  }

  sendChat(text: string) {
    this.safeSend({ t: "chat", text: text.slice(0, MAX_CHAT_LENGTH) });
  }

  sendTyping() {
    this.safeSend({ t: "typing" });
  }

  sendControl(ctrl: PeerControl) {
    this.safeSend({ t: "ctrl", ctrl });
  }

  private sendMedia() {
    this.safeSend({ t: "media", ...this.media });
  }

  private safeSend(obj: unknown) {
    if (this.dc && this.dc.readyState === "open") {
      this.dc.send(JSON.stringify(obj));
    }
  }

  get mediaState(): MediaState {
    return { ...this.media };
  }

  async startVideo(): Promise<MediaStream> {
    if (!this.localStream) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (this.closed) {
        for (const t of stream.getTracks()) t.stop();
        throw new Error("session closed");
      }
      this.localStream = stream;
      this.media = { mic: true, cam: true, revealed: false };

      const rawVideo = stream.getVideoTracks()[0];
      const audio = stream.getAudioTracks()[0];
      const outgoing = new MediaStream();
      if (rawVideo) {
        this.blurred = new BlurredTrack(rawVideo);
        outgoing.addTrack(this.blurred.track);
        this.videoSender = this.pc.addTrack(this.blurred.track, outgoing);
      }
      if (audio) {
        outgoing.addTrack(audio);
        this.audioSender = this.pc.addTrack(audio, outgoing);
      }
      this.sendMedia();
    }
    return this.localStream;
  }

  async setRevealed(revealed: boolean) {
    const rawVideo = this.localStream?.getVideoTracks()[0];
    if (!this.videoSender || !rawVideo || !this.blurred) return;
    await this.videoSender.replaceTrack(revealed ? rawVideo : this.blurred.track);
    this.media.revealed = revealed;
    this.sendMedia();
  }

  setMic(on: boolean) {
    for (const t of this.localStream?.getAudioTracks() ?? []) t.enabled = on;
    this.media.mic = on;
    this.sendMedia();
  }

  setCam(on: boolean) {
    for (const t of this.localStream?.getVideoTracks() ?? []) t.enabled = on;
    this.media.cam = on;
    this.sendMedia();
  }

  stopVideo() {
    if (!this.localStream) return;
    for (const track of this.localStream.getTracks()) track.stop();
    this.blurred?.stop();
    for (const sender of [this.videoSender, this.audioSender]) {
      if (sender) {
        try {
          this.pc.removeTrack(sender);
        } catch {}
      }
    }
    this.localStream = null;
    this.blurred = null;
    this.videoSender = null;
    this.audioSender = null;
    this.media = { mic: true, cam: true, revealed: false };
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.stopVideo();
    if (this.dc) {
      try {
        this.dc.close();
      } catch {}
    }
    try {
      this.pc.close();
    } catch {}
  }
}
