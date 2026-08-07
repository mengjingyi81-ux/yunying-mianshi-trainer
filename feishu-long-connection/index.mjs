import * as Lark from '@larksuiteoapi/node-sdk';
import fs from 'node:fs';
import path from 'node:path';

const APP_ID = process.env.FEISHU_APP_ID;
const APP_SECRET = process.env.FEISHU_APP_SECRET;
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';
const CHAT_ID_ENV = process.env.FEISHU_CHAT_ID || '';
const STATE_FILE = path.join(process.cwd(), 'state.json');
const BANK_URL = 'https://mengjingyi81-ux.github.io/yunying-mianshi-trainer/questions.json';

if (!APP_ID || !APP_SECRET) throw new Error('Missing FEISHU_APP_ID or FEISHU_APP_SECRET');

const client = new Lark.Client({ appId: APP_ID, appSecret: APP_SECRET });
const wsClient = new Lark.WSClient({ appId: APP_ID, appSecret: APP_SECRET, loggerLevel: Lark.LoggerLevel.info });

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { chatId: CHAT_ID_ENV, current: null, history: [], lastDaily: '', lastWeekly: '' }; }
}
function writeState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), 'utf8'); }
let state = readState();

async function sendText(chatId, text) {
  if (!chatId) throw new Error('Missing chat_id; reply to the bot once so it can learn chat_id');
  await client.im.v1.message.create({
    params: { receive_id_type: 'chat_id' },
    data: { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text }) }
  });
}
async function bank() {
  const res = await fetch(BANK_URL);
  if (!res.ok) throw new Error('Question bank unavailable: ' + res.status);
  return res.json();
}
function localEval(q, answer) {
  const signals = ['目标','指标','用户','分层','原因','策略','数据','验证','实验','复盘','ROI'];
  const hits = signals.filter(x => answer.includes(x)).length;
  const score = Math.min(92, Math.max(40, 40 + hits * 4 + Math.round(Math.min(answer.length, 300) / 15)));
  const gap = !answer.includes('目标') ? '没有明确业务目标' : !answer.includes('指标') ? '缺少指标体系' : !answer.includes('分层') ? '缺少用户或场景分层' : !answer.includes('数据') ? '缺少数据验证' : '案例细节不足，需要补充真实背景和结果';
  return { score, dimensions: { business: Math.round(score*.2), strategy: Math.round(score*.25), experience: Math.round(score*.2), data: Math.round(score*.2), expression: Math.round(score*.15) }, strengths: ['能够尝试描述解决方案'], gaps: [gap], mainGap: gap, advice: '建议按照业务目标→用户分析→策略设计→执行方案→数据验证→复盘优化重新组织答案。', interviewAnswer: '我会先明确业务目标和核心问题，再分析用户与业务原因，选择合适的运营杠杆，通过指标体系和实验验证效果，最后形成复盘闭环。', followUpQuestions: ['如果预算减少50%，策略如何调整？','如何证明增长来自运营动作？','项目中最关键的指标是什么？'] };
}
async function evaluate(q, answer) {
  const fallback = localEval(q, answer);
  if (!OPENAI_KEY) return fallback;
  const prompt = '你是高级互联网运营面试官。按问题理解20、分析框架25、运营经验20、数据意识20、表达结构15评分。只返回JSON：score、dimensions(business,strategy,experience,data,expression)、strengths、gaps、mainGap、advice、interviewAnswer、followUpQuestions。题目：' + q.q + '；参考框架：' + q.formula + '；用户回答：' + answer;
  try {
    const res = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + OPENAI_KEY }, body: JSON.stringify({ model: OPENAI_MODEL, input: prompt }) });
    const data = await res.json();
    const parsed = JSON.parse((data.output_text || '').trim());
    return { ...fallback, ...parsed };
  } catch (err) {
    console.error('AI fallback:', err.message);
    return fallback;
  }
}
function todayCN() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()); }
function nowCN() { return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date()); }
async function startDaily(chatId) {
  const qs = (await bank()).sort(() => Math.random() - .5).slice(0, 3);
  state.chatId = chatId || state.chatId;
  state.current = { date: todayCN(), index: 0, qs, records: [], startedAt: Date.now() };
  state.lastDaily = todayCN();
  writeState(state);
  await sendText(state.chatId, '📘 今日运营面试训练\n\n第1/3题\n题型：' + qs[0].cat + '\n场景：' + qs[0].scene + '\n题目：' + qs[0].q + '\n\n直接回复你的回答。');
}
function formatEvaluation(r, index) { return '✅ 第' + index + '题评价\n综合评分：' + r.score + '\n\n主要问题：' + r.mainGap + '\n\n改进建议：' + r.advice + '\n\n面试版回答：\n' + r.interviewAnswer; }
async function handleAnswer(chatId, answer) {
  state.chatId = chatId || state.chatId;
  if (!state.current) {
    if (/开始|训练/.test(answer)) return startDaily(state.chatId);
    return sendText(state.chatId, '今天训练尚未开始。回复“开始训练”即可启动。');
  }
  const c = state.current, q = c.qs[c.index], r = await evaluate(q, answer);
  r.q = q.q; r.cat = q.cat; r.answer = answer; r.knowledge = q.knowledge; r.duration = Math.round((Date.now() - c.startedAt) / 1000);
  c.records.push(r);
  if (c.index < 2) {
    c.index += 1; c.startedAt = Date.now(); writeState(state);
    const next = c.qs[c.index];
    return sendText(state.chatId, formatEvaluation(r, c.index) + '\n\n——\n📘 第' + (c.index + 1) + '/3题\n题型：' + next.cat + '\n题目：' + next.q);
  }
  const scores = c.records.map(x => x.score), avg = Math.round(scores.reduce((a,b) => a+b, 0) / scores.length);
  state.history.push({ date: c.date, records: c.records });
  state.current = null; writeState(state);
  return sendText(state.chatId, formatEvaluation(r, 3) + '\n\n📊 今日训练日报\n完成题数：3\n平均分：' + avg + '\n最高分：' + Math.max(...scores) + '\n最低分：' + Math.min(...scores) + '\n\n建议：48小时内复练本轮最低分题目。');
}
async function scheduledCheck() {
  const n = nowCN();
  if (n.includes('09:00') && state.lastDaily !== todayCN()) await startDaily(state.chatId);
  if (n.includes('20:00') && n.startsWith('Sun') && state.lastWeekly !== todayCN()) {
    const all = state.history.flatMap(x => x.records || []);
    if (all.length && state.chatId) {
      const avg = Math.round(all.reduce((s,r) => s+r.score, 0) / all.length);
      await sendText(state.chatId, '📅 本周运营面试周报\n本周完成：' + all.length + '题\n平均分：' + avg + '\n\n主要问题：' + [...new Set(all.map(r => r.mainGap))].slice(0,5).join('；') + '\n\n下周重点：加强指标拆解、真实案例和验证闭环。');
    }
    state.lastWeekly = todayCN(); writeState(state);
  }
}
setInterval(() => scheduledCheck().catch(err => console.error('schedule:', err.message)), 30_000);

const dispatcher = new Lark.EventDispatcher({}).register({
  'im.message.receive_v1': async data => {
    if (data.sender?.sender_type === 'bot') return;
    const chatId = data.message?.chat_id;
    let content = '';
    try { content = JSON.parse(data.message?.content || '{}').text?.trim() || ''; } catch {}
    if (!content) return;
    await handleAnswer(chatId, content);
  }
});
wsClient.start({ eventDispatcher: dispatcher });
console.log('Feishu long connection started. Keep this process running.');