const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

walkDir('d:/Practice/mcp/MCP-Server-Manager/frontend/app', function (filePath) {
    if (filePath.endsWith('.tsx')) {
        let content = fs.readFileSync(filePath, 'utf8');
        let original = content;

        // standard pages
        content = content.replace(/className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100/g, 'className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950');

        // admin page specific
        content = content.replace(/className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50\/40 to-amber-50\/60"/g, 'className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/40 to-amber-50/60 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"');

        if (content !== original) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('Fixed', filePath);
        }
    }
});
