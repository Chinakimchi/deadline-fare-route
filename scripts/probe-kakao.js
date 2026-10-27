const apiKey = process.env.KAKAO_REST_API_KEY;
if (!apiKey) {
  console.error('KAKAO_REST_API_KEY Secret이 없습니다. 카카오디벨로퍼스 앱의 REST API 키를 등록해 주세요.');
  process.exit(2);
}

const origin = { x: 127.11119217, y: 37.39477123 };
const destination = { x: 127.12628814, y: 37.41993056 };

async function request(path, parameters) {
  const url = new URL(path, 'https://dapi.kakao.com');
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, String(value));
  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${apiKey}` },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status} (앱 활성화·키 설정·쿼터 확인)`);
  return response.json();
}

function coordinates(start, end) {
  return { start_x: start.x, start_y: start.y, end_x: end.x, end_y: end.y };
}

try {
  const place = await request('/v2/local/search/keyword.json', { query: '판교역', size: 1 });
  const firstPlace = place.documents?.[0];
  console.log('장소 검색:', firstPlace
    ? JSON.stringify({ name: firstPlace.place_name, x: firstPlace.x, y: firstPlace.y })
    : '검색 결과 없음');

  const transit = await request('/v2/routing/publictraffic', coordinates(origin, destination));
  const firstTransit = transit.routes?.[0];
  console.log('대중교통:', JSON.stringify({
    status: transit.status,
    routeCount: transit.routes?.length ?? 0,
    firstRoute: firstTransit ? {
      seconds: firstTransit.properties?.totalTime,
      fareWon: firstTransit.properties?.fare?.value,
      transfers: firstTransit.properties?.transfers,
      modes: firstTransit.steps?.map((step) => step.properties?.type)
    } : null
  }));

  const walk = await request('/v2/routing/walk', coordinates(origin, destination));
  console.log('도보:', JSON.stringify({ status: walk.status, seconds: walk.route?.properties?.totalTime ?? null }));

  if (transit.status !== 'OK' || !firstTransit?.properties?.totalTime ||
      !Number.isFinite(Number(firstTransit.properties?.fare?.value))) {
    throw new Error('대중교통 응답에 필요한 시간·요금 값이 없습니다. 다른 좌표나 API 권한을 확인해 주세요.');
  }
  console.log('필수 대중교통 필드 확인 완료. 키와 전체 원본 응답은 출력하지 않았습니다.');
} catch (error) {
  console.error(`API 확인 실패: ${error.message}`);
  process.exitCode = 1;
}
