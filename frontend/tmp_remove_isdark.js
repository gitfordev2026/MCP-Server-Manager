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

        // Replace ${isDark ? '...' : '...'} with the second branch (which already has dark: injected)
        content = content.replace(/\$\{isDark \? '[^']*' \: '([^']*)'\}/g, "$1");
        // Replace {isDark ? '...' : '...'} where it's not inside a template string
        content = content.replace(/\{isDark \? '[^']*' \: '([^']*)'\}/g, "'$1'");
        // Same but without quotes on the false branch text
        content = content.replace(/className=\{isDark \? '[^']*' \: '([^']*)'\}/g, 'className="$1"');

        // Remove the useState definition
        content = content.replace(/const \[isDark, setIsDark\] = useState\(false\);\n?/g, '');

        // Remove the window.matchMedia block
        content = content.replace(/\/\/ Check system preference\s+if \(window\.matchMedia && window\.matchMedia\('\(prefers-color-scheme: dark\)'\)\.matches\) \{\s+setIsDark\(true\);\s+\}\n?/g, '');

        // In page.tsx: remove isDark={isDark} from <Navigation />
        content = content.replace(/<Navigation isDark=\{isDark\} \/>/g, '<Navigation />');

        if (content !== original) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('Fixed', filePath);
        }
    }
});
