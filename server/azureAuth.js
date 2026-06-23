import { DefaultAzureCredential } from '@azure/identity';

const ENTRA_SCOPE = 'https://ai.azure.com/.default';
const CONTROL_PATH = '/voice-live/realtime/calls';

let cachedCredential;

// WebRTC 제어 채널의 wss URL을 만든다.
export function buildControlChannelUrl(config) {
  const params = new URLSearchParams({
    'api-version': config.apiVersion,
    model: config.model,
  });
  return `wss://${config.host}${CONTROL_PATH}?${params.toString()}`;
}

// 인증 헤더를 만든다. API 키가 있으면 api-key 헤더, 없으면 Entra ID Bearer 토큰.
export async function buildAuthHeaders(config) {
  if (config.apiKey) {
    return { 'api-key': config.apiKey };
  }

  cachedCredential ??= new DefaultAzureCredential();
  const token = await cachedCredential.getToken(ENTRA_SCOPE);
  if (!token?.token) {
    throw new Error(
      'Entra ID 토큰을 가져오지 못했습니다. `az login`을 실행하거나 관리 ID를 설정하세요. ' +
        '또는 .env에 AZURE_VOICELIVE_API_KEY를 설정하세요.',
    );
  }
  return { Authorization: `Bearer ${token.token}` };
}
