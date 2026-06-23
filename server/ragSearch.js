// RAG 검색: 쿼리를 임베딩한 뒤 Azure AI Search 하이브리드(벡터+키워드) 검색을 수행한다.
// 별도 SDK 없이 Node 내장 fetch로 REST를 호출한다.

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
  const vector = await embedQuery(query, rag);
  const base = rag.searchEndpoint.replace(/\/+$/, '');
  const url = `${base}/indexes/${rag.indexName}/docs/search?api-version=${rag.searchApiVersion}`;

  const body = {
    search: query,
    top: rag.topK,
    select: rag.contentField,
    vectorQueries: [{ kind: 'vector', vector, fields: rag.vectorField, k: rag.topK }],
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
  return (json.value || []).map((doc) => doc[rag.contentField]).filter(Boolean);
}
