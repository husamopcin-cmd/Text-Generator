const { test, expect } = require('@playwright/test');
const { startStaticServer, stopStaticServer } = require('./static-server');

let staticServer;

test.beforeAll(async () => {
    staticServer = await startStaticServer();
});

test.afterAll(async () => {
    if (staticServer) await stopStaticServer(staticServer);
});

async function prepareApp(page) {
    await page.addInitScript(() => {
        localStorage.setItem('cinocode_user', 'E2E Kullanıcı');
        localStorage.setItem('cinocode_auth_mode', 'local');
        localStorage.setItem('fz19_tour_seen', '1');
        if (localStorage.getItem('fz19_tts_speed') === null) localStorage.setItem('fz19_tts_speed', '1');
    });
    await page.route('**/.netlify/functions/auth-config', route => route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, configured: false })
    }));
    await page.route('**/.netlify/functions/ai-chat', async route => {
        const body = route.request().postDataJSON();
        await route.fulfill({
            status: 200, contentType: 'application/json',
            body: JSON.stringify({
                ok: true,
                provider: 'e2e-mock',
                model: 'e2e-mock',
                content: body && body.maxTokens === 20 ? 'E2E Akıllı Başlık' : 'E2E yanıtı başarıyla geldi.',
                finish_reason: 'stop'
            })
        });
    });
    await page.route('http://127.0.0.1:11434/**', route => route.fulfill({
        status: 503, contentType: 'application/json', body: '{}'
    }));

    const cdnStubs = [
        // Simulate a partial CDN load: the app must install its safe fallback.
        ['**/marked.min.js', 'window.marked={parse:(value)=>String(value),setOptions:()=>{}};'],
        ['**/highlight.min.js', 'window.hljs={highlightElement:()=>{},highlightAll:()=>{}};'],
        ['**/pdf.min.js', 'window.pdfjsLib={GlobalWorkerOptions:{}};'],
        ['**/mammoth.browser.min.js', 'window.mammoth={extractRawText:async()=>({value:""})};'],
        ['**/xlsx.full.min.js', 'window.XLSX={};'],
        ['**/jszip.min.js', 'window.JSZip=function(){};'],
        ['**/supabase-js@*/**', 'window.supabase={};']
    ];
    for (const [pattern, body] of cdnStubs) {
        await page.route(pattern, route => route.fulfill({ status: 200, contentType: 'application/javascript', body }));
    }
    await page.route('**/tokyo-night-dark.min.css', route => route.fulfill({
        status: 200, contentType: 'text/css', body: ''
    }));

    await page.goto('/cinocode_chat.html');
    await expect(page.locator('#userInput')).toBeVisible();
    await expect(page.locator('#loggedInUser')).toHaveText('E2E Kullanıcı');
    await expect(page.locator('#chatList .chat-item')).toHaveCount(1);
}

const runtimeErrors = new WeakMap();

test.beforeEach(async ({ page }) => {
    const errors = [];
    runtimeErrors.set(page, errors);
    page.on('pageerror', error => errors.push(error.message));
    await prepareApp(page);
});

test.afterEach(async ({ page }) => {
    expect(runtimeErrors.get(page) || []).toEqual([]);
});

test('uygulama kabuğu ve yerel profil açılır', async ({ page }) => {
    await expect(page.locator('.header-title')).toContainText('CinoCode');
    await expect(page.locator('#sendBtn')).toBeVisible();
});

test('yeni sohbet geçmişe yeni kayıt ekler', async ({ page, isMobile }) => {
    if (isMobile) await page.locator('#sidebarHamburgerBtn').click();
    const rows = page.locator('#chatList .chat-item');
    const before = await rows.count();
    await page.getByRole('button', { name: /Yeni Sohbet/ }).first().click();
    await expect(rows).toHaveCount(before + 1);
});

test('mock bulut yanıtı ve akıllı başlık çalışır', async ({ page }) => {
    await page.locator('#speakerBtn').click();
    await page.locator('#userInput').fill('Playwright ile akıllı sohbet testi');
    await page.locator('#sendBtn').click();
    await expect(page.locator('#messages')).toContainText('E2E yanıtı başarıyla geldi.');
    await expect(page.locator('#chatList')).toContainText('E2E Akıllı Başlık');
});

test('ayarlar dokuz sesi gösterir ve TTS hızı korunur', async ({ page }) => {
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settingsMenu')).toBeVisible();
    await expect(page.locator('#voiceNameEditorList > div')).toHaveCount(9);
    await page.locator('#fz19TtsSpeedSlider').evaluate(element => {
        element.value = '3.5';
        element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(page.locator('#fz19TtsSpeedLabel')).toHaveText('3.5x');
    await page.reload();
    await expect(page.locator('#fz19TtsSpeedSlider')).toHaveValue('3.5');
    await expect(page.locator('#fz19TtsSpeedLabel')).toHaveText('3.5x');
});

test('Projeler ve My Apps merkezleri açılır', async ({ page, isMobile }) => {
    if (isMobile) await page.locator('#sidebarHamburgerBtn').click();
    await page.locator('#sidebarProjectsBtn').click();
    await expect(page.locator('#projectsScreen')).toBeVisible();
    await expect(page.locator('#projectsScreenTitle')).toContainText('Projeler');
    if (isMobile) await page.locator('#sidebarHamburgerBtn').click();
    await page.locator('#sidebarMyAppsBtn').click();
    await expect(page.locator('#myAppsGrid .new-project-card')).toHaveCount(8);
});

test('belge girişi Office, ZIP ve çoklu dosyayı destekler', async ({ page }) => {
    const input = page.locator('#docUpload');
    await expect(input).toHaveAttribute('multiple', '');
    const accept = await input.getAttribute('accept');
    for (const extension of ['.docx', '.xlsx', '.pptx', '.zip']) expect(accept).toContain(extension);
});

test('hesap penceresi giriş ve yerel profil seçeneklerini sunar', async ({ page }) => {
    await page.evaluate(() => window.CinoCodeAuth.openAccountAuthModal('signin'));
    await expect(page.locator('#localAuthOverlay')).toBeVisible();
    await expect(page.locator('#localAuthSigninTab')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#cloudAuthGoogleBtn')).toBeVisible();
    await expect(page.locator('#localProfileFallbackBtn')).toBeVisible();
});

test('mobil görünümde Stüdyolar erişilebilir', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobil kabul ölçütü');
    await page.locator('#sidebarHamburgerBtn').click();
    await expect(page.locator('#sidebarStudiosDetails')).toBeVisible();
    for (const id of ['sidebarImageStudioBtn', 'sidebarVideoStudioBtn', 'sidebarGameStudioBtn', 'sidebarDocStudioBtn']) {
        await expect(page.locator(`#${id}`)).toBeVisible();
    }
});
