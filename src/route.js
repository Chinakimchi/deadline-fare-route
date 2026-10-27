const MODES = new Set(['WALKING', 'BUS', 'SUBWAY']);

export function normalizeRoute(route, index) {
  const properties = route?.properties ?? {};
  const durationSeconds = Number(properties.totalTime);
  const fareWon = Number(properties.fare?.value);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 ||
      !Number.isFinite(fareWon) || fareWon < 0) return null;

  const segments = (route.steps ?? []).map((step) => {
    const item = step?.properties ?? {};
    const mode = MODES.has(item.type) ? item.type : 'OTHER';
    return {
      mode,
      minutes: Math.ceil(Math.max(0, Number(item.time) || 0) / 60),
      guidance: String(item.guidance ?? '').slice(0, 240),
      vehicle: String(item.vehicles?.[0]?.name ?? '').slice(0, 80),
      from: String(item.stops?.[0]?.name ?? '').slice(0, 80),
      to: String(item.stops?.at(-1)?.name ?? '').slice(0, 80)
    };
  });
  return {
    id: `route-${index + 1}`,
    durationSeconds,
    durationMinutes: Math.ceil(durationSeconds / 60),
    fareWon,
    transfers: Number.isFinite(Number(properties.transfers)) ? Number(properties.transfers) : 0,
    segments
  };
}

export function rankRoutes(payload, deadline, now = new Date(), bufferMinutes = 5) {
  const deadlineMs = new Date(deadline).getTime();
  const nowMs = new Date(now).getTime();
  const buffer = Number(bufferMinutes);
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(nowMs) || deadlineMs <= nowMs) {
    throw new Error('도착 제한 시각은 현재보다 미래여야 합니다.');
  }
  if (!Number.isFinite(buffer) || buffer < 0 || buffer > 60) {
    throw new Error('여유시간은 0~60분으로 설정해 주세요.');
  }
  if (payload?.status !== 'OK' && payload?.status !== 'NO_RESULTS') {
    throw new Error(`경로 조회 실패: ${payload?.status ?? '응답 형식 오류'}`);
  }
  const routes = (payload.routes ?? []).map(normalizeRoute).filter(Boolean)
    .map((route) => ({
      ...route,
      latestDeparture: new Date(deadlineMs - route.durationSeconds * 1000 - buffer * 60_000).toISOString()
    }))
    .filter((route) => new Date(route.latestDeparture).getTime() >= nowMs)
    .sort((a, b) => a.fareWon - b.fareWon || a.durationSeconds - b.durationSeconds || a.transfers - b.transfers);
  return {
    deadline: new Date(deadlineMs).toISOString(),
    checkedAt: new Date(nowMs).toISOString(),
    bufferMinutes: buffer,
    totalCandidates: Array.isArray(payload.routes) ? payload.routes.length : 0,
    routes: routes.slice(0, 5),
    landingURL: /^https:\/\/map\.kakao\.com\//.test(payload.properties?.landingURL ?? '')
      ? payload.properties.landingURL : null
  };
}
