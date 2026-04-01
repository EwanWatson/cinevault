const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('<script>\n    (() => {');
const end = html.lastIndexOf('})();\n    </script>');
if (start === -1 || end === -1) { console.error('markers not found'); process.exit(1); }
const js = html.slice(start + '<script>\n'.length, end + '})();'.length);
try { new Function(js); console.log('JS syntax OK'); }
catch(e) { console.error('Syntax error:', e.message); process.exit(1); }
