import { VoiceLiveClient } from './voiceLiveClient.js';

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const metaEl = document.getElementById('meta');
const logEl = document.getElementById('log');
const remoteAudio = document.getElementById('remoteAudio');

// 진행 중인 버블(스트리밍 델타를 이어 붙이기 위함).
let assistantBubble = null;
let userBubble = null;

const STATUS_LABEL = {
  idle: 'idle',
  connecting: 'connecting…',
  live: '● live',
  error: 'error',
};

function setStatus(status) {
  statusEl.textContent = STATUS_LABEL[status] ?? status;
  statusEl.className = `status status--${status}`;
  const running = status === 'connecting' || status === 'live';
  startBtn.disabled = running;
  stopBtn.disabled = !running;
}

function addBubble(role, text) {
  const bubble = document.createElement('div');
  bubble.className = `bubble bubble--${role}`;
  const label = document.createElement('span');
  label.className = 'bubble__role';
  label.textContent = role;
  const body = document.createElement('span');
  body.textContent = text;
  bubble.append(label, body);
  logEl.appendChild(bubble);
  logEl.scrollTop = logEl.scrollHeight;
  return body;
}

// 데이터/제어 채널로 들어오는 비오디오 이벤트를 화면에 렌더링한다.
function handleEvent(event) {
  switch (event.type) {
    // 사용자 발화 트랜스크립트.
    // 사용자가 말하기 시작하면(끼어들기) 에이전트 음성을 즉시 음소거해
    // 출력 음성이 입력 VAD를 계속 "발화 중"으로 묶지 않도록 한다(발화 종료 감지 보장).
    case 'input_audio_buffer.speech_started':
      remoteAudio.muted = true;
      break;

    // 새 응답 음성 재생 시작 → 다시 들리도록 음소거 해제.
    case 'output_audio_buffer.started':
      remoteAudio.muted = false;
      break;

    // 사용자 발화 트랜스크립트(스트리밍 델타).
    case 'conversation.item.input_audio_transcription.delta':
      if (!userBubble) userBubble = addBubble('user', '');
      userBubble.textContent += event.delta ?? '';
      logEl.scrollTop = logEl.scrollHeight;
      break;

    // 사용자 발화 트랜스크립트(최종). 델타가 없던 모델도 여기서 표시한다.
    case 'conversation.item.input_audio_transcription.completed': {
      const text = (event.transcript ?? '').trim();
      if (userBubble) {
        if (text) userBubble.textContent = text;
      } else if (text) {
        addBubble('user', text);
      }
      userBubble = null;
      break;
    }

    // 어시스턴트 트랜스크립트(스트리밍 델타).
    case 'response.audio_transcript.delta':
    case 'response.text.delta':
      if (!assistantBubble) assistantBubble = addBubble('assistant', '');
      assistantBubble.textContent += event.delta ?? '';
      logEl.scrollTop = logEl.scrollHeight;
      break;

    // 어시스턴트 트랜스크립트(최종). 델타가 없던 모델도 여기서 표시한다.
    case 'response.audio_transcript.done':
    case 'response.text.done': {
      const text = (event.transcript ?? event.text ?? '').trim();
      if (assistantBubble) {
        if (text) assistantBubble.textContent = text;
      } else if (text) {
        addBubble('assistant', text);
      }
      assistantBubble = null;
      break;
    }

    // RAG 검색 도구 호출 표시.
    case 'response.function_call_arguments.done': {
      let query = '';
      try {
        query = JSON.parse(event.arguments)?.query ?? '';
      } catch {
        /* noop */
      }
      addBubble('system', `🔎 지식베이스 검색: ${query}`);
      break;
    }

    case 'session.created':
      addBubble('system', '세션이 연결되었습니다. 말해보세요!');
      break;

    case 'error':
      addBubble('system', `오류: ${event.error?.message ?? 'unknown'}`);
      break;

    default:
      break;
  }
}

const client = new VoiceLiveClient({
  onStatus: setStatus,
  onEvent: handleEvent,
  onRemoteTrack: (stream) => {
    remoteAudio.srcObject = stream;
    remoteAudio.play?.().catch(() => {
      addBubble('system', '🔈 오디오 자동재생이 차단되었습니다. 페이지를 한 번 클릭해 주세요.');
    });
  },
  onError: (message) => addBubble('system', `⚠️ ${message}`),
});

startBtn.addEventListener('click', () => {
  logEl.replaceChildren();
  assistantBubble = null;
  userBubble = null;
  client.start();
});

stopBtn.addEventListener('click', () => client.stop());
window.addEventListener('beforeunload', () => client.stop());

// 서버가 설정한 모델/보이스 표시.
fetch('/api/info')
  .then((r) => r.json())
  .then((info) => {
    metaEl.textContent = `Model: ${info.model} · Voice: ${info.voice}`;
  })
  .catch(() => {
    metaEl.textContent = '서버 정보를 불러오지 못했습니다.';
  });

setStatus('idle');
