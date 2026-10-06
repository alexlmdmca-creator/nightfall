// Utilidad interna: reemplazos exactos en archivos (falla si no encuentra el texto).
const fs = require('fs');
module.exports = (file, pairs) => {
  let s = fs.readFileSync(file, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.error('NO MATCH in', file, ':', a.slice(0, 80)); process.exitCode = 1; continue; }
    s = s.replace(a, b);
  }
  fs.writeFileSync(file, s);
};
