/** Disposable synthetic family for authenticated chat acceptance; never targets a real family. */
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '../src/lib/supabase/admin';
import { performAnalyzeStep } from '../src/lib/pipeline/analyze-step';

const statePath = process.env.ORDILO_QA_STATE ?? '/tmp/ordilo-chat-acceptance-state.json';
const base = process.env.ORDILO_EVAL_BASE_URL ?? 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Fixture runner only targets a local API.');
const admin = createClient();
type State = { email: string; password: string; userId: string; familyId: string; documents: string[] };
async function save(state: State) { await writeFile(statePath, JSON.stringify(state), { mode: 0o600 }); }
function checked<T extends { data: unknown; error: { message: string } | null }>(result: T, operation: string): T["data"] {
  if (result.error) throw new Error(`${operation}: ${result.error.message}`);
  return result.data;
}
async function main() {
  let state: State;
  try { state = JSON.parse(await readFile(statePath, 'utf8')); }
  catch {
    const email = `ordilo-chat-qa-${randomUUID()}@example.com`; const password = randomBytes(32).toString('hex');
    const created = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'create synthetic user');
    state = { email, password, userId: created.user!.id, familyId: '', documents: [] }; await save(state);
  }
  if (!state.email.startsWith('ordilo-chat-qa-') || !state.email.endsWith('@example.com')) throw new Error('Not a disposable fixture.');
  if (!state.familyId) {
    const family = checked(await admin.from('families').insert({ name: 'Chat-Abnahme · synthetisch', created_by: state.userId, onboarding_completed_at: new Date().toISOString() }).select('id').single(), 'create family');
    state.familyId = family!.id; await save(state);
    const members = checked(await admin.from('family_members').insert([
      { family_id: state.familyId, name: 'Alex', role: 'Vater', birthdate: '1985-03-02' },
      { family_id: state.familyId, name: 'Hannah', role: 'Tochter', birthdate: '2011-02-11' },
      { family_id: state.familyId, name: 'Emma', role: 'Tochter', birthdate: '2016-07-19' },
    ]).select('id,name'), 'create members')!;
    const parent = members.find(m => m.name === 'Alex')!;
    checked(await admin.from('family_member_relations').insert(members.filter(m => m.id !== parent.id).flatMap(m => [
      {family_id:state.familyId,member_id:parent.id,related_member_id:m.id,role:'Vater'},
      {family_id:state.familyId,member_id:m.id,related_member_id:parent.id,role:'Tochter'},
    ])), 'create relationships');
  }
  const family = checked(await admin.from('families').select('created_by,name').eq('id', state.familyId).single(), 'verify fixture');
  if (family?.created_by !== state.userId || family.name !== 'Chat-Abnahme · synthetisch') throw new Error('Fixture ownership mismatch.');
  const auth = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const signed = checked(await auth.auth.signInWithPassword({ email: state.email, password: state.password }), 'fixture sign in');
  const token = signed.session!.access_token;
  checked(await admin.from('family_members').update({linked_user_id:state.userId}).eq('family_id',state.familyId).eq('name','Alex'), 'link synthetic speaker');
  if (process.argv[2] === 'original') {
    const id = state.documents[3];
    const file = `${state.familyId}/${id}/qa-original.pdf`;
    const content = 'BT /F1 16 Tf 50 780 Td (Elternabend Hannah) Tj 0 -30 Td (Hannahs Klasse: Elternabend am 15.09.2027) Tj 0 -25 Td (um 19:30 Uhr im Raum B12.) Tj ET';
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
    let pdf='%PDF-1.4\n';const offsets=[0];for(const [i,obj] of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;}const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    checked(await admin.storage.from('documents').upload(file,Buffer.from(pdf),{contentType:'application/pdf',upsert:true}),'upload synthetic original');
    checked(await admin.from('documents').update({file_url:file,mime_type:'application/pdf',source:'upload'}).eq('id',id).eq('family_id',state.familyId),'attach synthetic original');
    console.log('Synthetic PDF attached for native original-file verification.'); return;
  }
  if (process.argv[2] === 'reset') {
    checked(await admin.from('chat_usage').delete().eq('family_id', state.familyId), 'reset synthetic allowance');
    console.log('Synthetic test allowance reset.'); return;
  }
  if (process.argv[2] === 'run') {
    // Only the synthetic family's usage is reset for an explicitly requested repeat evaluation.
    checked(await admin.from('chat_usage').delete().eq('family_id', state.familyId), 'reset synthetic allowance');
    const child = spawn(process.execPath, ['--experimental-strip-types', 'scripts/live-chat-eval.ts', process.argv[3] ?? 'docs/quality/chat-cases.json'], { stdio: 'inherit', env: { ...process.env, ORDILO_EVAL_BASE_URL: base, ORDILO_EVAL_FAMILY_ID: state.familyId, ORDILO_EVAL_TOKEN: token, ORDILO_EVAL_SYNTHETIC: '1' } });
    process.exitCode = await new Promise<number>(resolve => child.on('exit', code => resolve(code ?? 1))); return;
  }
  const documents: Array<{ title: string; content: string }> = JSON.parse(await readFile('docs/quality/chat-documents.json', 'utf8'));
  for (const [index, document] of documents.entries()) {
    if (state.documents[index]) continue;
    const id = randomUUID();
    checked(await admin.from('documents').insert({ id, family_id: state.familyId, uploaded_by: state.userId, title: document.title, source: 'manual', document_type: 'other', status: 'analyzing', file_url: '', mime_type: 'text/plain', ocr_text: document.content, page_count: 1 }), 'create synthetic document');
    checked(await admin.from('document_pages').insert({ document_id: id, page_number: 1, ocr_markdown: document.content }), 'create page');
    const analysis = await performAnalyzeStep(admin, { id, family_id: state.familyId, ocr_text: document.content, source: 'manual', title: document.title, document_type: 'other', wasConfirmed: false });
    const response = await fetch(new URL(`/api/documents/${id}/confirm`, base), { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(analysis) });
    if (!response.ok) throw new Error(`confirm synthetic document ${index + 1}: HTTP ${response.status} ${await response.text()}`);
    state.documents[index] = id; await save(state); console.log(`Fixture ${index + 1}/${documents.length} analyzed, confirmed and indexed.`);
  }
  console.log('Synthetic acceptance family ready. Credentials remain in the private temporary state file.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Acceptance setup failed.'); process.exitCode = 1; });
