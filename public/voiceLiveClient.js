// 브라우저측 Voice Live WebRTC 클라이언트.
// 시그널링 WS(/ws) 연결 → RTCPeerConnection(마이크/스피커, 데이터 채널) →
// SDP offer/answer 교환 → 비오디오 이벤트(트랜스크립트 등)를 콜백으로 전달.
// 오디오는 브라우저↔Azure RTP로 직접 흐른다(릴레이를 거치지 않음).

const DATA_CHANNEL_NAME = 'voice-live-events';
const log = (...args) => console.log('[VL]', ...args);

export class VoiceLiveClient {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.signalWs = null;
    this.pc = null;
    this.dataChannel = null;
    this.localStream = null;
  }

  #status(status) {
    this.handlers.onStatus?.(status);
  }

  #emit(event) {
    this.handlers.onEvent?.(event);
  }

  #fail(message) {
    log('실패:', message);
    this.handlers.onError?.(message);
    this.#status('error');
    this.stop();
  }

  async start() {
    this.#status('connecting');
    try {
      await this.#openSignaling();
    } catch (err) {
      this.#fail(err.message || '세션 시작에 실패했습니다.');
    }
  }

  #openSignaling() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws`);
      this.signalWs = ws;

      ws.addEventListener('open', () => log('signaling open'));
      ws.addEventListener('message', (e) => this.#onSignalMessage(e, resolve, reject));
      ws.addEventListener('error', () => reject(new Error('시그널링 연결 오류.')));
      ws.addEventListener('close', () => {
        log('signaling close');
        if (this.pc) this.#status('idle');
      });
    });
  }

  async #onSignalMessage(event, resolve, reject) {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    log('signal ←', message.type);

    switch (message.type) {
      case 'relay.ready':
        try {
          await this.#negotiateWebRtc();
          resolve();
        } catch (err) {
          reject(err);
        }
        break;

      case 'rtc.call.sdp.created':
        await this.#applyAnswer(message.sdp_answer);
        break;

      case 'rtc.call.error':
      case 'error':
        this.#fail(message.error?.message || 'Voice Live 오류가 발생했습니다.');
        break;

      case 'relay.error':
        this.#fail(message.message || '릴레이 오류.');
        break;

      case 'relay.closed':
        this.#status('idle');
        break;

      default:
        // session.created / session.updated / 함수 호출 이벤트 등.
        this.#emit(message);
    }
  }

  async #negotiateWebRtc() {
    const pc = new RTCPeerConnection();
    this.pc = pc;

    // 마이크 캡처 후 송신 트랙 추가.
    // autoGainControl을 끄면 침묵 구간에서 배경 소음이 증폭되지 않아 VAD의 발화 종료 감지가 안정적이다.
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
    });
    this.localStream.getTracks().forEach((t) => pc.addTrack(t, this.localStream));

    // 모델 오디오 재생.
    pc.ontrack = (e) => {
      log('remote track 수신');
      this.handlers.onRemoteTrack?.(e.streams[0]);
    };

    // 비오디오 이벤트용 데이터 채널.
    this.dataChannel = pc.createDataChannel(DATA_CHANNEL_NAME);
    this.dataChannel.onopen = () => log('data channel open');
    this.dataChannel.onclose = () => log('data channel close');
    this.dataChannel.onerror = (e) => log('data channel error', e?.error?.message ?? e);
    this.dataChannel.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        log('data ←', msg.type);
        this.#emit(msg);
      } catch {
        /* noop */
      }
    };

    pc.oniceconnectionstatechange = () => log('ICE:', pc.iceConnectionState);
    pc.onconnectionstatechange = () => {
      log('PC:', pc.connectionState);
      if (pc.connectionState === 'connected') this.#status('live');
      if (['failed', 'disconnected'].includes(pc.connectionState)) {
        this.#status('error');
      }
    };

    // offer 생성 후 ICE 후보가 SDP에 모두 담길 때까지 대기.
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.#waitForIceGathering(pc);

    log('SDP offer 전송');
    this.#send({ type: 'rtc.call.sdp.create', sdp_offer: pc.localDescription.sdp });
  }

  #waitForIceGathering(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      const check = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', check);
    });
  }

  async #applyAnswer(sdpAnswer) {
    if (!sdpAnswer) {
      this.#fail('서버에서 SDP answer를 받지 못했습니다.');
      return;
    }
    log('SDP answer 적용');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });
  }

  #send(payload) {
    if (this.signalWs?.readyState === WebSocket.OPEN) {
      this.signalWs.send(JSON.stringify(payload));
    }
  }

  // 제어 채널로 원시 클라이언트 이벤트(예: session.update)를 보낸다.
  sendControlEvent(event) {
    this.#send(event);
  }

  // 세션을 종료하고 마이크를 해제한다.
  stop() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;

    try {
      this.dataChannel?.close();
    } catch {
      /* noop */
    }
    this.dataChannel = null;

    try {
      this.pc?.close();
    } catch {
      /* noop */
    }
    this.pc = null;

    try {
      this.signalWs?.close();
    } catch {
      /* noop */
    }
    this.signalWs = null;

    this.#status('idle');
  }
}
