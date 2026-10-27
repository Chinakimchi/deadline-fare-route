import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fetchTransitRoutes } from './kakao.js';
import { rankRoutes } from './route.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const monitorsFile = join(root, 'config', 'monitors.json');
const stateFile = join(root, 'state.json');

export function evaluateMonitor(monitor, data, state, now = new Date(), leadMinutes = 20) {
  const id = String(monitor?.id ?? '');
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('알림 ID는 영문·숫자·밑줄·하이픈만 사용해 주세요.');
  const deadline = new Date(monitor.deadline);
  if (!Number.isFinite(deadline.getTime())) throw new Error(`${id}: 도착 시각이 올바르지 않습니다.`);
  const dedupKey = `${id}:${deadline.toISOString()}`;
  if (state.sent?.[dedupKey]) return null;
  if (deadline <= now) return null;
  const result = rankRoutes(data, deadline, now, monitor.bufferMinutes ?? 5);
  const route = result.routes[0];
  if (!route) return null;
  const minutesUntilDeparture = (new Date(route.latestDeparture).getTime() - now.getTime()) / 60_000;
  if (minutesUntilDeparture > leadMinutes) return null;
  const origin = String(monitor.origin?.name || '출발지').slice(0, 80);
  const destination = String(monitor.destination?.name || '목적지').slice(0, 80);
  const display = (value) => new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(new Date(value));
  const steps = route.segments.map((segment) => {
    const mode = { WALKING: '도보', BUS: '버스', SUBWAY: '지하철' }[segment.mode] ?? '이동';
    return `${mode}${segment.vehicle ? ` ${segment.vehicle}` : ''} ${segment.minutes}분`;
  }).join(' → ');
  const message = [
    `⏰ ${display(deadline)}까지 ${destination}에 도착하려면`,
    `${display(route.latestDeparture)}까지 ${origin}에서 출발하세요.`,
    `예상 교통비 ${route.fareWon.toLocaleString('ko-KR')}원 · ${route.durationMinutes}분 · 환승 ${route.transfers}회`,
    steps,
    '경로 데이터: 카카오맵 · 소요시간은 예상치입니다.'
  ].filter(Boolean).join('\n');
  return { dedupKey, route, message };
}

async function sendTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error('텔레그램 Secrets가 설정되지 않았습니다.');
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
    signal: AbortSignal.timeout(10_000)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error('텔레그램 발송에 실패했습니다. 봇 토큰과 채팅 ID를 확인해 주세요.');
}

async function main() {
  const monitors = JSON.parse(await readFile(monitorsFile, 'utf8'));
  const state = JSON.parse(await readFile(stateFile, 'utf8'));
  if (!Array.isArray(monitors) || monitors.length > 5) throw new Error('알림은 최대 5개까지 등록할 수 있습니다.');
  if (!state.sent || typeof state.sent !== 'object') state.sent = {};
  const now = new Date();
  let sent = 0;
  const errors = [];
  for (const monitor of monitors) {
    try {
      const deadline = new Date(monitor.deadline);
      if (!Number.isFinite(deadline.getTime()) || deadline <= now || state.sent[`${monitor.id}:${deadline.toISOString()}`]) continue;
      const data = await fetchTransitRoutes(monitor.origin, monitor.destination);
      const candidate = evaluateMonitor(monitor, data, state, now);
      if (!candidate) continue;
      await sendTelegram(candidate.message);
      state.sent[candidate.dedupKey] = { sentAt: now.toISOString(), fareWon: candidate.route.fareWon };
      sent++;
    } catch (error) {
      errors.push(`${monitor?.id ?? '알림'}: ${error.message}`);
    }
  }
  if (sent) {
    const temporary = `${stateFile}.tmp`;
    await writeFile(temporary, JSON.stringify(state, null, 2) + '\n');
    await rename(temporary, stateFile);
  }
  console.log(`알림 ${sent}건 발송, 등록 ${monitors.length}건 확인`);
  if (errors.length) throw new Error(errors.join('; '));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
