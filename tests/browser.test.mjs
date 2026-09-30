import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'
const fixture = `
window.testState = {assets:[{id:'asset-1',name:'Test Printer',type:'FDM',status:'Operational'}],faults:[],inserts:[],rpc:[],failInsert:false,failRpc:false,throwInsert:false,failPhoto:false};
const QRCode={toDataURL:async()=> 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNqkAAAAASUVORK5CYII='};
const supabase={from(table){
 const q={op:'select',payload:null,select(){return this},or(){return this},order(){return this},eq(){return this},neq(){return this},insert(p){this.op='insert';this.payload=p;return this},update(p){this.op='update';this.payload=p;return this},
 async then(ok,bad){try{const st=window.testState;await new Promise(r=>setTimeout(r,30));
 if(table==='repair_tickets'&&this.op==='insert'){
 if(st.throwInsert)throw new Error('Network disconnected');
 if(st.failInsert)return ok({error:{message:'Database rejected write'}});
 st.inserts.push(this.payload);st.faults.unshift({...this.payload,id:'fault-'+st.inserts.length,created_at:new Date().toISOString()});st.assets[0].status='Needs Attention';}
 return ok({data:table==='assets'?st.assets:table==='repair_tickets'?st.faults:[],error:null});
 }catch(e){return bad(e)}}};return q},
 async rpc(name,args){const st=window.testState;st.rpc.push({name,args});await new Promise(r=>setTimeout(r,50));if(st.failRpc)return {error:{message:'RPC rejected'}};
 const f=st.faults.find(f=>f.id===args.p_fault_id&&f.asset_id===args.p_asset_id&&f.status!=='Resolved');if(!f)return {error:{message:'Inactive fault'}};
 Object.assign(f,{status:'Resolved',resolution_notes:args.p_notes,cost:args.p_cost,downtime_hours:args.p_downtime,parts_used:args.p_parts,resolved_at:new Date().toISOString()});return {error:null};},
 storage:{from(){return {upload:async()=>({error:window.testState.failPhoto?{message:'Upload rejected'}:null}),getPublicUrl:()=>({data:{publicUrl:'https://example.test/photo.png'}})}}}};
`

test('fault reporting and repair modal stay interactive on desktop and mobile', async () => {
 const source=(await readFile(new URL('../src/main.js',import.meta.url),'utf8')).replace(/^import .*\n/gm,'')
 const css=await readFile(new URL('../src/style.css',import.meta.url),'utf8')
 const server=createServer((req,res)=>{res.setHeader('content-type','text/html');res.end(`<meta charset="utf-8"><style>${css}</style><div id="app"></div><script type="module">${fixture}\n${source}</script>`)})
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 let browser
 try { browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined,args:['--no-sandbox']}) } catch(err) {await new Promise(r=>server.close(r));throw err}
 try {
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
 const page=await browser.newPage({viewport}); const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto(`http://127.0.0.1:${server.address().port}/#repairs`)
 await page.locator('#enterPlatform').click();await page.locator('#repairTitle').waitFor()
 assert.equal(await page.locator('#repairStatus,#repairCost,#repairDowntime,#repairParts').count(),0)
 await page.locator('#addRepair').click();await page.locator('#messageBox').filter({hasText:'Fault title is required'}).waitFor()
 await page.locator('#repairTitle').fill('Motor fault')
 await page.evaluate(()=>window.testState.throwInsert=true)
 await page.locator('#addRepair').click();await page.locator('#messageBox').filter({hasText:'Network disconnected'}).waitFor()
 assert.equal(await page.locator('#addRepair').isEnabled(),true)
 await page.evaluate(()=>{window.testState.throwInsert=false;window.testState.failPhoto=true})
 await page.locator('#repairPhoto').setInputFiles({name:'fault.png',mimeType:'image/png',buffer:Buffer.from('photo')})
 await page.locator('#addRepair').click();await page.locator('#messageBox').filter({hasText:'upload failed'}).waitFor()
 assert.equal(await page.evaluate(()=>window.testState.inserts.length),0)
 await page.evaluate(()=>window.testState.failPhoto=false)
 await page.locator('#repairPhoto').setInputFiles([])
 // Rapid double submission must create one fault with no repair-only values.
 await page.evaluate(()=>{document.querySelector('#addRepair').click();document.querySelector('#addRepair').click()})
 await page.locator('.repair-row').waitFor()
 const payload=await page.evaluate(()=>window.testState.inserts)
 assert.equal(payload.length,1); assert.equal(payload[0].status,'Open')
 for(const key of ['cost','downtime_hours','parts_used','resolved_at','resolution_notes'])assert.equal(key in payload[0],false)
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight))
 assert.ok(await page.evaluate(()=>window.scrollY>0))
 await page.locator('.resolve-btn').click();await page.locator('#resolutionNotes').waitFor({state:'visible'})
 await page.locator('#cancelResolve').click();assert.equal(await page.locator('#resolveModal').isVisible(),false)
 await page.locator('.resolve-btn').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#resolveModal').isVisible(),false)
 await page.locator('.resolve-btn').click();
 await page.locator('#resolutionNotes').waitFor({state:'visible'});
 if(process.env.QA_SCREENSHOT_DIR) await page.waitForTimeout(250);
 if(process.env.QA_SCREENSHOT_DIR) await page.screenshot({path:process.env.QA_SCREENSHOT_DIR+'/repair-'+viewport.width+'.png'});
 await page.locator('#resolutionNotes').fill('Replaced motor and verified operation')
 await page.locator('#resolutionCost').fill('-1');await page.locator('#confirmResolve').click();assert.equal(await page.evaluate(()=>window.testState.rpc.length),0)
 await page.locator('#resolutionCost').fill('0');await page.locator('#resolutionDowntime').fill('1.5')
 await page.evaluate(()=>window.testState.failRpc=true)
 await page.locator('#confirmResolve').click();await page.locator('#toastBox').filter({hasText:'RPC rejected'}).waitFor()
 assert.equal(await page.locator('#confirmResolve').isEnabled(),true)
 assert.equal(await page.locator('#resolveModal').isVisible(),true)
 await page.evaluate(()=>window.testState.failRpc=false)
 await page.locator('#confirmResolve').click();await page.locator('#resolveModal').waitFor({state:'hidden'})
 await page.locator('.repair-row.resolved').waitFor()
 assert.equal(await page.locator('.repair-row.resolved .resolve-btn').count(),0)
 const rpc=await page.evaluate(()=>window.testState.rpc.at(-1))
 assert.equal(rpc.name,'complete_fault_repair');assert.equal(rpc.args.p_fault_id,'fault-1');assert.equal(rpc.args.p_asset_id,'asset-1');assert.equal(rpc.args.p_cost,0)
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));assert.ok(await page.evaluate(()=>window.scrollY>0))
 await page.locator('[data-page="assets"]').click();await page.waitForFunction(()=>location.hash==='#assets')
 // Asset/QR route uses the same fault-first form; route change closes overlays.
 await page.evaluate(()=>location.hash='asset/asset-1');await page.locator('#saveRepair').waitFor()
 assert.equal(await page.locator('#repairStatus,#repairCost,#repairDowntime,#repairParts').count(),0)
 await page.locator('#repairTitle').fill('Second fault');await page.locator('#saveRepair').click()
 await page.waitForFunction(()=>window.testState.inserts.length===2)
 await page.locator('#repairTitle').waitFor();await page.evaluate(()=>window.resolveRepair('fault-2','asset-1'))
 await page.locator('#resolveModal').waitFor({state:'visible'})
 await page.evaluate(()=>location.hash='dashboard');await page.locator('#resolveModal').waitFor({state:'hidden'})
 assert.deepEqual(errors,[])
 await page.close()
 }
 } finally {await browser.close();await new Promise(r=>server.close(r))}
})
