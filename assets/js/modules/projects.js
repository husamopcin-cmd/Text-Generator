
// assets/js/modules/projects.js

function createProjectRecord(name, description) {
    const id = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const projects = window.CinoCodeState.project.projects;
    projects[id] = {
        id: id,
        name: name,
        description: description || "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        starred: false,
        archived: false,
        memory: (typeof window.CinoCodeMemory !== 'undefined') ? window.CinoCodeMemory.getDefaultMemoryTemplate() : undefined
    };
    
    window.CinoCodeState.emit('cinocode:project-created', { id });
    return id;
}



window.getSortedProjectIds = typeof getSortedProjectIds !== 'undefined' ? getSortedProjectIds : null;
window.createProjectRecord = typeof createProjectRecord !== 'undefined' ? createProjectRecord : null;


function updateProjectRecord(id, updates) {
    const projects = window.CinoCodeState.project.projects;
    if (!projects[id]) return;
    Object.assign(projects[id], updates);
    projects[id].updatedAt = Date.now();
    window.CinoCodeState.emit('cinocode:project-updated', { id });
}

function toggleStarProjectRecord(id) {
    const projects = window.CinoCodeState.project.projects;
    if (!projects[id]) return;
    projects[id].starred = !projects[id].starred;
    projects[id].updatedAt = Date.now();
    window.CinoCodeState.emit('cinocode:project-updated', { id });
}

function archiveProjectRecord(id) {
    const projects = window.CinoCodeState.project.projects;
    if (!projects[id]) return;
    projects[id].archived = !projects[id].archived;
    projects[id].updatedAt = Date.now();
    window.CinoCodeState.emit('cinocode:project-updated', { id });
}

function deleteProjectRecord(id) {
    const projects = window.CinoCodeState.project.projects;
    if (!projects[id]) return;
    delete projects[id];
    window.CinoCodeState.emit('cinocode:project-deleted', { id });
}

window.updateProjectRecord = updateProjectRecord;
window.toggleStarProjectRecord = toggleStarProjectRecord;
window.archiveProjectRecord = archiveProjectRecord;
window.deleteProjectRecord = deleteProjectRecord;
