// RAG 검색: 쿼리를 임베딩한 뒤 Azure AI Search 하이브리드(벡터+키워드) 검색을 수행한다.
// 별도 SDK 없이 Node 내장 fetch로 REST를 호출한다.

let cachedFields = null;

// 인덱스 스키마를 조회해 벡터/콘텐츠 필드명을 자동 감지한다(한 번만, 캐시).
async function resolveFields(rag) {
  if (cachedFields) return cachedFields;

  const base = rag.searchEndpoint.replace(/\/+$/, '');
  const url = `${base}/indexes/${rag.indexName}?api-version=${rag.searchApiVersion}`;
  const res = await fetch(url, { headers: { 'api-key': rag.searchKey } });
  if (!res.ok) {
    throw new Error(`인덱스 스키마 조회 실패 (HTTP ${res.status}): ${await res.text()}`);
  }

  const schema = await res.json();
  const fields = schema.fields || [];

  // 벡터 필드: dimensions(차원) 속성이 있는 필드.
  const vectorField =
    fields.find((f) => f.dimensions || f.vectorSearchDimensions)?.name || rag.vectorField;

  // 콘텐츠 필드: 설정값이 검색 가능한 문자열 필드면 우선, 없으면 첫 검색 가능 문자열 필드.
  const stringFields = fields.filter((f) => f.type === 'Edm.String' && f.searchable);
  const contentField =
    stringFields.find((f) => f.name === rag.contentField)?.name ||
    stringFields[0]?.name ||
    rag.contentField;

  cachedFields = { vectorField, contentField };
  console.log(`[rag] 인덱스 필드 감지: vector=${vectorField}, content=${contentField}`);
  return cachedFields;
}

// 쿼리 텍스트를 Azure OpenAI 임베딩 벡터로 변환한다.
async function embedQuery(text, rag) {
  const base = rag.embeddingEndpoint.replace(/\/+$/, '');
  const url = `${base}/openai/deployments/${rag.embeddingDeployment}/embeddings?api-version=${rag.embeddingApiVersion}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': rag.embeddingApiKey },
    body: JSON.stringify({ input: text }),
  });
  if (!res.ok) {
    throw new Error(`임베딩 실패 (HTTP ${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  return json.data[0].embedding;
}

// 지식베이스를 검색해 상위 문서 청크 텍스트 배열을 반환한다.
export async function searchKnowledge(query, rag) {
  const { vectorField, contentField } = await resolveFields(rag);
  const vector = await embedQuery(query, rag);
  const base = rag.searchEndpoint.replace(/\/+$/, '');
  const url = `${base}/indexes/${rag.indexName}/docs/search?api-version=${rag.searchApiVersion}`;

  const body = {
    search: query,
    top: rag.topK,
    select: contentField,
    vectorQueries: [{ kind: 'vector', vector, fields: vectorField, k: rag.topK }],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': rag.searchKey },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`AI Search 실패 (HTTP ${res.status}): ${await res.text()}`);
  }
  const json = await res.json();
  return (json.value || []).map((doc) => doc[contentField]).filter(Boolean);
}
