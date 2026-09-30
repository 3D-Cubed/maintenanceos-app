import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('additive migration, fault-first constraints, atomic repairs and inherited RLS', async () => {
  const db = new PGlite()
  await db.exec(`create role anon; create role authenticated;
    create table assets (id uuid primary key default gen_random_uuid(), status text);
    create table repair_tickets (id uuid primary key default gen_random_uuid(), asset_id uuid references assets,
      title text, status text default 'Open', priority text, cost numeric, downtime_hours numeric, parts_used text,
      resolved_at timestamptz, resolution_notes text, created_at timestamptz default now());
    insert into assets values ('00000000-0000-0000-0000-000000000001','Operational'),('00000000-0000-0000-0000-000000000002','Operational');
    insert into repair_tickets (id,asset_id,title,status,cost,parts_used) values
      ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Legacy repair','Resolved',12,'belt'),
      ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','Legacy active','Diagnosing',5,'sensor');`)
  const before = (await db.query('select * from repair_tickets order by id')).rows
  const migration = await readFile(new URL('../DB-V19-FAULT-FIRST.sql', import.meta.url), 'utf8')
  await db.exec(migration); await db.exec(migration)
  assert.deepEqual((await db.query('select id,asset_id,title,status,priority,cost,downtime_hours,parts_used,resolved_at,resolution_notes,created_at from repair_tickets order by id')).rows, before)
  const asset='00000000-0000-0000-0000-000000000001'
  const other='00000000-0000-0000-0000-000000000002'
  const legacy='00000000-0000-0000-0000-000000000004'
  async function fails(sql, args=[]) { await assert.rejects(db.query(sql,args)) }
  await fails(`insert into repair_tickets(asset_id,title,status) values ($1,'Bad','Resolved')`,[asset])
  await fails(`insert into repair_tickets(asset_id,title,cost) values ($1,'Bad',0)`,[asset])
  const fault=(await db.query(`insert into repair_tickets(asset_id,title) values ($1,'New fault') returning id`,[asset])).rows[0].id
  assert.equal((await db.query('select status from assets where id=$1',[asset])).rows[0].status,'Needs Attention')
  await fails(`update repair_tickets set status='Resolved' where id=$1`,[fault])
  await fails(`update repair_tickets set asset_id=$1 where id=$2`,[other,fault])
  const rpc='select complete_fault_repair($1,$2,$3,$4,$5,$6)'
  await fails(rpc,[fault,other,'Repair',null,0,0])
  await fails(rpc,[fault,asset,' ',null,0,0])
  await fails(rpc,[fault,asset,'Repair',null,-1,0])
  await fails(rpc,[fault,asset,'Repair',null,'NaN',0])
  await fails(rpc,[fault,asset,'Repair',null,0,'Infinity'])
  assert.equal((await db.query('select count(*)::int n from fault_repairs')).rows[0].n,0)
  await db.query(rpc,[fault,asset,' Replaced and tested ','belt',0,1.5])
  const repaired=(await db.query('select * from repair_tickets where id=$1',[fault])).rows[0]
  assert.equal(repaired.status,'Resolved'); assert.equal(repaired.resolution_notes,'Replaced and tested')
  const linked=(await db.query('select * from fault_repairs where fault_id=$1',[fault])).rows[0]
  assert.equal(linked.asset_id,asset); assert.equal(linked.cost,'0'); assert.equal(linked.downtime_hours,'1.5')
  assert.equal((await db.query('select status from assets where id=$1',[asset])).rows[0].status,'Needs Attention')
  await fails(rpc,[fault,asset,'Duplicate',null,0,0])
  await fails(`update repair_tickets set status='Open' where id=$1`,[fault])
  await db.query(rpc,[legacy,asset,'Legacy fault repaired',null,5,2])
  assert.equal((await db.query('select status from assets where id=$1',[asset])).rows[0].status,'Operational')
  // A direct repair insert follows the same atomic closure path.
  const direct=(await db.query(`insert into repair_tickets(asset_id,title) values ($1,'Direct') returning id`,[asset])).rows[0].id
  await db.query('insert into fault_repairs(fault_id,asset_id,notes) values ($1,$2,$3)',[direct,asset,'Verified'])
  assert.equal((await db.query('select status from repair_tickets where id=$1',[direct])).rows[0].status,'Resolved')
  // RLS: caller can only repair visible tickets that it may update.
  await db.exec(`alter table assets enable row level security; alter table repair_tickets enable row level security;
    grant select,insert,update on assets,repair_tickets to anon,authenticated;
    create policy auth_assets on assets for all to authenticated using(true) with check(true);
    create policy auth_faults_select on repair_tickets for select to authenticated using(true);
    create policy auth_faults_insert on repair_tickets for insert to authenticated with check(true);`)
  await db.exec('set role anon')
  assert.equal((await db.query('select * from fault_repairs')).rows.length,0)
  await fails(rpc,[direct,asset,'Invisible',null,0,0])
  await db.exec('reset role; set role authenticated')
  const denied=(await db.query(`insert into repair_tickets(asset_id,title) values ($1,'No update permission') returning id`,[asset])).rows[0].id
  await fails(rpc,[denied,asset,'Denied update',null,0,0])
  assert.equal((await db.query('select count(*)::int n from fault_repairs where fault_id=$1',[denied])).rows[0].n,0)
  assert.equal((await db.query('select status from repair_tickets where id=$1',[denied])).rows[0].status,'Open')
  await db.exec(`reset role; create policy auth_faults_update on repair_tickets for update to authenticated using(true) with check(true); set role authenticated`)
  await db.query(rpc,[denied,asset,'Allowed update',null,0,0])
  assert.equal((await db.query('select status from repair_tickets where id=$1',[denied])).rows[0].status,'Resolved')
  await db.exec('reset role')
  const restricted=(await db.query(`insert into repair_tickets(asset_id,title) values ($1,'Restricted asset') returning id`,[asset])).rows[0].id
  await db.exec(`drop policy auth_assets on assets; create policy auth_assets_read on assets for select to authenticated using(true); set role authenticated`)
  await fails(rpc,[restricted,asset,'No asset update',null,0,0])
  assert.equal((await db.query('select status from repair_tickets where id=$1',[restricted])).rows[0].status,'Open')
  assert.equal((await db.query('select count(*)::int n from fault_repairs where fault_id=$1',[restricted])).rows[0].n,0)
  await fails('delete from fault_repairs')
  await db.close()
})
