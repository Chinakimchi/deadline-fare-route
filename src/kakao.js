const BASE = 'https://dapi.kakao.com';
const cache = new Map();

function key() {
  const value = process.env.KAKAO_REST_API_KEY;
  if (!value) throw new Error('KAKAO_REST_API_KEY가 설정되지 않았습니다.');
  return value;
}

async function get(path, parameters, ttlMs = 0) {
  const url = new URL(path, BASE);
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, String(value));
  const cacheKey = url.toString();
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;
  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key()}` },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) {
    throw new Error(`카카오 API 요청 실패 (${response.status}). 앱 권한과 쿼터를 확인해 주세요.`);
  }
  const data = await response.json();
  if (ttlMs) cache.set(cacheKey, { data, expires: Date.now() + ttlMs });
  return data;
}

export async function searchPlaces(query) {
  const data = await get('/v2/local/search/keyword.json', { query, size: 8 }, 60_000);
  return (data.documents ?? []).map((place) => ({
    name: place.place_name,
    address: place.road_address_name || place.address_name,
    x: Number(place.x),
    y: Number(place.y)
  }));
}

export async function fetchTransitRoutes(origin, destination) {
  return get('/v2/routing/publictraffic', {
    start_x: origin.x,
    start_y: origin.y,
    end_x: destination.x,
    end_y: destination.y
  }, 60_000);
}
