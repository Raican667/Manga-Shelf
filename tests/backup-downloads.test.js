'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
async function scenario(worker) {
  const memory = {}, files = [], removed = [], payloads = [];
  let granted = false, fail = false, interrupt = false, forbidden = false;
  const owner = 'manga-shelf@test';
  const context = { TextEncoder, Blob, URL: worker ? {} : URL, crypto: require('node:crypto').webcrypto, btoa, setTimeout,
    browser: { runtime: { id: owner }, permissions: { contains: async () => granted },
      storage: { local: { get: async key => ({[key]: structuredClone(memory[key])}), set: async data => Object.assign(memory, structuredClone(data)) } },
      downloads: { download: async options => {
        if(fail) throw new Error('secret ' + options.url);
        assert.equal(options.saveAs, false); assert.equal(options.conflictAction, 'uniquify');
        assert.ok(options.url.startsWith(worker ? 'data:application/json;base64,' : 'blob:'));
        payloads.push(await (await fetch(options.url)).json());
        const id = files.length + 1;
        files.push({...options,id,filename:'C:/Downloads/'+options.filename,byExtensionId:owner,exists:true,state:interrupt?'interrupted':'complete'});
        return id;
      }, search: async ({id}) => files.filter(file=>file.id===id), removeFile: async id => {if(forbidden) throw Error('access denied');files.find(file=>file.id===id).exists=false;removed.push(id);} }
    }
  };
  vm.createContext(context); vm.runInContext(fs.readFileSync(require.resolve('../shared/backup-target.js'),'utf8'),context);
  const api = context.MangaBackupTarget;
  const snapshot = {items:[{title:'日本語 Ä test'}],settings:{language:'de'},localCovers:{one:'data:image/png;base64,AA=='}};
  assert.equal((await api.status()).ready,false);
  await assert.rejects(api.write(snapshot,'2026-10-26',7),/DOWNLOAD_PERMISSION_REQUIRED/);
  granted=true;
  for(let i=0;i<9;i++) await api.write(snapshot,'2026-10-26',7);
  assert.deepEqual(removed,[1,2]);assert.equal(files.filter(f=>f.exists).length,7);
  assert.deepEqual(payloads[0],snapshot);
  fail=true;await assert.rejects(api.write(snapshot,'2026-10-26',7),error=>error.message==='BACKUP_DOWNLOAD_FAILED');assert.equal(removed.length,2);fail=false;
  interrupt=true;await assert.rejects(api.write(snapshot,'2026-10-26',7),/BACKUP_DOWNLOAD_FAILED/);assert.equal(removed.length,2);interrupt=false;
  await api.write(snapshot,'2026-10-26',7);assert.equal(removed.length,3);
  // Missing history is never guessed, and an ID reused by another extension
  // cannot cause that file to be removed even if local metadata was retained.
  const first=memory[api.KEY].files[0];files.find(f=>f.id===first.id).byExtensionId='other@test';
  const result=await api.write(snapshot,'2026-10-26',7);assert.equal(result.cleanupError,'BACKUP_CLEANUP_FAILED');assert.equal(removed.includes(first.id),false);
  await assert.rejects(api.write(snapshot,'../escape',7),/INVALID_BACKUP_DAY/);
  await assert.rejects(api.write(snapshot,'2026-10-26',366),/INVALID_BACKUP_COUNT/);
}
(async()=>{await scenario(false);await scenario(true);console.log('Download backups: Firefox Blob and Chrome worker UTF-8, completion, retention, ownership and failure safety verified.');})().catch(error=>{console.error(error);process.exitCode=1;});
