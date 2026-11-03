import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { server } from '../server.js';

test('공식 API 응답을 받아 웹 경로 응답으로 연결한다', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.KAKAO_REST_API_KEY;
  process.env.KAKAO_REST_API_KEY = 'test-only-key';
  const upstream = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://dapi.kakao.com/')) {
      upstream.push({ url: String(url), auth: options.headers.Authorization });
      if (String(url).includes('/keyword.json')) {
        return new Response(JSON.stringify({ documents: [{ place_name: '서울역', address_name: '서울', x: '126.9707', y: '37.5547' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        status: 'OK', routes: [
          { properties: { totalTime: 2400, fare: { min: 1500, max: 1650 }, transfers: 1 }, steps: [{ properties: { type: 'BUS', time: 1200, vehicles: [{ name: '100' }] } }] },
          { properties: { totalTime: 1800, fare: { value: 2500 }, transfers: 0 }, steps: [] }
        ]
      }), { status: 200 });
    }
    return originalFetch(url, options);
  };
  try {
    server.listen(0);
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const places = await originalFetch(`${base}/api/places?q=${encodeURIComponent('서울역')}`).then((res) => res.json());
    assert.equal(places.places[0].name, '서울역');
    const response = await originalFetch(`${base}/api/routes`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        origin: { x: 126.9707, y: 37.5547, name: '서울역' },
        destination: { x: 127.0276, y: 37.4979, name: '강남역' },
        deadline: new Date(Date.now() + 3_600_000).toISOString(),
        bufferMinutes: 5
      })
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.routes.map((route) => route.fareWon), [1500, 2500]);
    assert.equal(result.routes[0].fareMaxWon, 1650);
    assert.equal(upstream.length, 2);
    assert.ok(upstream.every((call) => call.auth === 'KakaoAK test-only-key'));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.KAKAO_REST_API_KEY;
    else process.env.KAKAO_REST_API_KEY = originalKey;
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
});
