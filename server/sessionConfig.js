// Azure TTS 보이스 이름 형태(예: en-US-AvaNeural).
const AZURE_VOICE_PATTERN = /^[a-z]{2,3}-[A-Za-z]+-/;

// 보이스를 session.update 형식으로 변환한다. Azure 보이스는 객체, OpenAI 보이스는 문자열.
function formatVoice(name) {
  if (AZURE_VOICE_PATTERN.test(name) || name.includes(':')) {
    return { name, type: 'azure-standard' };
  }
  return name;
}

function isAzureVoice(voice) {
  return (
    typeof voice === 'object' &&
    voice !== null &&
    typeof voice.type === 'string' &&
    voice.type.startsWith('azure')
  );
}

// WebRTC에서는 세션 생성 후 보이스 "타입"을 못 바꾼다.
// 타입이 다르면 에러 대신 보이스를 생략하고 기존 보이스를 유지한다.
function resolveVoice(configuredName, existingVoice) {
  const formatted = formatVoice(configuredName);

  let result;
  if (typeof formatted === 'object') {
    // Azure 보이스는 객체 그대로.
    result = formatted;
  } else if (existingVoice && typeof existingVoice === 'object' && existingVoice.type) {
    // OpenAI/네이티브 보이스: 세션 기존 보이스의 구조(type)를 유지하고 이름만 교체한다.
    // (맨 문자열로 보내면 Voice Live가 무시하고 기본 보이스를 유지하는 경우가 있다.)
    result = { ...existingVoice, name: configuredName };
  } else {
    result = formatted;
  }

  console.log(
    `[session] 보이스: 기존=${JSON.stringify(existingVoice)} → 적용=${JSON.stringify(result)}`,
  );
  return result;
}

// 모델에 맞는 입력 음성 트랜스크립션 모델을 고른다(사용자 발화 표시용).
function resolveTranscription(config) {
  if (config.model.startsWith('gpt-realtime')) return { model: 'whisper-1' };
  return { model: 'azure-speech' };
}

// RAG 검색 함수(tool) 정의.
function ragTool(rag) {
  return {
    type: 'function',
    name: rag.toolName,
    description: rag.toolDescription,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '검색할 질문 또는 키워드' },
      },
      required: ['query'],
    },
  };
}

// 세션을 구성하는 session.update 이벤트를 만든다. 생성 후 바꿔도 안전한 항목만 보낸다.
export function buildSessionUpdate(config, sessionInfo) {
  const voice = resolveVoice(config.voice, sessionInfo?.voice);

  const session = {
    instructions: config.instructions,
    modalities: ['text', 'audio'],
    ...(voice ? { voice } : {}),
    turn_detection: {
      type: 'server_vad',
      threshold: config.vad.threshold,
      prefix_padding_ms: config.vad.prefixMs,
      silence_duration_ms: config.vad.silenceMs,
    },
    // input_audio_noise_reduction: { type: 'azure_deep_noise_suppression' },
    // server_echo_cancellation은 "스피커 재생→마이크 픽업" 시나리오용이다.
    // 헤드셋/브라우저 AEC 환경에서는 켜면 barge-in 시 발화 종료(침묵) 감지를 방해하므로 끈다.
    input_audio_transcription: resolveTranscription(config),
  };

  // RAG가 설정되어 있으면 검색 도구를 등록하고, 도구 사용을 지시한다.
  if (config.rag?.enabled) {
    session.tools = [ragTool(config.rag)];
    session.tool_choice = 'auto';
    session.instructions =
      `${config.instructions}\n\n` +
      `사용자의 질문에 답할 사실 근거가 필요하면 ${config.rag.toolName} 도구로 지식베이스를 검색하세요. ` +
      `도구를 호출하기 직전에 반드시 "잠시만요, 자료를 찾아볼게요"처럼 짧은 안내를 음성으로 먼저 말한 다음 검색하고, ` +
      `검색이 끝나면 결과에 근거해 답하세요. 근거가 없으면 모른다고 답하세요.`;
  }

  return { type: 'session.update', session };
}
