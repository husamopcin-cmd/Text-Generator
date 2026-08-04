// assets/js/modules/chat-state.js
// Phase 2E: Chat session state management.
// Extracted from main.js to decouple session CRUD and persistence from UI.

(function() {
    'use strict';

    // ===== INTERNAL STATE =====
    var _sessions = {};
    var _currentChatId = null;

    // ===== WINDOW PROPERTY BRIDGE =====
    // Allows bare `sessions` and `currentChatId` references in main.js
    // (after their `let` declarations are removed) to resolve through
    // window properties — same pattern as `projects` in projects.js.
    Object.defineProperty(window, 'sessions', {
        get: function() { return _sessions; },
        set: function(val) { _sessions = val; },
        configurable: true
    });
    Object.defineProperty(window, 'currentChatId', {
        get: function() { return _currentChatId; },
        set: function(val) { _currentChatId = val; },
        configurable: true
    });

    // ===== METADATA NORMALIZATION =====
    function normalizeChatMetadata(chat, fallbackTime) {
        if (typeof fallbackTime === 'undefined') fallbackTime = Date.now();
        if (!chat || typeof chat !== "object") return false;
        var changed = false;
        if (!Array.isArray(chat.messages)) {
            chat.messages = [{ role: "system", content: (typeof systemPrompt !== 'undefined' ? systemPrompt : '') }];
            changed = true;
        }
        if (!chat.title || typeof chat.title !== "string") {
            chat.title = "Yeni Sohbet";
            changed = true;
        }
        if (!Number.isFinite(Number(chat.createdAt))) {
            chat.createdAt = Number(chat.updatedAt) || fallbackTime;
            changed = true;
        } else {
            chat.createdAt = Number(chat.createdAt);
        }
        if (!Number.isFinite(Number(chat.updatedAt))) {
            chat.updatedAt = Number(chat.createdAt) || fallbackTime;
            changed = true;
        } else {
            chat.updatedAt = Number(chat.updatedAt);
        }
        if (typeof chat.starred !== "boolean") {
            chat.starred = chat.isPinned === true;
            changed = true;
        }
        if (typeof chat.manualTitle !== "boolean") {
            chat.manualTitle = false;
            changed = true;
        }
        if (chat.projectId !== null && typeof chat.projectId !== "string") {
            chat.projectId = null;
            changed = true;
        }
        if (chat.projectId && typeof projects !== 'undefined' && !projects[chat.projectId]) {
            chat.projectId = null;
            changed = true;
        }
        if (!chat.freeToneState || typeof chat.freeToneState !== 'object') {
            chat.freeToneState = { override: null, positiveHint: null };
            changed = true;
        }
        return changed;
    }

    function normalizeAllChatMetadata() {
        var changed = false;
        var now = Date.now();
        for (var id in _sessions) {
            changed = normalizeChatMetadata(_sessions[id], now) || changed;
        }
        return changed;
    }

    // ===== PERSISTENCE =====
    var isSavingDB = false;
    var pendingSave = false;

    function _getDbKey() {
        return "cinocode_db_" + ((typeof loggedUser !== 'undefined' ? loggedUser : null) || "default");
    }

    async function doSaveToIDB() {
        if (isSavingDB) {
            pendingSave = true;
            return;
        }
        isSavingDB = true;
        try {
            var dbKey = _getDbKey();
            var clonedSessions = JSON.parse(JSON.stringify(_sessions));
            var projectsData = (typeof projects !== 'undefined') ? projects : {};
            if (window.useLocalStorageFallback) {
                localStorage.setItem(dbKey, JSON.stringify({ sessions: clonedSessions, currentChatId: _currentChatId, projects: projectsData }));
            } else {
                await CinoDB.put('workspaces', dbKey, { sessions: clonedSessions, currentChatId: _currentChatId, projects: projectsData });
            }
        } catch (e) {
            console.error("IDB save error", e);
            window.useLocalStorageFallback = true;
            try {
                var dbKey = _getDbKey();
                localStorage.setItem(dbKey, JSON.stringify({ sessions: _sessions, currentChatId: _currentChatId, projects: (typeof projects !== 'undefined') ? projects : {} }));
            } catch(fallbackErr) {
                console.error("IDB and LocalStorage save both failed", fallbackErr);
            }
        } finally {
            isSavingDB = false;
            if (pendingSave) {
                pendingSave = false;
                doSaveToIDB();
            }
        }
    }

    function saveDatabase() {
        normalizeAllChatMetadata();
        doSaveToIDB();
        // Dispatch event so main.js can re-render sidebar
        window.dispatchEvent(new CustomEvent('cinocode:chat-saved'));
    }

    async function loadDatabase() {
        var dbKey = _getDbKey();
        var rawLocal = localStorage.getItem(dbKey);
        var dbData = null;
        var migrated = false;

        try {
            await CinoDB.init();
            var idbData = await CinoDB.get('workspaces', dbKey);

            if (idbData) {
                dbData = idbData;
            } else if (rawLocal) {
                dbData = JSON.parse(rawLocal);
                await CinoDB.put('workspaces', dbKey, dbData);
                console.log("[CinoCode] Veritabanı IndexedDB'ye taşındı!");
            }
        } catch(e) {
            console.error("IndexedDB load failed, falling back to localStorage", e);
            window.useLocalStorageFallback = true;
            if (rawLocal) {
                try { dbData = JSON.parse(rawLocal); } catch(e2) {}
            }
        }

        if (dbData) {
            _sessions = (dbData.sessions && typeof dbData.sessions === "object") ? dbData.sessions : {};
            _currentChatId = dbData.currentChatId || null;
            if (typeof projects !== 'undefined' && typeof window.CinoCodeState !== 'undefined') {
                window.CinoCodeState.project.projects = (dbData.projects && typeof dbData.projects === "object") ? dbData.projects : {};
            }
            migrated = normalizeAllChatMetadata();
        } else {
            _sessions = {};
            _currentChatId = null;
            if (typeof window.CinoCodeState !== 'undefined') {
                window.CinoCodeState.project.projects = {};
            }
        }

        if (Object.keys(_sessions).length === 0 || !_currentChatId || !_sessions[_currentChatId]) {
            // Dispatch event asking main.js to create a new chat
            window.dispatchEvent(new CustomEvent('cinocode:chat-db-loaded', { detail: { needsNewChat: true } }));
        } else {
            if (migrated) saveDatabase();
            window.dispatchEvent(new CustomEvent('cinocode:chat-db-loaded', { detail: { needsNewChat: false } }));
        }
    }

    // ===== SORTED IDS =====
    function getSortedChatIds(ids) {
        return ids.sort(function(a, b) {
            return (Number(_sessions[b]?.updatedAt) || 0) - (Number(_sessions[a]?.updatedAt) || 0);
        });
    }

    // ===== PUBLIC API =====
    window.CinoCodeChat = {
        // State accessors (also bridged via window.sessions / window.currentChatId)
        get sessions() { return _sessions; },
        set sessions(val) { _sessions = val; },
        get currentChatId() { return _currentChatId; },
        set currentChatId(val) { _currentChatId = val; },
        get currentChat() { return _sessions[_currentChatId] || null; },

        // Metadata
        normalizeChatMetadata: normalizeChatMetadata,
        normalizeAllChatMetadata: normalizeAllChatMetadata,

        // Persistence
        saveDatabase: saveDatabase,
        loadDatabase: loadDatabase,

        // Utilities
        getSortedChatIds: getSortedChatIds
    };
})();

