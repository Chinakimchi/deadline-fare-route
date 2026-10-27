import { writeFile } from 'node:fs/promises';

const token = process.env.TELEGRAM_BOT_TOKEN;
const output = process.env.TELEGRAM_CHAT_ID_OUTPUT;
if (!token || !output) throw new Error('텔레그램 점검 환경 변수가 없습니다.');

const updatesResponse = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
  signal: AbortSignal.timeout(10_000)
});
const updates = await updatesResponse.json();
if (!updatesResponse.ok || !updates.ok) throw new Error('텔레그램 업데이트 조회에 실패했습니다.');

const chat = [...updates.result].reverse()
  .map((update) => update.message?.chat ?? update.edited_message?.chat)
  .find((item) => item?.id);
if (!chat) throw new Error('봇에 도착한 메시지가 없습니다. 텔레그램에서 /start를 보내 주세요.');

const chatId = String(chat.id);
console.log(`::add-mask::${chatId}`);
await writeFile(output, `${chatId}\n`, { mode: 0o600 });

const sendResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    chat_id: chatId,
    text: '✅ Deadline Fare Route 텔레그램 알림 연결 테스트에 성공했습니다.'
  }),
  signal: AbortSignal.timeout(10_000)
});
const sent = await sendResponse.json();
if (!sendResponse.ok || !sent.ok) throw new Error('텔레그램 테스트 메시지 발송에 실패했습니다.');

console.log('텔레그램 대화 확인 및 테스트 메시지 발송 완료');
