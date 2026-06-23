import 'dotenv/config';

const DEFAULT_API_VERSION = '2026-06-01-preview';
const DEFAULT_MODEL = 'gpt-realtime-1.5';
const DEFAULT_VOICE = 'marin';
const DEFAULT_INSTRUCTIONS =
  '당신은 친절하고 도움이 되는 AI 음성 비서입니다. 자연스럽고 간결하게 답하세요.';
const DEFAULT_PORT = 3000;

// 엔드포인트(이름/https/wss)를 호스트 문자열로 정규화한다.
function normalizeHost(rawEndpoint) {
  const trimmed = rawEndpoint.trim().replace(/\/+$/, '');
  if (!trimmed.includes('://') && !trimmed.includes('.')) {
    return `${trimmed}.services.ai.azure.com`;
  }
  const withoutScheme = trimmed.replace(/^[a-z]+:\/\//i, '');
  return withoutScheme.split('/')[0];
}

// RAG(AI Search + 임베딩) 설정. 필요한 값이 모두 있을 때만 enabled.
function buildRagConfig() {
  const searchEndpoint = process.env.AZURE_AI_SEARCH_ENDPOINT?.trim();
  const searchKey =
    process.env.AZURE_AI_SEARCH_ADMIN_KEY?.trim() ||
    process.env.AZURE_AI_SEARCH_API_KEY?.trim();
  const embeddingEndpoint = process.env.AZURE_OPENAI_EMBEDDING_ENDPOINT?.trim();
  const embeddingDeployment = process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT?.trim();
  const embeddingApiKey =
    process.env.AZURE_OPENAI_EMBEDDING_API_KEY?.trim() ||
    process.env.AZURE_MS_FOUNDRY_API_KEY?.trim();

  const enabled = Boolean(
    searchEndpoint && searchKey && embeddingEndpoint && embeddingDeployment && embeddingApiKey,
  );

  return {
    enabled,
    searchEndpoint,
    searchKey,
    indexName: process.env.AZURE_AI_SEARCH_INDEX?.trim() || 'housing',
    searchApiVersion: '2024-07-01',
    contentField: process.env.AZURE_AI_SEARCH_CONTENT_FIELD?.trim() || 'content',
    vectorField: process.env.AZURE_AI_SEARCH_VECTOR_FIELD?.trim() || 'content_vector',
    topK: Number.parseInt(process.env.AZURE_AI_SEARCH_TOP_K ?? '', 10) || 3,
    embeddingEndpoint,
    embeddingDeployment,
    embeddingApiKey,
    embeddingApiVersion: '2023-05-15',
    toolName: 'search_knowledge_base',
    toolDescription:
      '인덱싱된 지식베이스(Azure AI Search)에서 관련 정보를 검색합니다. 사용자의 질문에 사실로 답할 근거가 필요할 때 사용하세요.',
  };
}

// 환경변수를 읽어 검증된 설정을 반환한다. 필수값이 없으면 즉시 실패한다.
export function loadConfig() {
  const rawEndpoint = process.env.AZURE_VOICELIVE_ENDPOINT;
  if (!rawEndpoint) {
    throw new Error(
      'AZURE_VOICELIVE_ENDPOINT가 없습니다. .env.example을 .env로 복사한 뒤 엔드포인트를 설정하세요.',
    );
  }

  const apiKey = process.env.AZURE_VOICELIVE_API_KEY?.trim() || undefined;
  const isPlaceholderKey = apiKey?.startsWith('<') ?? false;
  const usableApiKey = isPlaceholderKey ? undefined : apiKey;

  return {
    host: normalizeHost(rawEndpoint),
    apiKey: usableApiKey,
    apiVersion: process.env.AZURE_VOICELIVE_API_VERSION?.trim() || DEFAULT_API_VERSION,
    model: process.env.AZURE_VOICELIVE_MODEL?.trim() || DEFAULT_MODEL,
    voice: process.env.AZURE_VOICELIVE_VOICE?.trim() || DEFAULT_VOICE,
    instructions: DEFAULT_INSTRUCTIONS,
    port: Number.parseInt(process.env.PORT ?? '', 10) || DEFAULT_PORT,
    useEntraId: !usableApiKey,
    rag: buildRagConfig(),
    vad: {
      // 0~1. 낮을수록 작은 소리도 발화로 인식(끝부분 트레일링까지 잡음).
      threshold: Number.parseFloat(process.env.AZURE_VOICELIVE_VAD_THRESHOLD ?? '') || 0.5,
      // 이만큼 침묵이 이어지면 발화 종료로 간주(ms). 끝부분이 잘리면 키우세요.
      silenceMs: Number.parseInt(process.env.AZURE_VOICELIVE_VAD_SILENCE_MS ?? '', 10) || 600,
      // 발화 시작 신호 앞에 포함할 오디오 길이(ms).
      prefixMs: Number.parseInt(process.env.AZURE_VOICELIVE_VAD_PREFIX_MS ?? '', 10) || 300,
    },
  };
}
