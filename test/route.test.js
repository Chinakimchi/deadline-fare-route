import test from 'node:test';
import assert from 'node:assert/strict';
import { rankRoutes } from '../src/route.js';
import { evaluateMonitor } from '../src/watch.js';

const now = new Date('2026-10-27T09:00:00.000Z');
const deadline = '2026-10-27T10:00:00.000Z';
const route = (minutes, fare, transfers = 0) => ({
  properties: { totalTime: minutes * 60, fare: { value: fare }, transfers },
  steps: [{ properties: { type: 'SUBWAY', time: minutes * 60, vehicles: [{ name: '2호선' }] } }]
});

test('시간 안에 가능한 경로만 남기고 요금순으로 정렬한다', () => {
  const data = { status: 'OK', routes: [route(35, 2000), route(42, 1500), route(57, 500)] };
  const result = rankRoutes(data, deadline, now, 5);
  assert.deepEqual(result.routes.map((x) => x.fareWon), [1500, 2000]);
  assert.equal(result.routes[0].latestDeparture, '2026-10-27T09:13:00.000Z');
});

test('요금이 없는 경로를 최저 비용으로 잘못 추천하지 않는다', () => {
  const data = { status: 'OK', routes: [{ properties: { totalTime: 1200 } }, route(30, 1400)] };
  assert.deepEqual(rankRoutes(data, deadline, now).routes.map((x) => x.fareWon), [1400]);
});

test('출발 시각이 가까워지면 한 번만 알린다', () => {
  const monitor = {
    id: 'trip-1', origin: { name: '출발역' }, destination: { name: '도착역' },
    deadline, bufferMinutes: 5
  };
  const data = { status: 'OK', routes: [route(42, 1500)] };
  const candidate = evaluateMonitor(monitor, data, { sent: {} }, now);
  assert.match(candidate.message, /1,500원/);
  assert.equal(evaluateMonitor(monitor, data, { sent: { [candidate.dedupKey]: { sentAt: now.toISOString() } } }, now), null);
});
