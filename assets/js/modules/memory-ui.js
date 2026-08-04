// assets/js/modules/memory-ui.js
// Phase 3: Memory UI logic

(function() {
    'use strict';

    function getProject() {
        if (!window.currentChatId || !window.sessions || !window.sessions[window.currentChatId]) return null;
        const projectId = window.sessions[window.currentChatId].projectId;
        if (!projectId || !window.projects || !window.projects[projectId]) return null;
        return { id: projectId, data: window.projects[projectId] };
    }

    function renderMemoryUI() {
        const projectContext = getProject();
        if (!projectContext) {
            closeMemoryModal();
            return;
        }

        const mem = projectContext.data.memory || window.CinoCodeMemory.getDefaultMemoryTemplate();

        // Render Architecture Decisions
        const archList = document.getElementById('memory-arch-list');
        if (archList) {
            archList.innerHTML = mem.architectureDecisions.map((d, index) => `
                <div class="memory-item">
                    <div class="memory-item-content">
                        <strong>${d.date}</strong>: ${d.decision}
                        ${d.reason ? `<div class="memory-item-reason">${d.reason}</div>` : ''}
                    </div>
                    <button class="icon-btn delete-btn" onclick="window.CinoCodeMemoryUI.deleteItem('architectureDecisions', ${index})" title="Sil">🗑️</button>
                </div>
            `).join('');
        }

        // Render Milestones
        const milesList = document.getElementById('memory-miles-list');
        if (milesList) {
            milesList.innerHTML = mem.completedMilestones.map((m, index) => `
                <div class="memory-item">
                    <div class="memory-item-content">${m}</div>
                    <button class="icon-btn delete-btn" onclick="window.CinoCodeMemoryUI.deleteItem('completedMilestones', ${index})" title="Sil">🗑️</button>
                </div>
            `).join('');
        }

        // Render Tasks
        const tasksList = document.getElementById('memory-tasks-list');
        if (tasksList) {
            tasksList.innerHTML = mem.openTasks.map((t, index) => `
                <div class="memory-item">
                    <div class="memory-item-content">${t}</div>
                    <button class="icon-btn delete-btn" onclick="window.CinoCodeMemoryUI.deleteItem('openTasks', ${index})" title="Sil">🗑️</button>
                </div>
            `).join('');
        }

        // Render Tech Stack
        const techList = document.getElementById('memory-tech-list');
        if (techList) {
            techList.innerHTML = mem.techStack.map((t, index) => `
                <div class="memory-item">
                    <div class="memory-item-content">${t}</div>
                    <button class="icon-btn delete-btn" onclick="window.CinoCodeMemoryUI.deleteItem('techStack', ${index})" title="Sil">🗑️</button>
                </div>
            `).join('');
        }

        // Render Notes
        const notesEl = document.getElementById('memory-notes-input');
        if (notesEl) {
            notesEl.value = mem.notes || "";
        }
    }

    function openMemoryModal() {
        const projectContext = getProject();
        if (!projectContext) {
            if (typeof window.showToast === 'function') window.showToast('Hafıza panelini açmak için bir projeye bağlı sohbet başlatmalısınız.', 'warning');
            return;
        }
        
        // Modal and backdrop display logic
        document.getElementById('memoryOverlay').style.display = 'flex';
        renderMemoryUI();
    }

    function closeMemoryModal() {
        document.getElementById('memoryOverlay').style.display = 'none';
    }

    function deleteItem(field, index) {
        const projectContext = getProject();
        if (!projectContext) return;
        
        if (window.CinoCodeMemory && typeof window.CinoCodeMemory.removeItem === 'function') {
            window.CinoCodeMemory.removeItem(projectContext.id, field, index);
            renderMemoryUI();
        }
    }

    function addSimpleItem(field, inputId) {
        const projectContext = getProject();
        if (!projectContext) return;
        
        const inputEl = document.getElementById(inputId);
        const val = inputEl.value.trim();
        if (!val) return;

        if (window.CinoCodeMemory && typeof window.CinoCodeMemory.addItem === 'function') {
            window.CinoCodeMemory.addItem(projectContext.id, field, val);
            inputEl.value = '';
            renderMemoryUI();
        }
    }

    function addArchitectureDecision() {
        const projectContext = getProject();
        if (!projectContext) return;
        
        const decEl = document.getElementById('mem-new-arch-dec');
        const reasonEl = document.getElementById('mem-new-arch-reason');
        
        const dec = decEl.value.trim();
        const reason = reasonEl.value.trim();
        
        if (!dec) return;

        if (window.CinoCodeMemory && typeof window.CinoCodeMemory.addDecision === 'function') {
            window.CinoCodeMemory.addDecision(projectContext.id, dec, reason);
            decEl.value = '';
            reasonEl.value = '';
            renderMemoryUI();
        }
    }

    function saveNotes() {
        const projectContext = getProject();
        if (!projectContext) return;
        
        const notes = document.getElementById('memory-notes-input').value;
        if (window.CinoCodeMemory && typeof window.CinoCodeMemory.updateNotes === 'function') {
            window.CinoCodeMemory.updateNotes(projectContext.id, notes);
        }
    }
    
    // Auto-save notes on blur or debounce
    let notesTimeout = null;
    function handleNotesInput() {
        if (notesTimeout) clearTimeout(notesTimeout);
        notesTimeout = setTimeout(() => {
            saveNotes();
        }, 1000);
    }

    // Expose UI functions
    window.CinoCodeMemoryUI = {
        openModal: openMemoryModal,
        closeModal: closeMemoryModal,
        deleteItem: deleteItem,
        addSimpleItem: addSimpleItem,
        addArchitectureDecision: addArchitectureDecision,
        handleNotesInput: handleNotesInput,
        saveNotes: saveNotes,
        refresh: renderMemoryUI
    };

    // Update memory button visibility on chat load
    document.addEventListener('cinocode:chat-loaded', () => {
        const btn = document.getElementById('memoryHeaderBtn');
        if (btn) {
            btn.style.display = getProject() ? 'inline-block' : 'none';
        }
    });

})();
