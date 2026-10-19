import { mkdir, readFile, open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function createStore(directory) {
  await mkdir(directory,{recursive:true});
  const file=join(directory,'training.json');
  let data;
  try {
    data=JSON.parse(await readFile(file,'utf8'));
    if(data.version!==1||!['users','materials','questions','quizzes','attempts'].every(k=>Array.isArray(data[k]))) throw new Error('数据文件结构不正确，请先恢复备份，系统未覆盖原文件');
  } catch(e) {
    if(e.code!=='ENOENT') throw e;
    data={version:1,users:[],materials:[],questions:[],quizzes:[],attempts:[]};
  }
  let pending=Promise.resolve();
  return {
    snapshot:()=>structuredClone(data),
    transaction(operation) {
      const result=pending.then(async()=>{
        const next=structuredClone(data);
        const value=await operation(next);
        const temporary=join(directory,`.training-${randomUUID()}.tmp`);
        try {
          const handle=await open(temporary,'wx',0o600);
          try {await handle.writeFile(JSON.stringify(next,null,2),'utf8');await handle.sync();} finally {await handle.close();}
          await rename(temporary,file);
        } catch(e) {await rm(temporary,{force:true}).catch(()=>{});throw e;}
        data=next;
        return structuredClone(value);
      });
      pending=result.catch(()=>{});
      return result;
    }
  };
}
