/**
 * CinoCode — Document State Module (Phase 2D-1)
 *
 * Responsibility:
 *   Project-scoped document state management + CustomEvent lifecycle.
 *
 * NOT responsible for:
 *   PDF parsing, ZIP extraction, DOM rendering, chat payload assembly.
 *   Those remain in main.js until Phase 2D-2.
 *
 * Integration:
 *   Loaded AFTER projects.js and memory-core.js, BEFORE main.js.
 *   Exposes window.CinoCodeDocuments and extends window.CinoCodeState.
 */
(function () {
    'use strict';

    /* ──────────────────────────────────────────────
     *  STATE — initialise inside CinoCodeState
     * ────────────────────────────────────────────── */
    if (!window.CinoCodeState) window.CinoCodeState = {};

    window.CinoCodeState.documents = {
        /** { [projectId]: DocumentRecord[] } */
        byProject: {},
        /** Currently active project whose docs are surfaced */
        activeProjectId: null
    };

    const state = window.CinoCodeState.documents;

    /* ──────────────────────────────────────────────
     *  HELPERS
     * ────────────────────────────────────────────── */
    function _emit(eventName, detail) {
        window.dispatchEvent(new CustomEvent(eventName, { detail: detail || {} }));
    }

    function _ensureBucket(projectId) {
        if (!state.byProject[projectId]) {
            state.byProject[projectId] = [];
        }
        return state.byProject[projectId];
    }

    /* ──────────────────────────────────────────────
     *  PUBLIC API
     * ────────────────────────────────────────────── */

    /**
     * Add a document record to a project.
     * @param {string} projectId
     * @param {object} record  — must contain at least { id, name, rawType }
     * @returns {boolean} true if added
     */
    function addDocument(projectId, record) {
        if (!projectId || !record || !record.id) return false;
        const bucket = _ensureBucket(projectId);

        // Duplicate guard
        if (bucket.some(function (d) { return d.id === record.id; })) return false;

        bucket.push(record);
        _emit('cinocode:document-added', { projectId: projectId, document: record });
        _emit('cinocode:documents-changed', { projectId: projectId });
        return true;
    }

    /**
     * Remove a document from a project by document id.
     * @returns {boolean} true if removed
     */
    function removeDocument(projectId, docId) {
        if (!projectId || !docId) return false;
        var bucket = _ensureBucket(projectId);
        var idx = -1;
        for (var i = 0; i < bucket.length; i++) {
            if (bucket[i].id === docId) { idx = i; break; }
        }
        if (idx === -1) return false;
        var removed = bucket.splice(idx, 1)[0];
        _emit('cinocode:document-removed', { projectId: projectId, document: removed });
        _emit('cinocode:documents-changed', { projectId: projectId });
        return true;
    }

    /**
     * Return all documents for a project (empty array if none).
     */
    function getProjectDocuments(projectId) {
        return state.byProject[projectId] || [];
    }

    /**
     * Clear all documents for a project.
     */
    function clearProjectDocuments(projectId) {
        if (!projectId) return;
        state.byProject[projectId] = [];
        _emit('cinocode:document-cleared', { projectId: projectId });
        _emit('cinocode:documents-changed', { projectId: projectId });
    }

    /**
     * Switch the active project.  Emits documents-changed so the legacy
     * bridge (see below) reflects the new project's documents.
     */
    function setActiveProject(projectId) {
        var prev = state.activeProjectId;
        state.activeProjectId = projectId;
        _ensureBucket(projectId);
        if (prev !== projectId) {
            _emit('cinocode:documents-changed', { projectId: projectId });
        }
    }

    /* ──────────────────────────────────────────────
     *  LEGACY BRIDGE — window.selectedFiles ↔ state
     *
     *  Existing code (addSelectedFile, removeSelectedFile,
     *  sendMessage, renderFilePreviews) reads/writes
     *  window.selectedFiles.  We proxy that property so
     *  document-typed entries stay in sync with the new
     *  per-project store.  Non-document entries (images,
     *  audio, video) are kept in a separate ephemeral array
     *  so they still work exactly as before.
     * ────────────────────────────────────────────── */

    // Ephemeral array for non-document files (images, audio, video)
    var _ephemeralMedia = [];

    // Capture any documents already pushed before this module loaded
    if (Array.isArray(window.selectedFiles)) {
        _ephemeralMedia = window.selectedFiles.filter(function (f) {
            return f.rawType !== 'document';
        });
        // Seed active project bucket with pre-existing docs
        var pid = state.activeProjectId;
        if (pid) {
            window.selectedFiles.filter(function (f) { return f.rawType === 'document'; })
                .forEach(function (d) { addDocument(pid, d); });
        }
    }

    /**
     * Build combined view: ephemeral media + active project's documents.
     */
    function _buildSelectedFiles() {
        var docs = state.activeProjectId
            ? getProjectDocuments(state.activeProjectId)
            : [];
        return _ephemeralMedia.concat(docs);
    }

    Object.defineProperty(window, 'selectedFiles', {
        configurable: true,
        enumerable: true,

        get: function () {
            return _buildSelectedFiles();
        },

        set: function (val) {
            if (!Array.isArray(val)) { val = []; }
            // Update ephemeral media
            _ephemeralMedia = val.filter(function (f) { return f.rawType !== 'document'; });

            // Sync documents into active project
            var pid = state.activeProjectId;
            if (pid) {
                var newDocs = val.filter(function (f) { return f.rawType === 'document'; });
                state.byProject[pid] = newDocs;
                _emit('cinocode:documents-changed', { projectId: pid });
            }
        }
    });

    /* ──────────────────────────────────────────────
     *  REACT TO PROJECT CHANGE
     * ────────────────────────────────────────────── */
    window.addEventListener('cinocode:project-selected', function (e) {
        var detail = e.detail || {};
        var newId = detail.projectId || detail.id;
        if (newId) setActiveProject(newId);
    });

    // Legacy: main.js currently emits 'cinocode:projectChanged'
    window.addEventListener('cinocode:projectChanged', function () {
        var currentId = window.CinoCodeState && window.CinoCodeState.project
            ? window.CinoCodeState.project.activeProjectId
            : null;
        if (currentId) setActiveProject(currentId);
    });

    
    /* ──────────────────────────────────────────────
     *  PHASE 2D-2: DOCUMENT PARSING
     * ────────────────────────────────────────────── */

    const DOCUMENT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
    const DOCUMENT_CONTEXT_MAX_CHARS = 1000000;
    const ARCHIVE_MAX_FILES = 180;
    const ARCHIVE_ENTRY_MAX_BYTES = 1024 * 1024;
    const ARCHIVE_TOTAL_MAX_BYTES = 20 * 1024 * 1024;
    const ARCHIVE_TEXT_EXTENSIONS = ['.txt', '.md', '.js', '.jsx', '.ts', '.tsx', '.py', '.html', '.css', '.scss', '.json', '.csv', '.xml', '.yml', '.yaml', '.sql', '.java', '.c', '.h', '.cpp', '.cs', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.sh', '.ps1', '.toml', '.ini', '.cfg'];
    const OFFICE_XLSX_MAX_SHEETS = 20;
    const OFFICE_XLSX_SHEET_MAX_CHARS = 200000;
    const OFFICE_PPTX_MAX_SLIDES = 100;
    const OFFICE_PPTX_SLIDE_MAX_CHARS = 20000;
    const ARCHIVE_IGNORED_PATH = /(^|\/)(node_modules|\.git|dist|build|coverage|\.next|vendor|__MACOSX)(\/|$)/i;
    const ARCHIVE_SECRET_PATH = /(^|\/)(\.env(?:\.|$)|id_rsa(?:\.|$)|[^/]+\.(?:pem|key|p12|pfx))(\/|$)?/i;

    function showNonBlockingToast(msg, type) {
        if (typeof window.showNonBlockingToast === 'function') {
            window.showNonBlockingToast(msg, type);
        } else {
            console.log('Toast:', msg);
        }
    }


function getRemainingDocumentContextChars() {
        const used = (window.selectedFiles || [])
            .filter(file => file.rawType === 'document')
            .reduce((total, file) => total + String(file.content || '').length, 0);
        return Math.max(0, DOCUMENT_CONTEXT_MAX_CHARS - used);
    }

    function addDocumentTextFile(file, extractedText, meta = {}) {
        const text = String(extractedText || '').replace(/\u0000/g, '').trim();
        if (!text) {
            showNonBlockingToast(`"${file.name}" içinde okunabilir metin bulunamadı.`);
            return false;
        }

        const prefix = `\n[${file.name} İÇERİĞİ]:\n`;
        const suffix = '\n';
        const remaining = getRemainingDocumentContextChars();
        const available = Math.max(0, remaining - prefix.length - suffix.length - 60);
        if (!available) {
            showNonBlockingToast('Belge bağlamı doldu. Önce mevcut belgeyi gönderin veya kaldırın.');
            return false;
        }

        const wasTruncated = text.length > available;
        const truncationNote = wasTruncated ? '\n[İçerik güvenli bağlam sınırında kısaltıldı.]' : '';
        addDocument(state.activeProjectId, {
            id: 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11),
            name: file.name,
            type: file.type || meta.type || 'text/plain',
            size: file.size,
            content: prefix + text.slice(0, available) + truncationNote + suffix,
            rawType: 'document',
            sourceType: meta.sourceType || 'document'
        });
        if (wasTruncated) showNonBlockingToast(`"${file.name}" yüklendi; metin AI bağlam sınırına göre kısaltıldı.`);
        return true;
    }

    function isZipDocument(file) {
        const type = String(file.type || '').toLowerCase();
        return type === 'application/zip' || type === 'application/x-zip-compressed' || String(file.name || '').toLowerCase().endsWith('.zip');
    }

    function isSafeArchiveTextPath(path) {
        const normalized = String(path || '').replace(/\\/g, '/');
        if (!normalized || ARCHIVE_IGNORED_PATH.test(normalized) || ARCHIVE_SECRET_PATH.test(normalized)) return false;
        const lower = normalized.toLowerCase();
        return ARCHIVE_TEXT_EXTENSIONS.some(extension => lower.endsWith(extension));
    }

    async function extractZipDocument(file) {
        if (typeof window.JSZip === 'undefined') {
            showNonBlockingToast('ZIP okuyucu yüklenemedi. İnternet bağlantısını kontrol edin.');
            return false;
        }

        const archive = await window.JSZip.loadAsync(file);
        const allEntries = Object.values(archive.files || {}).filter(entry => entry && !entry.dir);
        const candidates = allEntries.filter(entry => isSafeArchiveTextPath(entry.name)).slice(0, ARCHIVE_MAX_FILES);
        const sections = [];
        let included = 0;
        let skipped = allEntries.length - candidates.length;
        let expandedBytes = 0;
        let collectedChars = 0;
        const availableChars = Math.max(0, getRemainingDocumentContextChars() - file.name.length - 80);

        for (const entry of candidates) {
            const declaredBytes = Number(entry && entry._data && entry._data.uncompressedSize) || 0;
            if (declaredBytes > ARCHIVE_ENTRY_MAX_BYTES || expandedBytes + declaredBytes > ARCHIVE_TOTAL_MAX_BYTES) {
                skipped++;
                continue;
            }
            const text = String(await entry.async('string')).replace(/\u0000/g, '').trim();
            const measuredBytes = declaredBytes || new Blob([text]).size;
            if (!text || measuredBytes > ARCHIVE_ENTRY_MAX_BYTES || expandedBytes + measuredBytes > ARCHIVE_TOTAL_MAX_BYTES) {
                skipped++;
                continue;
            }
            const header = `\n--- ${entry.name} ---\n`;
            const room = Math.max(0, availableChars - collectedChars - header.length);
            if (!room) break;
            const sectionText = text.slice(0, room);
            sections.push(header + sectionText);
            collectedChars += header.length + sectionText.length;
            expandedBytes += measuredBytes;
            included++;
            if (sectionText.length < text.length) break;
        }

        if (!sections.length) {
            showNonBlockingToast(`"${file.name}" içinde desteklenen ve güvenli bir metin/kod dosyası bulunamadı.`);
            return false;
        }

        const added = addDocumentTextFile(file, sections.join('\n'), { sourceType: 'zip', type: 'application/zip' });
        if (added) showNonBlockingToast(`ZIP hazır: ${included} dosya eklendi${skipped ? `, ${skipped} dosya atlandı` : ''}.`);
        return added;
    }

    function decodeOfficeXmlEntities(value) {
        return String(value || '')
            .replace(/&#x([0-9a-f]+);/gi, (m, hex) => { const code = parseInt(hex, 16); return Number.isFinite(code) && code >= 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : ''; })
            .replace(/&#(\d+);/g, (m, dec) => { const code = parseInt(dec, 10); return Number.isFinite(code) && code >= 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : ''; })
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&');
    }

    function extractPptxSlideText(xml) {
        const paragraphs = String(xml || '').split(/<\/a:p>/);
        const lines = [];
        for (const paragraph of paragraphs) {
            const runs = [];
            const runPattern = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
            let match;
            while ((match = runPattern.exec(paragraph)) !== null) {
                runs.push(decodeOfficeXmlEntities(match[1]));
            }
            const line = runs.join('').replace(/\u0000/g, '').trim();
            if (line) lines.push(line);
        }
        return lines.join('\n').trim();
    }

    function collectXlsxSections(workbook, availableChars) {
        const allNames = (workbook && workbook.SheetNames) || [];
        const names = allNames.slice(0, OFFICE_XLSX_MAX_SHEETS);
        const sections = [];
        let collectedChars = 0;
        let included = 0;
        for (const name of names) {
            const sheet = workbook.Sheets ? workbook.Sheets[name] : null;
            if (!sheet) continue;
            const csv = String(window.XLSX.utils.sheet_to_csv(sheet, { blankrows: false }) || '')
                .replace(/\u0000/g, '').trim().slice(0, OFFICE_XLSX_SHEET_MAX_CHARS);
            if (!csv) continue;
            const header = `\n--- Sayfa: ${name} ---\n`;
            const room = Math.max(0, availableChars - collectedChars - header.length);
            if (!room) break;
            const body = csv.slice(0, room);
            sections.push(header + body);
            collectedChars += header.length + body.length;
            included++;
            if (body.length < csv.length) break;
        }
        return { sections, included, totalSheets: allNames.length };
    }

    async function extractXlsxDocument(file) {
        if (typeof window.XLSX === 'undefined') {
            showNonBlockingToast('Excel okuyucu yüklenemedi. İnternet bağlantısını kontrol edin.');
            return false;
        }

        const arrayBuffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
        const availableChars = Math.max(0, getRemainingDocumentContextChars() - file.name.length - 80);
        const { sections, included, totalSheets } = collectXlsxSections(workbook, availableChars);

        if (!sections.length) {
            showNonBlockingToast(`"${file.name}" içinde okunabilir tablo verisi bulunamadı.`);
            return false;
        }

        const added = addDocumentTextFile(file, sections.join('\n'), { sourceType: 'xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        if (added) {
            const skipped = Math.max(0, totalSheets - included);
            showNonBlockingToast(`Excel hazır: ${included} sayfa eklendi${skipped ? `, ${skipped} sayfa atlandı` : ''}.`);
        }
        return added;
    }

    async function extractPptxDocument(file) {
        if (typeof window.JSZip === 'undefined') {
            showNonBlockingToast('Sunum okuyucu yüklenemedi. İnternet bağlantısını kontrol edin.');
            return false;
        }

        const archive = await window.JSZip.loadAsync(file);
        const slideNumberOf = (entryName) => parseInt((entryName.match(/slide(\d+)\.xml$/i) || [])[1], 10) || 0;
        const slideEntries = Object.values(archive.files || {})
            .filter(entry => entry && !entry.dir && /^ppt\/slides\/slide\d+\.xml$/i.test(String(entry.name || '').replace(/\\/g, '/')))
            .sort((a, b) => slideNumberOf(a.name) - slideNumberOf(b.name))
            .slice(0, OFFICE_PPTX_MAX_SLIDES);
        const sections = [];
        let collectedChars = 0;
        let included = 0;
        const availableChars = Math.max(0, getRemainingDocumentContextChars() - file.name.length - 80);

        for (const entry of slideEntries) {
            const xml = await entry.async('string');
            const text = extractPptxSlideText(xml).slice(0, OFFICE_PPTX_SLIDE_MAX_CHARS);
            if (!text) continue;
            const header = `\n--- Slayt ${slideNumberOf(entry.name)} ---\n`;
            const room = Math.max(0, availableChars - collectedChars - header.length);
            if (!room) break;
            const body = text.slice(0, room);
            sections.push(header + body);
            collectedChars += header.length + body.length;
            included++;
            if (body.length < text.length) break;
        }

        if (!sections.length) {
            showNonBlockingToast(`"${file.name}" slaytlarında okunabilir metin bulunamadı.`);
            return false;
        }

        const added = addDocumentTextFile(file, sections.join('\n'), { sourceType: 'pptx', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
        if (added) {
            const skipped = slideEntries.length - included;
            showNonBlockingToast(`Sunum hazır: ${included} slayt eklendi${skipped > 0 ? `, ${skipped} slayt atlandı` : ''}.`);
        }
        return added;
    }

    const DOC_PROCESSING_TIMEOUT_MS = 20000;
    const DOC_TIMEOUT_MARKER = 'DOC_PROCESSING_TIMEOUT';

    function withDocTimeout(promise, timeoutMs = DOC_PROCESSING_TIMEOUT_MS) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(DOC_TIMEOUT_MARKER)), timeoutMs);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    }

    function docErrorMessage(fileName, err, fallbackMessage) {
        if (err && err.message === DOC_TIMEOUT_MARKER) {
            return `"${fileName}" işlenmesi beklenenden çok uzun sürdü ve durduruldu. Dosya çok büyük/karmaşık olabilir; tekrar deneyin veya daha küçük bir dosya kullanın.`;
        }
        return fallbackMessage;
    }

    
    async function parseAndAddDocument(projectId, file) {
        if (!projectId) return false;
        
        // Ensure this projectId is active for context char checking (temporarily if needed)
        const prevActive = state.activeProjectId;
        if (state.activeProjectId !== projectId) {
            setActiveProject(projectId);
        }

            if (file.size > DOCUMENT_UPLOAD_MAX_BYTES) {
                showNonBlockingToast(`"${file.name}" çok büyük. En fazla 25 MB yükleyebilirsiniz.`);
                continue;
            }

            if (isXlsxDocument(file)) {
                try {
                    await withDocTimeout(extractXlsxDocument(file));
                } catch (err) {
                    console.error('XLSX okuma hatası:', err);
                    showNonBlockingToast(docErrorMessage(file.name, err, `"${file.name}" Excel dosyası olarak okunamadı.`));
                }
            } else if (isPptxDocument(file)) {
                try {
                    await withDocTimeout(extractPptxDocument(file));
                } catch (err) {
                    console.error('PPTX okuma hatası:', err);
                    showNonBlockingToast(docErrorMessage(file.name, err, `"${file.name}" sunum dosyası olarak okunamadı.`));
                }
            } else if (isZipDocument(file)) {
                try {
                    await withDocTimeout(extractZipDocument(file));
                } catch (err) {
                    console.error('ZIP okuma hatası:', err);
                    showNonBlockingToast(docErrorMessage(file.name, err, `"${file.name}" açılamadı veya geçerli bir ZIP değil.`));
                }
            } else if (file.type === "application/pdf") {
                try {
                    await withDocTimeout((async () => {
                        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
                            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
                        }
                        const arrayBuffer = await file.arrayBuffer();
                        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                        let fullText = "";

                        for (let p = 1; p <= Math.min(25, pdf.numPages); p++) {
                            const page = await pdf.getPage(p);
                            const textContent = await page.getTextContent();
                            const pageText = textContent.items.map(item => item.str).join(" ");
                            fullText += pageText + "\n";
                        }

                        addDocumentTextFile(file, fullText, { sourceType: 'pdf' });
                    })());
                } catch (err) {
                    console.error("PDF okuma hatası:", err);
                    showNonBlockingToast(docErrorMessage(file.name, err, `"${file.name}" PDF olarak okunamadı.`));
                }
            } else if (isPlainTextDocument(file)) {
                try {
                    const text = await withDocTimeout(file.text());
                    addDocumentTextFile(file, text, { sourceType: 'text' });
                } catch (err) {
                    console.error("Belge okuma hatası:", err);
                    showNonBlockingToast(docErrorMessage(file.name, err, `"${file.name}" metin olarak okunamadı.`));
                }
            } else if (isDocxDocument(file)) {
                try {
                    if (typeof mammoth === 'undefined') {
                        showNonBlockingToast("Word okuyucu yüklenemedi. İnternet bağlantısını kontrol edin.");
                        continue;
                    }
                    await withDocTimeout((async () => {
                        const arrayBuffer = await file.arrayBuffer();
                        const result = await mammoth.extractRawText({ arrayBuffer });
                        const text = (result && result.value || "").trim();
                        addDocumentTextFile(file, text, { sourceType: 'docx' });
                    })());
                } catch (err) {
                    console.error("DOCX okuma hatası:", err);
                    showNonBlockingToast(docErrorMessage(file.name, err, `"${file.name}" Word belgesi olarak okunamadı.`));
                }
            } else {
                showNonBlockingToast(`"${file.name}" desteklenmiyor. PDF, DOCX, XLSX, PPTX, ZIP veya metin/kod dosyası seçin.`);
            }
    
        if (prevActive && prevActive !== state.activeProjectId) {
            setActiveProject(prevActive);
        }
        return true;
    }

    function isDocxDocument(file) {
        if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
        return (file.name || '').toLowerCase().endsWith('.docx');
    }

    function isPlainTextDocument(file) {
        if (file.type && file.type.startsWith('text/')) return true;
        const plainTextExtensions = ARCHIVE_TEXT_EXTENSIONS;
        const name = (file.name || '').toLowerCase();
        return plainTextExtensions.some(ext => name.endsWith(ext));
    }

    function getActiveDocuments() {
        return state.activeProjectId ? getProjectDocuments(state.activeProjectId) : [];
    }

    function getDocumentChunkPayload(fullText, selectedModel, isExamMode) {
        if (!fullText) return { chunk: null, docNameSuffix: '', note: '', done: false };

        const weakModelLimit = 12000;
        const normalLimit = isExamMode ? 25000 : 20000;
        const proxyCloudIds = ['groq', 'gemini', 'openai', 'anthropic', 'deepseek']; // Example proxy cloud IDs, you might need to adjust based on PROXY_CLOUD_MODELS if it's external
        // In main.js it was PROXY_CLOUD_MODELS, we can assume it's global or we just pass limit directly. 
        // Wait, main.js has PROXY_CLOUD_MODELS global. We can just use window.PROXY_CLOUD_MODELS.
        const proxyCloudIdsList = window.PROXY_CLOUD_MODELS || [];
        const strongModel = proxyCloudIdsList.includes((selectedModel || '').toLowerCase()) || (selectedModel || '').includes("-nvidia") || (selectedModel || '').includes("-openrouter") || (selectedModel || '').toLowerCase().includes("llava") || (selectedModel || '').toLowerCase().includes("vision") || (selectedModel || '').toLowerCase().includes("scout") || (selectedModel || '').toLowerCase().includes("maverick");
        const limit = strongModel ? normalLimit : Math.min(normalLimit, weakModelLimit);

        if (window.activeDocCursor == null || window.activeDocCursor < 0) window.activeDocCursor = 0;
        if (window.activeDocCursor >= fullText.length) {
            return { chunk: null, docNameSuffix: '', note: '', done: true };
        }

        const start = window.activeDocCursor;
        let end = Math.min(fullText.length, start + limit);
        let chunk = fullText.slice(start, end);

        const lastSpace = chunk.lastIndexOf(' ');
        if (lastSpace > Math.floor(chunk.length * 0.7)) {
            chunk = chunk.slice(0, lastSpace);
            end = start + chunk.length;
        }

        window.activeDocCursor = end;
        const totalChunks = Math.max(1, Math.ceil(fullText.length / limit));
        const currentChunkIndex = Math.floor(start / limit) + 1;
        const remainingChars = fullText.length - end;

        const note = remainingChars > 0
            ? `Bu belgenin ${currentChunkIndex}. parçasını (yaklaşık ${chunk.length} karakter) kullandım. Daha fazlasına devam etmek için lütfen "devam et" yaz.`
            : `Bu belgenin son parçasını kullandım.`;
        const docNameSuffix = remainingChars > 0
            ? ` [PDF Parça ${currentChunkIndex}/${totalChunks}]`
            : ` [PDF Son Parça]`;

        return {
            chunk,
            docNameSuffix,
            note,
            done: false
        };
    }

    /* ──────────────────────────────────────────────
     *  EXPOSE PUBLIC API
     * ────────────────────────────────────────────── */
    window.CinoCodeDocuments = {
        addDocument: addDocument,
        removeDocument: removeDocument,
        getProjectDocuments: getProjectDocuments,
        getActiveDocuments: getActiveDocuments,
        clearProjectDocuments: clearProjectDocuments,
        setActiveProject: setActiveProject,
        parseAndAddDocument: parseAndAddDocument,
        getDocumentChunkPayload: getDocumentChunkPayload
    };
})();
