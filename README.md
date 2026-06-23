# Azure Voice Live · WebRTC Lab

브라우저에서 **WebRTC**로 Azure Voice Live API와 실시간 음성 대화하는 샘플 웹 어플리케이션입니다.

## 실행

```bash
npm install
cp .env.example .env   # AZURE_VOICELIVE_ENDPOINT, AZURE_VOICELIVE_API_KEY 입력
npm start              # http://localhost:3000
```

브라우저에서 **Start talking** → 마이크 허용 → 말하기.

## 설정 (.env)

`.env.example`을 `.env`로 복사한 뒤 값을 채웁니다. `.env`는 커밋하지 마세요.

### 기본 (필수)

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `AZURE_VOICELIVE_ENDPOINT` | (필수) | Foundry/Azure AI 리소스 엔드포인트. 리소스 이름, `https://…`, `wss://…` 모두 허용(호스트로 정규화) |
| `AZURE_VOICELIVE_API_KEY` | — | API 키. 서버에만 보관. **비우면** Entra ID(`az login`/관리 ID, `DefaultAzureCredential`)로 자동 전환 |
| `AZURE_VOICELIVE_API_VERSION` | `2026-06-01-preview` | WebRTC는 프리뷰 API 버전 필요 |
| `AZURE_VOICELIVE_MODEL` | `gpt-realtime-1.5` | 에이전트 생성 모델 |
| `AZURE_VOICELIVE_VOICE` | `alloy` | 출력 보이스. 네이티브 모델=OpenAI 보이스(`alloy`,`marin`,`echo`…), 그 외=Azure 보이스(`en-US-AvaNeural`…) |
| `PORT` | `8888` | 로컬 웹 서버 포트 |

### RAG (선택)

아래 값이 **모두** 채워지면 Voice Live가 검색 도구로 인덱싱된 지식베이스를 조회합니다(VoiceRAG). 비우면 일반 음성 대화만 동작합니다.

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `AZURE_AI_SEARCH_ENDPOINT` | — | Azure AI Search 엔드포인트(`https://<서비스>.search.windows.net`) |
| `AZURE_AI_SEARCH_ADMIN_KEY` | — | AI Search 키 (`AZURE_AI_SEARCH_API_KEY`도 허용) |
| `AZURE_AI_SEARCH_INDEX` | — | 검색할 인덱스명 |
| `AZURE_AI_SEARCH_CONTENT_FIELD` | — | 콘텐츠 필드명(미지정 시 인덱스 스키마에서 자동 감지) |
| `AZURE_AI_SEARCH_VECTOR_FIELD` | — | 벡터 필드명(미지정 시 자동 감지) |
| `AZURE_AI_SEARCH_TOP_K` | `3` | 검색 결과 개수 |
| `AZURE_OPENAI_EMBEDDING_ENDPOINT` | — | 임베딩용 Azure OpenAI 엔드포인트 |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | — | 임베딩 배포명. **인덱싱에 쓴 모델과 동일해야** 함 |
| `AZURE_OPENAI_EMBEDDING_API_KEY` | — | 임베딩 키 (`AZURE_MS_FOUNDRY_API_KEY`도 허용) |
