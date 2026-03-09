const fs = require('fs');
const path = require('path');

const targetDirs = [
    path.join(__dirname, 'frontend/app'),
    path.join(__dirname, 'frontend/components')
];

// Tailwind class mapping to add dark variants
const replacements = [
    { regex: /(?<!dark:)\bbg-white\b/g, replacement: 'bg-white dark:bg-slate-900' },
    { regex: /(?<!dark:)\bbg-slate-50\b/g, replacement: 'bg-slate-50 dark:bg-slate-800/50' },
    { regex: /(?<!dark:)\bbg-slate-100\b/g, replacement: 'bg-slate-100 dark:bg-slate-800' },
    { regex: /(?<!dark:)\bborder-slate-200\b/g, replacement: 'border-slate-200 dark:border-slate-700' },
    { regex: /(?<!dark:)\bborder-slate-300\b/g, replacement: 'border-slate-300 dark:border-slate-600' },
    { regex: /(?<!dark:)\btext-slate-900\b/g, replacement: 'text-slate-900 dark:text-slate-100' },
    { regex: /(?<!dark:)\btext-slate-800\b/g, replacement: 'text-slate-800 dark:text-slate-200' },
    { regex: /(?<!dark:)\btext-slate-700\b/g, replacement: 'text-slate-700 dark:text-slate-300' },
    { regex: /(?<!dark:)\btext-slate-600\b/g, replacement: 'text-slate-600 dark:text-slate-400' },
    { regex: /(?<!dark:)\btext-slate-500\b/g, replacement: 'text-slate-500 dark:text-slate-400' },
    { regex: /(?<!dark:)\bbg-emerald-50\b/g, replacement: 'bg-emerald-50 dark:bg-emerald-900/30' },
    { regex: /(?<!dark:)\bbg-emerald-100\b/g, replacement: 'bg-emerald-100 dark:bg-emerald-900/50' },
    { regex: /(?<!dark:)\bborder-emerald-200\b/g, replacement: 'border-emerald-200 dark:border-emerald-800' },
    { regex: /(?<!dark:)\bborder-emerald-500\b/g, replacement: 'border-emerald-500 dark:border-emerald-600' },
    { regex: /(?<!dark:)\bborder-blue-300\b/g, replacement: 'border-blue-300 dark:border-blue-700' },
    { regex: /(?<!dark:)\bbg-red-50\b/g, replacement: 'bg-red-50 dark:bg-red-900/30' },
    { regex: /(?<!dark:)\bbg-amber-50\b/g, replacement: 'bg-amber-50 dark:bg-amber-900/30' },
    { regex: /(?<!dark:)\bbg-amber-100\b/g, replacement: 'bg-amber-100 dark:bg-amber-900/50' },
    { regex: /(?<!dark:)\bborder-amber-200\b/g, replacement: 'border-amber-200 dark:border-amber-800' },
    { regex: /(?<!dark:)\bborder-amber-300\b/g, replacement: 'border-amber-300 dark:border-amber-700' },
];

function processDirectory(dir) {
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            if (fullPath.includes('dashboard')) continue; // Skip dashboard as requested

            let content = fs.readFileSync(fullPath, 'utf8');
            let originalContent = content;

            for (const { regex, replacement } of replacements) {
                content = content.replace(regex, replacement);
            }

            // Specifically fix inputs to have dark background
            content = content.replace(/(<input[^>]+className="[^"]*)(?<!dark:bg-)[^"]*("[^>]*>)/g, (match, p1, p2) => {
                if (!p1.includes('bg-')) {
                    return p1 + ' bg-transparent dark:bg-slate-800 dark:text-white' + p2;
                }
                return match;
            });
            content = content.replace(/(<textarea[^>]+className="[^"]*)(?<!dark:bg-)[^"]*("[^>]*>)/g, (match, p1, p2) => {
                if (!p1.includes('bg-')) {
                    return p1 + ' bg-transparent dark:bg-slate-800 dark:text-white' + p2;
                }
                return match;
            });

            // Special handling for the nav bar (isDark prop)
            if (fullPath.includes('Navigation.tsx')) {
                // This is complex, will handle Navigation manually
                continue;
            }

            if (content !== originalContent) {
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`Updated: ${fullPath}`);
            }
        }
    }
}

targetDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
        processDirectory(dir);
    }
});

console.log('Script completed.');
