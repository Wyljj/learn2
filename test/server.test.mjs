import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTrainingServer } from '../server.mjs';

async function fixture(t, options={}) {
  const dataDir=await mkdtemp(join(tmpdir(),'learn2-test-'));
  const app=await createTrainingServer({dataDir,...options});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  const url='http://127.0.0.1:'+app.server.address().port;
  const request=async(path,{body,method=body?'POST':'GET',cookie='',origin}={})=>{
    const res=await fetch(url+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=(res.headers.get('content-type')||'').includes('application/json')?await res.json():await res.text();
    return {status:res.status,data,cookie:res.headers.get('set-cookie')?.split(';')[0],headers:res.headers};
  };
  t.after(async()=>{await new Promise(r=>app.server.close(r));await rm(dataDir,{recursive:true,force:true});});
  return {app,dataDir,url,request};
}
const admin={name:'培训管理员',email:'trainer@example.test',password:'Train-test-2026!'};
const learner={name:'测试学员',email:'learner@example.test',password:'Learn-test-2026!'};
const material={title:'岗位操作要求',category:'岗位培训',content:'设备使用前必须检查状态，发现异常应立即停止使用并报告负责人。'};
const raw={type:'single',stem:'发现异常如何处理？',options:['继续使用','停止并报告'],answers:['B'],explanation:'异常时应停止并报告。',sourceExcerpt:'发现异常应立即停止使用并报告负责人'};

test('首次初始化、角色隔离、审核、服务端判分与成绩快照完整闭环',async t=>{
  const f=await fixture(t); const r=f.request;
  assert.equal((await r('/api/session')).data.setupRequired,true);
  const setup=await r('/api/setup',{body:admin}); assert.equal(setup.status,201); const ac=setup.cookie;
  assert.match(setup.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await r('/api/setup',{body:admin})).status,409);
  const initial=(await r('/api/state',{cookie:ac})).data;
  assert.equal(initial.attempts.length,0);assert.equal(initial.questions.length,0);
  const created=await r('/api/users',{cookie:ac,body:learner});assert.equal(created.status,201);
  const lc=(await r('/api/login',{body:{email:learner.email,password:learner.password}})).cookie;
  assert.equal((await r('/api/materials',{cookie:lc,body:material})).status,403);
  assert.equal((await r('/api/materials',{cookie:ac,origin:'https://evil.example',body:material})).status,403);
  const m=(await r('/api/materials',{cookie:ac,body:material})).data.material;
  const q=(await r('/api/questions',{cookie:ac,body:{...raw,materialId:m.id}})).data.question;
  assert.equal(q.status,'draft');
  assert.equal((await r('/api/sessions',{cookie:lc,body:{questionIds:[q.id]}})).status,422);
  await r('/api/questions/'+q.id,{cookie:ac,method:'PATCH',body:{status:'published'}});
  const ls=(await r('/api/state',{cookie:lc})).data;
  assert.equal(ls.questions.length,1); assert.equal('answers' in ls.questions[0],false);
  assert.equal('sourceExcerpt' in ls.questions[0],false);
  const session=(await r('/api/sessions',{cookie:lc,body:{questionIds:[q.id]}})).data.session;
  assert.equal('answers' in session.questions[0],false);
  assert.equal((await r('/api/sessions/'+session.id+'/submit',{cookie:ac,body:{answers:{[q.id]:['B']}}})).status,404);
  const submitted=await r('/api/sessions/'+session.id+'/submit',{cookie:lc,body:{answers:{[q.id]:['B']}}});
  assert.equal(submitted.status,201); assert.equal(submitted.data.attempt.accuracy,100);
  assert.equal(submitted.data.attempt.items[0].sourceExcerpt,raw.sourceExcerpt);
  assert.equal((await r('/api/sessions/'+session.id+'/submit',{cookie:lc,body:{answers:{[q.id]:['B']}}})).status,409);
  await r('/api/questions/'+q.id,{cookie:ac,method:'PATCH',body:{status:'draft'}});
  const state=(await r('/api/state',{cookie:ac})).data;
  assert.equal(state.stats.answerCount,1);assert.equal(state.attempts[0].items[0].answers[0],'B');
  const db=JSON.parse(await readFile(join(f.dataDir,'training.json'),'utf8'));
  assert.equal(db.users[0].password,undefined); assert.ok(db.users[0].passwordHash);
  assert.equal(db.attempts.length,1);
  const exported=await r('/api/export?format=json',{cookie:ac});
  assert.equal(exported.status,200);assert.equal(JSON.stringify(exported.data).includes('passwordHash'),false);
  assert.equal((await r('/api/export?format=csv',{cookie:lc})).status,403);
  const outsider=(await r('/api/users',{cookie:ac,body:{name:'学员二',email:'other@example.test',password:'Other-test-2026!'}})).data.user;
  assert.ok(outsider.id);
  const oc=(await r('/api/login',{body:{email:'other@example.test',password:'Other-test-2026!'}})).cookie;
  assert.equal((await r('/api/state',{cookie:oc})).data.attempts.length,0);
});

test('题目批量导入原子校验、未配置 AI 不伪造题目',async t=>{
  const {request:r}=await fixture(t);
  const ac=(await r('/api/setup',{body:admin})).cookie;
  const m=(await r('/api/materials',{cookie:ac,body:material})).data.material;
  const imp=await r('/api/questions/import',{cookie:ac,body:{materialId:m.id,questions:[raw,{...raw,sourceExcerpt:'不存在的错误依据'}]}});
  assert.equal(imp.status,422);assert.equal((await r('/api/state',{cookie:ac})).data.questions.length,0);
  const ai=await r('/api/generate',{cookie:ac,body:{materialId:m.id,count:2}});
  assert.equal(ai.status,503);assert.equal((await r('/api/state',{cookie:ac})).data.questions.length,0);
});

test('AI 集成生成草稿并校验原文依据，失败不回退到示例',async t=>{
  let sent;
  const {request:r}=await fixture(t,{ai:{baseUrl:'https://ai.example.test/v1',apiKey:'not-a-real-key',model:'test-model'},fetchImpl:async(url,init)=>{
    sent={url,body:JSON.parse(init.body)};
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({questions:[raw]})}}]}),{status:200});
  }});
  const ac=(await r('/api/setup',{body:admin})).cookie;
  const m=(await r('/api/materials',{cookie:ac,body:material})).data.material;
  const out=await r('/api/generate',{cookie:ac,body:{materialId:m.id,count:1}});
  assert.equal(out.status,201);assert.equal(out.data.questions[0].status,'draft');
  assert.equal(out.data.questions[0].origin,'ai');
  assert.ok(sent.body.messages.some(x=>x.content.includes(material.content)));
  assert.equal(sent.url,'https://ai.example.test/v1/chat/completions');
});

test('存量文件重启后保留账号与资料',async t=>{
  const f=await fixture(t);const ac=(await f.request('/api/setup',{body:admin})).cookie;
  await f.request('/api/materials',{cookie:ac,body:material});
  const reopened=await createTrainingServer({dataDir:f.dataDir});
  assert.equal(reopened.store.snapshot().users.length,1);
  assert.equal(reopened.store.snapshot().materials.length,1);
});

test('密码保留用户输入的空格，不进行静默改写',async t=>{
  const {request:r}=await fixture(t);
  const withSpace={...admin,password:'  Exact-password-2026!  '};
  await r('/api/setup',{body:withSpace});
  assert.equal((await r('/api/login',{body:{email:withSpace.email,password:withSpace.password.trim()}})).status,401);
  assert.equal((await r('/api/login',{body:{email:withSpace.email,password:withSpace.password}})).status,200);
});

test('AI 服务错误或引用虚构依据均不写入题库',async t=>{
  let badSource=false;
  const {request:r}=await fixture(t,{ai:{baseUrl:'https://ai.example.test/v1',apiKey:'not-a-real-key',model:'test-model'},fetchImpl:async()=>badSource
    ?new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({questions:[{...raw,sourceExcerpt:'AI编造且原文不存在的依据'}]})}}]}),{status:200})
    :new Response('upstream error',{status:503})});
  const ac=(await r('/api/setup',{body:admin})).cookie;
  const m=(await r('/api/materials',{cookie:ac,body:material})).data.material;
  assert.equal((await r('/api/generate',{cookie:ac,body:{materialId:m.id,count:1}})).status,502);
  badSource=true;
  assert.equal((await r('/api/generate',{cookie:ac,body:{materialId:m.id,count:1}})).status,422);
  assert.equal((await r('/api/state',{cookie:ac})).data.questions.length,0);
});

test('并发提交只形成一份成绩，重复导入人员不会重复建号',async t=>{
  const {request:r}=await fixture(t);const ac=(await r('/api/setup',{body:admin})).cookie;
  const users=await Promise.all([r('/api/users',{cookie:ac,body:learner}),r('/api/users',{cookie:ac,body:learner})]);
  assert.deepEqual(users.map(x=>x.status).sort(),[201,409]);
  const m=(await r('/api/materials',{cookie:ac,body:material})).data.material;
  const q=(await r('/api/questions',{cookie:ac,body:{...raw,materialId:m.id}})).data.question;
  await r('/api/questions/'+q.id,{cookie:ac,method:'PATCH',body:{status:'published'}});
  const session=(await r('/api/sessions',{cookie:ac,body:{questionIds:[q.id]}})).data.session;
  const results=await Promise.all([r('/api/sessions/'+session.id+'/submit',{cookie:ac,body:{answers:{[q.id]:['B']}}}),r('/api/sessions/'+session.id+'/submit',{cookie:ac,body:{answers:{[q.id]:['B']}}})]);
  assert.deepEqual(results.map(x=>x.status).sort(),[201,409]);
  assert.equal((await r('/api/state',{cookie:ac})).data.attempts.length,1);
});
