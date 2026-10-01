import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseActivationLink } from '../src/security/activationLink.ts';

for (const type of ['invite', 'recovery']) {
  const link = parseActivationLink('?activar=1', `#type=${type}&token_hash=test-only`);
  assert.equal(link.type, type);
  assert.equal(link.tokenHash, 'test-only');
  assert.equal(link.hasSession, false);
  assert.equal(link.isActivation, true);
  const legacy = parseActivationLink('', `#type=${type}&access_token=test&refresh_token=test-refresh`);
  assert.equal(legacy.hasSession, true);
}
assert.equal(parseActivationLink('', '#error_code=otp_expired').isActivation, true);
assert.equal(parseActivationLink('', '').isActivation, false);
assert.equal(parseActivationLink('', '#type=signup&token_hash=test').tokenHash, null);
assert.equal(parseActivationLink('', '#type=invite&access_token=test').hasSession, false);
for (const type of ['invite', 'recovery']) {
  const template = readFileSync(`supabase/templates/${type}.html`, 'utf8');
  assert.ok(template.includes(`#token_hash={{ .TokenHash }}&amp;type=${type}`));
  assert.ok(!template.includes('.ConfirmationURL'));
}
console.log('PASS activation links: explicit verification, legacy sessions, expired/invalid links and both email templates.');
