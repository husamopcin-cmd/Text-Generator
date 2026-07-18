const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'cinocode_chat.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');
const coach = fs.readFileSync(path.join(root, 'assets', 'js', 'sinavkocu.js'), 'utf8');
const authCore = fs.readFileSync(path.join(root, 'assets', 'js', 'auth-core.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'css', 'main.css'), 'utf8');

function countId(id) {
  return (html.match(new RegExp(`id=["']${id}["']`, 'g')) || []).length;
}

function getButton(id) {
  const match = html.match(new RegExp(`<button[^>]*id=["']${id}["'][^>]*>[\\s\\S]*?<\\/button>`));
  assert.ok(match, `Missing button: ${id}`);
  return match[0];
}

test('sidebar studio grid exposes exactly four stable actions', () => {
  const section = html.match(/<details id="sidebarStudiosDetails"[\s\S]*?<\/details>/);
  assert.ok(section, 'Missing sidebar studios section');
  const grid = section[0].match(/<div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">([\s\S]*?)<\/div>/);
  assert.ok(grid, 'Missing sidebar studios grid');

  const expectedIds = [
    'sidebarImageStudioBtn',
    'sidebarVideoStudioBtn',
    'sidebarGameStudioBtn',
    'sidebarDocStudioBtn'
  ];
  for (const id of expectedIds) {
    assert.match(grid[1], new RegExp(`id=["']${id}["']`));
    assert.equal(countId(id), 1, `${id} must be unique`);
  }
});

test('existing studio handlers remain unchanged and document upload is wired', () => {
  assert.match(getButton('sidebarImageStudioBtn'), /onclick="setAppMode\('image'\); triggerImageGeneration\(\);"/);
  assert.match(getButton('sidebarVideoStudioBtn'), /onclick="setAppMode\('video'\); triggerVideoGeneration\(\);"/);
  assert.match(getButton('sidebarGameStudioBtn'), /onclick="setAppMode\('game'\); triggerGameGeneration\(\);"/);
  assert.match(getButton('sidebarDocStudioBtn'), /onclick="closeMobileSidebar\(\); triggerFileInput\('docUpload'\)"/);
  assert.match(main, /function closeMobileSidebar\(\)/);
  assert.match(getButton('sidebarDocStudioBtn'), />Belge<\/span>/);
});

test('mobile collapse keeps studios discoverable while collapsing the secondary library', () => {
  const functionMatch = html.match(/function applySidebarMobileCollapse\(\) \{\r?\n[\s\S]*?^        \}/m);
  assert.ok(functionMatch, 'Missing mobile sidebar collapse function');

  function runAtWidth(width) {
    function createDetail() {
      let isOpen = true;
      return {
        removeAttribute(name) {
          if (name === 'open') isOpen = false;
        },
        setAttribute(name) {
          if (name === 'open') isOpen = true;
        },
        get open() {
          return isOpen;
        }
      };
    }

    const details = {
      sidebarLibraryDetails: createDetail(),
      sidebarStudiosDetails: createDetail()
    };
    vm.runInNewContext(`${functionMatch[0]}\napplySidebarMobileCollapse();`, {
      window: { innerWidth: width },
      document: { getElementById: id => details[id] }
    });
    return details;
  }

  for (const width of [375, 390, 768]) {
    const details = runAtWidth(width);
    assert.equal(details.sidebarLibraryDetails.open, false, `library should collapse at ${width}px`);
    assert.equal(details.sidebarStudiosDetails.open, true, `studios should stay open at ${width}px`);
  }

  const desktopDetails = runAtWidth(769);
  assert.equal(desktopDetails.sidebarLibraryDetails.open, true);
  assert.equal(desktopDetails.sidebarStudiosDetails.open, true);
});

test('projects is a unique full-width action before existing app and skills actions', () => {
  assert.equal(countId('sidebarProjectsBtn'), 1);
  assert.equal(countId('sidebarMyAppsBtn'), 1);
  assert.equal(countId('sidebarSkillsBtn'), 1);
  assert.match(getButton('sidebarProjectsBtn'), /onclick="closeMobileSidebar\(\); openProjectsScreen\(\)"/);
  assert.match(getButton('sidebarProjectsBtn'), />Projeler<\/span>/);
  assert.ok(html.indexOf('id="sidebarProjectsBtn"') < html.indexOf('id="sidebarMyAppsBtn"'));
  assert.ok(html.indexOf('id="sidebarMyAppsBtn"') < html.indexOf('id="sidebarSkillsBtn"'));
  assert.match(main, /function openProjectsScreen\(\)/);
});

test('My Apps opens its hub without creating a disposable chat', () => {
  const button = getButton('sidebarMyAppsBtn');
  assert.match(button, /onclick="openMyAppsHub\(\);"/);
  assert.doesNotMatch(button, /createNewChat/);
  assert.match(main, /function openMyAppsHub\(\)/);
  assert.match(main, /document\.getElementById\('myAppsGrid'\)/);
  assert.match(main, /renderMyApps\(\)/);
});

test('project document upload uses the existing document picker and current project context', () => {
  assert.match(main, /function uploadDocumentToProject\(projectId\)/);
  assert.match(main, /triggerFileInput\('docUpload'\)/);
  assert.match(main, /createNewChat\(\{ projectId \}\)/);
  assert.match(main, /onclick="uploadDocumentToProject\('\$\{activeProjectId\}'\)"/);
  assert.doesNotMatch(main, /Dosya yükleme yakında eklenecek/);
  assert.doesNotMatch(main, /RAG entegrasyonu Faz 21\.2'de aktif olacak/);
  assert.match(main, /Belge aktif proje sohbetine eklenir ve analiz bağlamında kullanılır/);
});

test('skills screen labels preview and unavailable integrations honestly', () => {
  assert.match(html, /CinoVidyo[\s\S]*?● Önizleme/);
  assert.match(html, /● Entegrasyon gerekli/);
  assert.doesNotMatch(html, /● Yakında/);
  assert.match(html, /OAuth\/backend entegrasyonu gerekir/);
  assert.match(html, /launchCinoApp\('textgenerator'\)/);
});

test('contextual projects entry remains available in the attach menu', () => {
  assert.match(html, /onclick="closeAttachMenu\(\); openProjectsScreen\(\);"/);
});

test('startup profile flow uses the professional modal instead of native prompt', () => {
  assert.match(main, /window\.CinoCodeAuth.*getStoredUserName/);
  assert.match(main, /window\.CinoCodeAuth\.signOutAccountSession/);
  assert.match(main, /window\.CinoCodeAuth\.rememberLocalProfile/);
  assert.match(main, /window\.CinoCodeAuth\.openAccountAuthModal/);
  assert.match(main, /await window\.CinoCodeAuth\.initializeAccountSession\(\)/, 'startup must restore the Supabase session through auth-core');
  assert.match(main, /loggedUser = window\.CinoCodeAuth\.getStoredUserName\(\);/, 'loggedUser must be refreshed after session init');
  assert.doesNotMatch(main, /typeof initializeAccountSession === 'function'/, 'stale bare-global guard must not return');
});

test('cloud account form collects professional fields and delegates credentials to Supabase', () => {
  const auth = authCore.match(/function openAccountAuthModal\(initialMode\)[\s\S]*?setMode\(mode\);/);
  assert.ok(auth, 'Missing cloud account modal in auth-core.js');
  assert.match(auth[0], /Giriş Yap/);
  assert.match(auth[0], /Kayıt Ol/);
  for (const id of [
    'cloudAuthFirstName',
    'cloudAuthLastName',
    'cloudAuthAge',
    'cloudAuthEmail',
    'cloudAuthPassword',
    'cloudAuthPasswordConfirm',
    'cloudAuthGoogleBtn'
  ]) {
    assert.match(auth[0], new RegExp(`id="${id}"`));
  }
  assert.match(auth[0], /signInWithPassword/);
  assert.match(auth[0], /client\.auth\.signUp/);
  assert.match(auth[0], /signInWithOAuth/);
  assert.match(auth[0], /provider: 'google'/);
  assert.match(auth[0], /Şifren CinoCode koduna veya localStorage'a kaydedilmez/);
  assert.doesNotMatch(auth[0], /localStorage\.setItem\([^\n]*(password|parola|şifre)/i);
  assert.match(html, /@supabase\/supabase-js@2\.110\.5/);
  assert.match(html, /auth-core\.js/);
  assert.match(css, /\.cc-auth-google/);
  assert.match(css, /\.cc-auth-password-row/);
  assert.match(css, /\.cc-auth-backend-status/);
});

test('local profile remains a password-free fallback', () => {
  const auth = authCore.match(/function openLocalProfileSetupModal\(initialMode\)[\s\S]*?setMode\(mode\);/);
  assert.ok(auth, 'Missing local profile fallback in auth-core.js');
  assert.match(auth[0], /Bu sürüm yereldir/);
  assert.match(auth[0], /Şifre, e-posta doğrulaması ve bulut senkronizasyonu yoktur/);
  assert.doesNotMatch(auth[0], /type="password"/);
  assert.doesNotMatch(auth[0], /localStorage\.setItem\([^\n]*(password|parola|şifre)/i);
  assert.match(css, /\.cc-auth-overlay/);
  assert.match(css, /@media \(max-width: 520px\)/);
});

test('document picker supports bounded local ZIP analysis', () => {
  assert.match(html, /jszip@3\.10\.1/);
  assert.match(html, /id="docUpload"[^>]*\.zip/);
  assert.match(main, /DOCUMENT_UPLOAD_MAX_BYTES = 25 \* 1024 \* 1024/);
  assert.match(main, /DOCUMENT_CONTEXT_MAX_CHARS = 1000000/);
  assert.match(main, /ARCHIVE_MAX_FILES = 180/);
  assert.match(main, /ARCHIVE_ENTRY_MAX_BYTES = 1024 \* 1024/);
  assert.match(main, /ARCHIVE_TOTAL_MAX_BYTES = 20 \* 1024 \* 1024/);
  assert.match(main, /function isZipDocument\(file\)/);
  assert.match(main, /async function extractZipDocument\(file\)/);
  assert.match(main, /ARCHIVE_IGNORED_PATH/);
  assert.match(main, /ARCHIVE_SECRET_PATH/);
  assert.doesNotMatch(main, /Lütfen 5MB'dan küçük belgeler/);
});

test('document text sent to AI remains below the serverless payload ceiling', () => {
  assert.match(main, /getRemainingDocumentContextChars\(\)/);
  assert.match(main, /Belge bağlamı doldu/);
  assert.match(main, /join\("\\n"\)\.slice\(0, DOCUMENT_CONTEXT_MAX_CHARS\)/);
  assert.match(main, /İçerik güvenli bağlam sınırında kısaltıldı/);
});

test('full interface is the v2 default without overwriting explicit preferences', () => {
  assert.match(main, /return \{ version: 2, theme: "tam", visibility: \{ \.\.\.FZ19_THEME_PRESETS\.tam \}/);
  assert.match(main, /parsed\.theme \|\| "tam"/);
  assert.match(main, /Number\(parsed\.version\)[\s\S]*?!parsed\.lastUpdated[\s\S]*?parsed\.theme === "dengeli"/);
  assert.match(html, /<div[^>]*>Tam<\/div>[\s\S]*?Her şey açık<br>\(varsayılan\)/);
});

test('discovery tour covers the complete primary workflow', () => {
  const tour = main.match(/const FZ19_TOUR_STEPS = \[[\s\S]*?\n    \];/);
  assert.ok(tour, 'Missing discovery tour steps');
  const requiredTargets = [
    'sidebarImageStudioBtn',
    'sidebarVideoStudioBtn',
    'sidebarGameStudioBtn',
    'sidebarDocStudioBtn',
    'sidebarProjectsBtn',
    'sidebarMyAppsBtn',
    'sidebarSkillsBtn',
    'styleModeSelect',
    'personaSelect',
    'fz19AttachBtn',
    'webSearchBtn',
    'micBtn',
    'speakerBtn',
    'voiceControlsContainer',
    'userProfile',
    'settingsBtn'
  ];
  for (const target of requiredTargets) assert.match(tour[0], new RegExp(`target: '${target}'`));
  assert.equal(countId('settingsBtn'), 1);
});
