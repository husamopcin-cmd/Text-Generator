
// assets/js/modules/projects.js

function createProjectRecord(name, description) {
        const id = "proj_" + Date.now();
        projects[id] = {
            id,
            name: name,
            description: description || "",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            starred: false,
            archived: false
        };
        window.CinoCodeState.emit('cinocode:projectChanged');
        return id;
    }



window.getSortedProjectIds = typeof getSortedProjectIds !== 'undefined' ? getSortedProjectIds : null;
window.createProjectRecord = typeof createProjectRecord !== 'undefined' ? createProjectRecord : null;
