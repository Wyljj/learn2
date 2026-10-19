import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('界面按服务端trainer角色显示管理入口，learner没有管理入口',async()=>{
  const source=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replace(/bootstrap\(\);\s*$/,'');
  const element={addEventListener(){},classList:{toggle(){}},hidden:false,textContent:''};
  const context=vm.createContext({document:{getElementById:()=>element},console,setTimeout,clearTimeout,Set,Date});
  vm.runInContext(source,context);
  assert.equal(vm.runInContext("model.user={role:'trainer'};isAdmin()",context),true);
  assert.equal(vm.runInContext("model.user={role:'learner'};isAdmin()",context),false);
});
