const SITE='https://mengjingyi81-ux.github.io/yunying-mianshi-trainer/';

export default {
 async fetch(req,env){
  if(req.method!=='POST'){
   return new Response('运营面试机器人 V2 运行中');
  }

  const body=await req.json();

  if(body.challenge){
   return Response.json({challenge:body.challenge});
  }

  if(body.header?.event_type!=='im.message.receive_v1'){
   return Response.json({ok:true});
  }

  const text=JSON.parse(body.event.message.content||'{}').text?.trim();

  if(!text){
   return Response.json({ok:true});
  }

  await handleAnswer(text,env);

  return Response.json({ok:true});
 },

 async scheduled(event,env){
  const now=new Date(Date.now()+8*3600*1000);
  const day=now.getUTCDay();

  if(day===0&&now.getUTCHours()>=20){
   await sendWeekly(env);
  }else{
   await startDaily(env);
  }
 }
};


async function token(env){

 const r=await fetch(
 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal/',
 {
  method:'POST',
  headers:{
   'Content-Type':'application/json'
  },
  body:JSON.stringify({
   app_id:env.FEISHU_APP_ID,
   app_secret:env.FEISHU_APP_SECRET
  })
 });

 const j=await r.json();

 if(!j.tenant_access_token){
  throw Error(j.msg||'Feishu auth failed');
 }

 return j.tenant_access_token;
}


async function send(text,env){

 const t=await token(env);

 const type=env.FEISHU_RECEIVE_ID_TYPE||'open_id';

 const r=await fetch(
 'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type='+type,
 {
  method:'POST',
  headers:{
   'Content-Type':'application/json',
   'Authorization':'Bearer '+t
  },
  body:JSON.stringify({
   receive_id:env.FEISHU_RECEIVER_ID,
   msg_type:'text',
   content:JSON.stringify({
    text
   })
  })
 });

 if(!r.ok){
  throw Error('Feishu send failed:'+await r.text());
 }
}


async function bank(){

 return fetch(
  SITE+'questions.json'
 ).then(r=>r.json());

}



async function startDaily(env){

 const qs=(await bank())
 .sort(()=>Math.random()-0.5)
 .slice(0,3);


 const state={
  date:new Date().toISOString().slice(0,10),
  index:0,
  qs,
  records:[],
  startedAt:Date.now()
 };


 await env.TRAINING_STATE.put(
  'current',
  JSON.stringify(state)
 );


 await send(
 `📘 今日运营面试训练

第1/3题

岗位方向：
${qs[0].cat}

业务场景：
${qs[0].scene}

面试题：
${qs[0].q}

请按照真实项目经验回答。
回答后，我会按照大厂运营负责人标准进行评价。`,
 env);

}



async function handleAnswer(answer,env){

 const raw=await env.TRAINING_STATE.get('current');


 if(!raw){

  await send(
  '今天训练尚未开始。\n发送“开始训练”即可启动。',
  env
  );

  if(/开始/.test(answer)){
   await startDaily(env);
  }

  return;
 }


 const s=JSON.parse(raw);

 const q=s.qs[s.index];


 const record=await evaluate(
 q,
 answer,
 env
 );


 record.date=new Date().toISOString();

 record.duration=Math.round(
  (Date.now()-s.startedAt)/1000
 );


 s.records.push(record);



 let feedback=
 `
✅ 第${s.index+1}题评价

综合评分：${record.score}

业务能力：
${record.dimensions.business}/20

策略能力：
${record.dimensions.strategy}/25

经验真实性：
${record.dimensions.experience}/20

数据能力：
${record.dimensions.data}/20

表达结构：
${record.dimensions.expression}/15


优势：
${record.strengths.join('、')}


主要问题：
${record.mainGap}


改进建议：
${record.advice}


优秀回答参考：
${record.interviewAnswer}


面试官追问：
${record.followUpQuestions.join('\n')}
`;


 if(s.index<2){

  s.index++;

  s.startedAt=Date.now();

  await env.TRAINING_STATE.put(
   'current',
   JSON.stringify(s)
  );


  const n=s.qs[s.index];


  await send(
  feedback+
  `

——

📘 第${s.index+1}/3题

题目：
${n.q}`,
  env);

 }else{

  await saveHistory(s,env);

  await env.TRAINING_STATE.delete('current');

  await send(
   feedback+
   '\n\n'+dailyReport(s),
   env
  );
 }

}



async function evaluate(q,answer,env){

 if(!env.OPENAI_API_KEY){

  return localEval(q,answer);

 }


 const prompt=`

你是一名拥有10年以上互联网经验的高级运营负责人。

你的经历：
- 用户增长负责人
- 内容生态负责人
- 产品运营负责人
- 商业化运营负责人

你正在面试一个3-8年经验的运营候选人。

你的目标：
判断候选人是否具备真实业务能力。

不要评价语言，要评价业务。


评分标准：

业务理解 20分：
是否理解业务目标、用户问题和核心矛盾。

策略能力 25分：
是否能拆解策略、判断优先级、考虑资源限制。

经验真实性 20分：
是否有真实项目细节，而不是背方法论。

数据能力 20分：
是否有指标体系、实验验证和结果分析。

表达结构 15分：
是否有完整业务闭环。


重点识别：

- 只讲活动，不讲为什么
- 只讲结果，不讲过程
- 只讲指标，不理解业务
- 没有用户洞察
- 没有复盘


返回严格JSON：

{
"score":数字,
"dimensions":{
"business":数字,
"strategy":数字,
"experience":数字,
"data":数字,
"expression":数字
},
"strengths":["优势"],
"gaps":["问题"],
"mainGap":"最大问题",
"advice":"改进建议",
"interviewAnswer":"高级运营回答示范",
"followUpQuestions":[
"追问1",
"追问2",
"追问3"
]
}


题目：
${q.q}

参考框架：
${q.formula}

候选人回答：
${answer}

`;


 try{

 const r=await fetch(
 'https://api.openai.com/v1/responses',
 {
  method:'POST',
  headers:{
   'Content-Type':'application/json',
   'Authorization':'Bearer '+env.OPENAI_API_KEY
  },
  body:JSON.stringify({

   model:env.OPENAI_MODEL||'gpt-5.6',

   input:prompt

  })
 });


 const j=await r.json();


 return {
  ...JSON.parse(
   j.output_text
   .replace(/^```json|```$/g,'')
   .trim()
  ),
  q:q.q,
  cat:q.cat,
  answer,
  knowledge:q.knowledge
 };


 }catch(e){

  return localEval(q,answer);

 }

}
function localEval(q,a){

 const signals=[
  '目标',
  '指标',
  '用户',
  '分层',
  '原因',
  '策略',
  '数据',
  '验证',
  '实验',
  '复盘',
  'ROI'
 ];


 const hits=signals.filter(
  x=>a.includes(x)
 ).length;


 const score=Math.min(
  92,
  Math.max(
   40,
   40+
   hits*4+
   Math.round(
    Math.min(a.length,300)/15
   )
  )
 );


 let gap='';


 if(!a.includes('目标')){
  gap='没有明确业务目标，没有说明为什么做这件事。';
 }
 else if(!a.includes('指标')){
  gap='缺少指标体系，没有说明如何衡量效果。';
 }
 else if(!a.includes('分层')){
  gap='缺少用户分层，没有体现精细化运营思维。';
 }
 else if(!a.includes('数据')){
  gap='缺少数据验证，没有形成业务闭环。';
 }
 else{
  gap='案例细节不足，需要补充真实业务背景和结果。';
 }


 return {

  q:q.q,

  cat:q.cat,

  answer:a,

  score,


  dimensions:{
   business:Math.round(score*.2),
   strategy:Math.round(score*.25),
   experience:Math.round(score*.2),
   data:Math.round(score*.2),
   expression:Math.round(score*.15)
  },


  strengths:[
   '能够尝试描述解决方案'
  ],


  gaps:[
   gap
  ],


  mainGap:gap,


  advice:
  '建议按照业务目标→用户分析→策略设计→执行方案→数据验证→复盘优化的结构重新组织答案。',


  interviewAnswer:
  '优秀回答应该先明确业务目标和核心问题，再分析用户和业务原因，选择合适增长杠杆，通过指标体系和实验验证效果，最终形成复盘闭环。',


  followUpQuestions:[
   '如果预算减少50%，你的策略如何调整？',
   '你如何证明这个方案带来的增长来自运营动作，而不是自然增长？',
   '这个项目中最关键的指标是什么？为什么？'
  ],


  knowledge:q.knowledge

 };

}



function dailyReport(s){

 const scores=s.records.map(
  r=>r.score
 );


 const avg=Math.round(
  scores.reduce((a,b)=>a+b,0)
  /
  scores.length
 );


 const gaps=[
  ...new Set(
   s.records.map(
    r=>r.mainGap
   )
  )
 ];


 return `

📊 今日运营面试训练日报


完成题数：
${scores.length}


平均分：
${avg}


最高分：
${Math.max(...scores)}


最低分：
${Math.min(...scores)}



能力分析：

业务理解：
${Math.round(avg*.2)}/20


策略能力：
${Math.round(avg*.25)}/25


数据能力：
${Math.round(avg*.2)}/20



主要问题：

${gaps.join('；')}



训练建议：

下一阶段重点提升：
1. 用业务目标替代执行描述
2. 增加数据指标和验证过程
3. 补充真实项目案例细节

`;

}



async function saveHistory(s,env){

 const now=
 new Date(Date.now()+8*3600*1000);


 const key=
 'week:'+weekKey(now);


 const old=
 JSON.parse(
  await env.TRAINING_STATE.get(key)
  ||
  '[]'
 );


 old.push({

  date:s.date,

  records:s.records

 });


 await env.TRAINING_STATE.put(
  key,
  JSON.stringify(old)
 );

}



function weekKey(d){

 const one=
 new Date(
  Date.UTC(
   d.getUTCFullYear(),
   0,
   1
  )
 );


 const days=
 Math.floor(
  (d-one)/86400000
 );


 return d.getUTCFullYear()
 +
 '-'
 +
 String(
  Math.ceil(
   (days+
    one.getUTCDay()
    +1
   )/7
  )
 )
 .padStart(2,'0');

}



async function sendWeekly(env){

 const now=
 new Date(
  Date.now()+8*3600*1000
 );


 const items=
 JSON.parse(
  await env.TRAINING_STATE.get(
   'week:'+weekKey(now)
  )
  ||
  '[]'
 );


 const rs=
 items.flatMap(
  x=>x.records||[]
 );


 if(!rs.length){

  return send(
   '📅 本周暂无完整训练记录，下周继续训练。',
   env
  );

 }


 const avg=
 Math.round(
  rs.reduce(
   (s,r)=>s+r.score,
   0
  )
  /
  rs.length
 );


 const gaps=[
  ...new Set(
   rs.map(
    r=>r.mainGap
   )
  )
 ].slice(0,5);



 const detail=
 rs.map(
 (r,i)=>
 `
${i+1}.
题目：
${r.q}

评分：
${r.score}

主要问题：
${r.mainGap}

优化方向：
${r.advice}

`
 ).join('\n');



 await send(

`
📅 运营面试训练周报


本周完成：
${rs.length}题


平均分：
${avg}



能力短板：

${gaps.join('\n')}



下周训练重点：

1. 提升业务拆解能力
2. 增强数据指标意识
3. 增加真实项目案例表达



详细记录：

${detail}

`,
 env);

}
