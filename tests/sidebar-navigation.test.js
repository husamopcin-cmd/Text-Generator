const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'cinocode_chat.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'assets', 'js', 'main.js'), 'utf8');

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
