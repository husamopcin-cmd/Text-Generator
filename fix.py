import sys

with open('assets/js/main.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = """        const documents = window.selectedFiles ? window.selectedFiles.filter(f => f.rawType === 'document') : [];
        let docTextToUse = null;
        let docNameToUse = "Belge";
        if (documents.length > 0) {
            docTextToUse = documents
                .map(d => String(d.content || ''))
                .join("\\n").slice(0, DOCUMENT_CONTEXT_MAX_CHARS);
            docNameToUse = documents.map(d => d.name).join(", ");
        }"""

replacement = """        let documents = [];
        if (window.CinoCodeDocuments && typeof window.CinoCodeDocuments.getActiveDocuments === 'function') {
            documents = window.CinoCodeDocuments.getActiveDocuments();
        } else {
            documents = window.selectedFiles ? window.selectedFiles.filter(f => f.rawType === 'document') : [];
        }
        let docTextToUse = null;
        let docNameToUse = "Belge";
        if (documents.length > 0) {
            docTextToUse = documents
                .map(d => String(d.content || ''))
                .join("\\n").slice(0, DOCUMENT_CONTEXT_MAX_CHARS);
            docNameToUse = documents.map(d => d.name).join(", ");
        }"""

target = target.replace('\r\n', '\n')
replacement = replacement.replace('\r\n', '\n')
content_normalized = content.replace('\r\n', '\n')

if target in content_normalized:
    new_content = content_normalized.replace(target, replacement)
    with open('assets/js/main.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('Replaced successfully.')
else:
    print('Target not found in content.')
