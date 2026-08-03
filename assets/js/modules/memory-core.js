// assets/js/modules/memory-core.js

window.CinoCodeMemory = {
    
    getDefaultMemoryTemplate: function() {
        return {
            architectureDecisions: [],
            openTasks: [],
            completedMilestones: [],
            techStack: [],
            notes: ""
        };
    },

    initProjectMemory: function(projectId) {
        if (!window.projects) return;
        const project = window.projects[projectId];
        if (!project) return;

        if (!project.memory) {
            project.memory = this.getDefaultMemoryTemplate();
            if (typeof window.updateProjectRecord === 'function') {
                window.updateProjectRecord(projectId, { memory: project.memory });
            }
        }
    },

    addDecision: function(projectId, decision, reason) {
        if (!window.projects || !window.projects[projectId]) return;
        this.initProjectMemory(projectId);
        
        const memory = window.projects[projectId].memory;
        memory.architectureDecisions.push({
            date: new Date().toISOString().split('T')[0],
            decision: decision,
            reason: reason || ""
        });
        
        if (typeof window.updateProjectRecord === 'function') {
            window.updateProjectRecord(projectId, { memory: memory });
        }
    },

    addMilestone: function(projectId, milestone) {
        if (!window.projects || !window.projects[projectId]) return;
        this.initProjectMemory(projectId);
        
        const memory = window.projects[projectId].memory;
        memory.completedMilestones.push(milestone);
        
        if (typeof window.updateProjectRecord === 'function') {
            window.updateProjectRecord(projectId, { memory: memory });
        }
    },

    getProjectContext: function(projectId) {
        if (!window.projects || !window.projects[projectId]) return "";
        this.initProjectMemory(projectId);

        const proj = window.projects[projectId];
        const mem = proj.memory;

        let contextChunks = [];
        
        contextChunks.push(`[PROJECT CONTEXT: ${proj.name}]`);
        if (proj.description) contextChunks.push(`Description: ${proj.description}`);
        
        if (mem.techStack && mem.techStack.length > 0) {
            contextChunks.push(`Tech Stack: ${mem.techStack.join(', ')}`);
        }

        if (mem.architectureDecisions && mem.architectureDecisions.length > 0) {
            contextChunks.push(`\n[Architecture Decisions]`);
            mem.architectureDecisions.forEach(d => {
                contextChunks.push(`- ${d.date}: ${d.decision} (Reason: ${d.reason})`);
            });
        }

        if (mem.completedMilestones && mem.completedMilestones.length > 0) {
            contextChunks.push(`\n[Completed Milestones]`);
            mem.completedMilestones.forEach(m => {
                contextChunks.push(`- ${m}`);
            });
        }

        if (mem.openTasks && mem.openTasks.length > 0) {
            contextChunks.push(`\n[Open Tasks]`);
            mem.openTasks.forEach(t => {
                contextChunks.push(`- ${t}`);
            });
        }

        if (mem.notes) {
            contextChunks.push(`\n[Notes]\n${mem.notes}`);
        }

        if (contextChunks.length === 1) return "";

        return contextChunks.join('\n') + "\n\n";
    }

};
