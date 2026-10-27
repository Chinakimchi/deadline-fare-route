const $ = (id) => document.getElementById(id);
const form = $('route-form');
const message = $('message');
const selected = { origin: null, destination: null };
let latestSearch = null;

const number = new Intl.NumberFormat('ko-KR');
const clock = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
});

function setMessage(text, error = false) {
  message.textContent = text;
  message.classList.toggle('error', error);
}

function initialDeadline() {
  const date = new Date(Date.now() + 2 * 60 * 60_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  $('deadline').value = local.toISOString().slice(0, 16);
}

function setupPlace(field) {
  const input = $(field);
  const menu = $(`${field}-suggestions`);
  let timer;
  let generation = 0;
  input.addEventListener('input', () => {
    selected[field] = null;
    menu.replaceChildren();
    clearTimeout(timer);
    const query = input.value.trim();
    const current = ++generation;
    if (query.length < 2) return;
    timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (current !== generation) return;
        menu.replaceChildren();
        for (const place of data.places) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'suggestion';
          const title = document.createElement('strong');
          title.textContent = place.name;
          const address = document.createElement('small');
          address.textContent = place.address;
          button.append(title, address);
          button.addEventListener('click', () => {
            selected[field] = place;
            input.value = place.name;
            menu.replaceChildren();
            setMessage('');
          });
          menu.append(button);
        }
        if (!data.places.length) setMessage('일치하는 장소가 없습니다.', true);
      } catch (error) {
        if (current === generation) setMessage(error.message, true);
      }
    }, 300);
  });
  input.addEventListener('blur', () => setTimeout(() => menu.replaceChildren(), 180));
}

function renderResults(data) {
  const list = $('route-list');
  list.replaceChildren();
  $('results').hidden = false;
  $('map-link').hidden = !data.landingURL;
  if (data.landingURL) $('map-link').href = data.landingURL;
  $('download-monitor').hidden = !data.routes.length;
  $('monitor-help').hidden = !data.routes.length;

  if (!data.routes.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '현재 시각에 출발해 제한 시간 안에 도착 가능한 대중교통 경로가 없습니다. 제한 시각이나 출발지를 바꿔 보세요.';
    list.append(empty);
    return;
  }
  for (const [index, route] of data.routes.entries()) {
    const card = document.createElement('article');
    card.className = 'route-card';
    const top = document.createElement('div');
    top.className = 'route-top';
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = index === 0 ? '최저 비용' : `대안 ${index}`;
    const fare = document.createElement('strong');
    fare.className = 'fare';
    fare.textContent = `${number.format(route.fareWon)}원`;
    top.append(rank, fare);
    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = `총 ${route.durationMinutes}분 · 환승 ${route.transfers}회 · 늦어도 ${clock.format(new Date(route.latestDeparture))} 출발`;
    const steps = document.createElement('ol');
    steps.className = 'steps';
    for (const segment of route.segments) {
      const li = document.createElement('li');
      const mode = { WALKING: '도보', BUS: '버스', SUBWAY: '지하철' }[segment.mode] ?? '이동';
      li.textContent = `${mode}${segment.vehicle ? ` ${segment.vehicle}` : ''} · ${segment.minutes}분${segment.from && segment.to ? ` (${segment.from} → ${segment.to})` : ''}`;
      steps.append(li);
    }
    card.append(top, meta, steps);
    list.append(card);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selected.origin || !selected.destination) return setMessage('출발지와 목적지를 검색 결과에서 선택해 주세요.', true);
  const deadline = new Date($('deadline').value);
  if (!Number.isFinite(deadline.getTime()) || deadline <= new Date()) return setMessage('미래의 도착 시각을 입력해 주세요.', true);
  const button = $('submit');
  button.disabled = true;
  setMessage('경로를 조회하고 있습니다…');
  try {
    const request = {
      origin: selected.origin,
      destination: selected.destination,
      deadline: deadline.toISOString(),
      bufferMinutes: Number($('buffer').value)
    };
    const response = await fetch('/api/routes', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    latestSearch = request;
    renderResults(data);
    setMessage(`${data.totalCandidates}개 후보를 확인했습니다.`);
  } catch (error) {
    $('results').hidden = true;
    latestSearch = null;
    setMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
});

$('download-monitor').addEventListener('click', () => {
  if (!latestSearch) return;
  const monitor = {
    id: `trip-${Date.now()}`,
    origin: latestSearch.origin,
    destination: latestSearch.destination,
    deadline: latestSearch.deadline,
    bufferMinutes: latestSearch.bufferMinutes
  };
  const blob = new Blob([JSON.stringify(monitor, null, 2) + '\n'], { type: 'application/json' });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `${monitor.id}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
});

setupPlace('origin');
setupPlace('destination');
initialDeadline();
