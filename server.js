import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { searchPlaces, fetchTransitRoutes } from './src/kakao.js';
import { rankRoutes } from './src/route.js';

const root = dirname(fileURLToPath(import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']]
]);

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function parsePoint(point) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 124 || x > 132 || y < 33 || y > 39) {
    throw new Error('출발지와 목적지를 검색 결과에서 선택해 주세요.');
  }
  return { x, y, name: String(point.name ?? '').slice(0, 80) };
}

async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw new Error('요청이 너무 큽니다.');
  }
  try { return JSON.parse(body); }
  catch { throw new Error('요청 형식이 올바르지 않습니다.'); }
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      return send(response, 200, { status: 'ok', apiReady: Boolean(process.env.KAKAO_REST_API_KEY) });
    }
    if (request.method === 'GET' && url.pathname === '/api/places') {
      const query = (url.searchParams.get('q') ?? '').trim();
      if (query.length < 2 || query.length > 80) return send(response, 400, { error: '장소 이름을 2~80자로 입력해 주세요.' });
      return send(response, 200, { places: await searchPlaces(query) });
    }
    if (request.method === 'POST' && url.pathname === '/api/routes') {
      const body = await readJson(request);
      const origin = parsePoint(body.origin);
      const destination = parsePoint(body.destination);
      const data = await fetchTransitRoutes(origin, destination);
      return send(response, 200, rankRoutes(data, body.deadline, new Date(), body.bufferMinutes ?? 5));
    }
    if (request.method === 'GET' && assets.has(url.pathname)) {
      const [name, type] = assets.get(url.pathname);
      return send(response, 200, await readFile(join(root, 'public', name), 'utf8'), type);
    }
    return send(response, 404, { error: '페이지를 찾을 수 없습니다.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    const badInput = /설정|선택|입력|형식|시각|여유시간|너무 큽니다/.test(message);
    return send(response, badInput ? 400 : 502, { error: message });
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => console.log(`http://localhost:${port}`));
}

export { server };
