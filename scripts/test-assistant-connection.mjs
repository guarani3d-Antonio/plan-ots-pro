import assert from 'node:assert/strict';
import { assistantConnection } from '../src/services/assistantConnection.ts';
import { assistantVerification } from '../supabase/functions/_shared/assistant-verification.mjs';
import { useAssistantStore } from '../src/stores/assistantStore.ts';

const configured = { enabled:true, provider:'openai', model:'gpt-4.1-mini', updated_at:'2026-09-30T12:00:00Z' };
const response = { state:'completed', provider:'openai', model:'gpt-4.1-mini', created_at:'2026-09-30T12:01:00Z' };
const saved = { installed:true,ready:true,connected:true,models:[] };
assert.equal(assistantConnection(null).active,false);
assert.equal(assistantConnection({...saved,connected:false}).label,'Sin API configurada');
assert.equal(assistantConnection(saved).active,false);
assert.equal(assistantConnection({...saved,ready:false}).active,false);
const proof=assistantVerification(configured,response);
assert.equal(proof.verifiedAt,response.created_at);
assert.equal(assistantConnection({...saved,verification:proof}).active,true);
assert.equal(assistantConnection({...saved,verification:proof},true).active,false);
assert.equal(assistantConnection({...saved,verification:{...proof,verifiedAt:'invalid'}}).active,false);
for(const state of ['uncertain','reserved']) {
  const verification=assistantVerification(configured,{...response,state});
  assert.equal(verification.verifiedAt,null);
  assert.equal(assistantConnection({...saved,verification}).active,false);
}
for(const account of [{...configured,enabled:false},{...configured,provider:'anthropic'},{...configured,model:'another'},{...configured,updated_at:'2026-10-13T12:00:00Z'}]) assert.equal(assistantVerification(account,response),null);
assert.equal(assistantVerification(configured,null),null);
assert.equal(assistantVerification(configured,{...response,created_at:'invalid'}),null);
// Evidence does not expire merely because the usage month rolls over.
assert.equal(assistantConnection({...saved,verification:proof}).active,true);
useAssistantStore.setState({connectionOwner:'owner-a',connectionStatus:{...saved,verification:proof},connectionError:false});
useAssistantStore.getState().resetScope('owner-a:company-1','owner-a');
assert.equal(useAssistantStore.getState().connectionStatus.verification.verifiedAt,response.created_at);
useAssistantStore.getState().resetScope('owner-a:company-2','owner-a');
assert.equal(useAssistantStore.getState().connectionOwner,'owner-a');
useAssistantStore.getState().resetScope('owner-b:company-1','owner-b');
assert.equal(useAssistantStore.getState().connectionOwner,null);
assert.equal(useAssistantStore.getState().connectionStatus,null);
console.log('Estado de API: guardada no implica verificada; cambios de clave/modelo y fallos vuelven a azul; evidencia aislada por usuario. Sin consultas de proveedor.');
