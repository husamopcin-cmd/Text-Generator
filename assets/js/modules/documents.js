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
     *  EXPOSE PUBLIC API
     * ────────────────────────────────────────────── */
    window.CinoCodeDocuments = {
        addDocument: addDocument,
        removeDocument: removeDocument,
        getProjectDocuments: getProjectDocuments,
        clearProjectDocuments: clearProjectDocuments,
        setActiveProject: setActiveProject
    };
})();
