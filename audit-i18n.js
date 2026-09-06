const fs = require('fs');

function getKeys(obj, prefix='') {
  let k=[];
  for(const [a,b] of Object.entries(obj)){
    const n = prefix ? prefix + '.' + a : a;
    if (b && typeof b === 'object' && !Array.isArray(b)) k.push(...getKeys(b, n)); else k.push(n);
  }
  return k;
}

const en = JSON.parse(fs.readFileSync('src/i18n/en.json', 'utf8'));
const ne = JSON.parse(fs.readFileSync('src/i18n/ne.json', 'utf8'));
const enKeys = new Set(getKeys(en));
const neKeys = new Set(getKeys(ne));

// Scan all TSX/TS files
const dirs = ['src/app', 'src/components', 'src/context', 'src/lib', 'src/services'];
const allContent = [];
for (const dir of dirs) {
  try {
    const files = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
    for (const f of files) {
      if (f.isFile() && (f.name.endsWith('.tsx') || f.name.endsWith('.ts'))) {
        const parent = f.parent ? f.parent.join('/') : '';
        const path = dir + '/' + parent + '/' + f.name;
        try { allContent.push(fs.readFileSync(path, 'utf8')); } catch(e) {}
      }
    }
  } catch(e) {}
}

const content = allContent.join('\n');

// t('...') calls
const tCalls = [...content.matchAll(/t\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);

// Keys stored in objects: labelKey/subtitleKey/descriptionKey/badgeKey etc.
const tierKeys = [...content.matchAll(/(?:labelKey|subtitleKey|descriptionKey|badgeKey|titleKey|valueKey|keyKey): ['"]([^'"]+)['"]/g)].map(m => m[1]);

const allUsed = [...new Set([...tCalls, ...tierKeys])];

const skip = (k) => k.includes('@/') || k.startsWith('/') || k === '' || k.includes('${');
const missingEn = allUsed.filter(k => !skip(k) && !enKeys.has(k));
const missingNe = allUsed.filter(k => !skip(k) && enKeys.has(k) && !neKeys.has(k));

console.log('Missing in en.json (' + missingEn.length + '):');
missingEn.forEach(k => console.log('  ' + k));
console.log('');
console.log('Missing in ne.json (' + missingNe.length + '):');
missingNe.forEach(k => console.log('  ' + k));

// Also verify key count
console.log('\nTotal en keys: ' + enKeys.size + ', ne keys: ' + neKeys.size);
