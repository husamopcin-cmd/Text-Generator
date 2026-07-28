const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Regression coverage for the guest (misafir) chat bug: a failed/cancelled
// Turnstile challenge used to be swallowed by the generic network-error
// handler inside the model fallback loop, which then silently retried the
// NEXT provider — re-opening a brand new Turnstile popup each time, without
// the user ever pressing anything. This made the verification overlay look
// like it kept flashing and cancelling itself, and the assistant never
// replied. The fix tags every requestGuestSession() failure with
// `guestAccessError = true` so the send loop can stop immediately instead of
// hammering the challenge once per fallback provider.

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');

function extractFunction(startPattern, endPattern) {
  const start = main.search(startPattern);
  assert.notEqual(start, -1, `Missing function start: ${startPattern}`);
  const tail = main.slice(start);
  const end = tail.search(endPattern);
  assert.notEqual(end, -1, `Missing function end: ${endPattern}`);
  return tail.slice(0, end);
}

const requestGuestSessionSrc = extractFunction(
  /async function requestGuestSession\(\)/,
  /\n\s*async function getGuestSession\(\)/
);

test('a failed or timed-out Turnstile script is removed so retry performs a fresh load', () => {
  const loaderSrc = extractFunction(
    /function loadTurnstileClient\(\)/,
    /\n\s*async function runTurnstileChallenge\(siteKey\)/
  );

  assert.match(loaderSrc, /if \(!window\.turnstile && script && script\.parentNode\) script\.remove\(\)/);
  assert.match(loaderSrc, /script\.addEventListener\('error', \(\) => fail\(/);
  assert.match(loaderSrc, /setTimeout\(\(\) => fail\(/);
  assert.match(loaderSrc, /turnstileLoaderPromise = null/);
});

function makeContext({ config, turnstileImpl, fetchImpl }) {
  const context = {
    window: {
      CinoCodeAuth: {
        loadCloudAuthConfig: async () => config
      }
    },
    createAccessDeviceId: () => 'device_1234567890abcdef',
    runTurnstileChallenge: turnstileImpl || (async () => { throw new Error('runTurnstileChallenge should not be called'); }),
    fetch: fetchImpl || (async () => { throw new Error('fetch should not be called'); }),
    sessionStorage: { setItem() {} },
    GUEST_SESSION_STORAGE_KEY: 'cinocode_guest_session_v1',
    JSON,
    Date,
    Number
  };
  vm.createContext(context);
  vm.runInContext(requestGuestSessionSrc, context);
  return context;
}

test('requestGuestSession tags a cancelled/failed Turnstile challenge with guestAccessError', async () => {
  const ctx = makeContext({
    config: { guestAccessConfigured: true, turnstileSiteKey: 'sitekey123', isLocalDev: false },
    turnstileImpl: async () => { throw new Error('Güvenlik doğrulaması iptal edildi.'); }
  });

  await assert.rejects(
    vm.runInContext('requestGuestSession()', ctx),
    error => {
      assert.equal(error.guestAccessError, true, 'error must be tagged so the send loop can stop instead of retrying');
      assert.equal(error.message, 'Güvenlik doğrulaması iptal edildi.');
      return true;
    }
  );
});

test('requestGuestSession tags a missing/unconfigured guest access setup', async () => {
  const ctx = makeContext({ config: { guestAccessConfigured: false } });

  await assert.rejects(
    vm.runInContext('requestGuestSession()', ctx),
    error => {
      assert.equal(error.guestAccessError, true);
      assert.match(error.message, /Misafir erişimi henüz yapılandırılmadı/);
      return true;
    }
  );
});

test('requestGuestSession tags a rejected guest-session server response', async () => {
  const ctx = makeContext({
    config: { guestAccessConfigured: true, turnstileSiteKey: 'sitekey123', isLocalDev: false },
    turnstileImpl: async () => 'valid-turnstile-token',
    fetchImpl: async () => ({ ok: false, json: async () => ({ ok: false, error: 'turnstile_verification_failed' }) })
  });

  await assert.rejects(
    vm.runInContext('requestGuestSession()', ctx),
    error => {
      assert.equal(error.guestAccessError, true);
      assert.match(error.message, /Misafir oturumu açılamadı/);
      return true;
    }
  );
});

test('requestGuestSession does NOT tag a successful session, and never rejects', async () => {
  const ctx = makeContext({
    config: { guestAccessConfigured: true, turnstileSiteKey: 'sitekey123', isLocalDev: false },
    turnstileImpl: async () => 'valid-turnstile-token',
    fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, guestToken: 'gt_abc', expiresIn: 600 }) })
  });

  const session = await vm.runInContext('requestGuestSession()', ctx);
  assert.equal(session.token, 'gt_abc');
});

test('the model fallback loop stops on the first guestAccessError instead of retrying every provider', () => {
  const loopSrc = main.slice(main.search(/for \(let i = 0; i < fallbackQueue\.length; i\+\+\) \{/));
  const catchStart = loopSrc.search(/\} catch \(fetchErr\) \{/);
  assert.notEqual(catchStart, -1, 'fallback loop catch block must exist');
  const catchBody = loopSrc.slice(catchStart, catchStart + 1200);

  const guestCheckIdx = catchBody.search(/if \(fetchErr\.guestAccessError\) \{/);
  assert.notEqual(guestCheckIdx, -1, 'catch block must special-case guestAccessError');

  const rethrowSnippet = catchBody.slice(guestCheckIdx, guestCheckIdx + 400);
  assert.match(rethrowSnippet, /throw fetchErr;/, 'a guest-access failure must throw (stop), never continue the provider loop');

  const continueIdx = catchBody.indexOf('continue;');
  assert.ok(continueIdx === -1 || continueIdx > guestCheckIdx, 'the generic per-provider continue must come after the guestAccessError short-circuit');
});

test('the final error card gives guest-access failures a dedicated explanation and a working retry action', () => {
  const catchSrc = main.slice(main.search(/const isGuestAccess = Boolean\(error && error\.guestAccessError\);/));
  const snippet = catchSrc.slice(0, 2000);

  assert.match(snippet, /isGuestAccess\s*\n?\s*\?\s*"Kısa güvenlik doğrulaması/, 'guest-access failures must not be shown as a generic connection error');
  assert.match(snippet, /regenerateMessage\(\)/, 'retry button must reuse the existing resend flow so the original message is actually resent');
  assert.match(snippet, /clearGuestSession/, 'retry must clear the stale/failed guest session before resending');
});

// A second, more severe bug was found while manually reproducing the guest
// bug live in the browser: sendMessage's outer catch writes the error card
// into the bot bubble but historically never cleared that bubble's
// `data-typing-indicator="1"` marker. The `finally` block always runs
// cleanupGenerationUi() -> clearTransientTypingIndicators(), which treats any
// element still carrying that marker as a stale "still loading" bubble and
// deletes the WHOLE bubble outright (see the `bubble.remove()` branch around
// line 7551). So the error card was written and then deleted within the same
// synchronous tick — the user saw nothing at all, not even a wrong message,
// which matches the original report ("nothing on screen, AI never answers,
// nothing I can click"). Confirmed live with a MutationObserver in a real
// page load: before the fix the bot bubble was removed immediately after
// being created; after the fix it survives with the guest-access explanation
// and retry button intact.
test('both outer-catch branches clear the typing-indicator marker before/while writing their final content, so cleanupGenerationUi cannot delete the error card it just wrote', () => {
  const catchSrc = main.slice(main.search(/\} catch \(error\) \{\s*console\.error\('sendMessage error:'/));
  const catchBody = catchSrc.slice(0, 3200);

  // Branch 1: user-requested stop ("Yanıt durduruldu.")
  const stoppedBranch = catchBody.slice(0, catchBody.indexOf('} else {'));
  assert.match(stoppedBranch, /removeAttribute\('data-typing-indicator'\)/, 'the stopped-generation branch must clear the typing marker before writing its message');
  const stoppedRemoveIdx = stoppedBranch.indexOf("removeAttribute('data-typing-indicator')");
  const stoppedWriteIdx = stoppedBranch.indexOf('innerHTML = "<i>Yanıt durduruldu.</i>"');
  assert.ok(stoppedRemoveIdx !== -1 && stoppedWriteIdx !== -1 && stoppedRemoveIdx < stoppedWriteIdx, 'marker must be cleared before the stop message is written');

  // Branch 2: every other error (network, timeout, config, guest-access...)
  const genericBranch = catchBody.slice(catchBody.indexOf('} else {'));
  assert.match(genericBranch, /removeAttribute\('data-typing-indicator'\)/, 'the generic error branch must clear the typing marker before writing the error card');
  const genericRemoveIdx = genericBranch.indexOf("removeAttribute('data-typing-indicator')");
  const genericWriteIdx = genericBranch.indexOf('chat-generation-error');
  assert.ok(genericRemoveIdx !== -1 && genericWriteIdx !== -1 && genericRemoveIdx < genericWriteIdx, 'marker must be cleared before the error card HTML is written');
});

test('clearTransientTypingIndicators would in fact delete a bubble that still carries the typing marker (documents why the fix above is load-bearing)', () => {
  const start = main.search(/function clearTransientTypingIndicators\(\)/);
  const body = main.slice(start, start + 1300);
  assert.match(body, /'\[data-typing-indicator="1"\]'/);
  assert.match(body, /bubble\.remove\(\)/, 'a bubble whose typing marker is still set gets removed wholesale, error content and all');
});
