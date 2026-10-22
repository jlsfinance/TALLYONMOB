import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const srcDir = 'D:\\tallyonmob\\TALLYONMOB\\tally-web-dashboard\\src';

// Get all source files
function getAllFiles(dir, extList) {
  const files = [];
  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && !e.name.startsWith('node_modules') && !e.name.startsWith('.')) {
        walk(p);
      } else if (e.isFile()) {
        const ext = path.extname(e.name);
        if (extList.includes(ext)) {
          files.push(p);
        }
      }
    }
  }
  walk(dir);
  return files;
}

const sourceFiles = getAllFiles(srcDir, ['.tsx', '.jsx', '.ts', '.js']);
console.log(`Found ${sourceFiles.length} source files`);

// Parse import statements from a file
function parseImports(content) {
  const imports = [];
  // Match: import X from 'y'
  //        import { X } from 'y'
  //        import { X as Z } from 'y'
  //        import * as X from 'y'
  //        import type { X } from 'y'
  //        import X, { Y } from 'z'
  const importRegex = /^import\s+(?:(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*(?:\{[^}]*\}))?)\s+from\s+['"][^'"]+['"]|['"][^'"]+['"])/gm;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const line = match[0];
    const lineNum = content.substring(0, match.index).split('\n').length;
    
    // Extract imported names (local bindings)
    const names = [];
    
    // default import: import X from 'y'
    const defaultMatch = line.match(/^import\s+(?:type\s+)?(\w+)\s+from\s+/);
    if (defaultMatch && !line.includes('* as') && !line.includes('{')) {
      names.push({ name: defaultMatch[1], type: 'default' });
    }
    
    // namespace import: import * as X from 'y'
    const nsMatch = line.match(/\*\s+as\s+(\w+)/);
    if (nsMatch) {
      names.push({ name: nsMatch[1], type: 'namespace' });
    }
    
    // named imports: import { X, Y as Z } from 'y'
    const namedMatch = line.match(/\{([^}]+)\}/);
    if (namedMatch) {
      const parts = namedMatch[1].split(',');
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) {
          // Handle 'as' aliases
          const asMatch = trimmed.match(/(?:type\s+)?(\w+)(?:\s+as\s+(\w+))?/);
          if (asMatch) {
            names.push({ name: asMatch[2] || asMatch[1], type: 'named', original: asMatch[1] });
          }
        }
      }
    }
    
    if (names.length > 0) {
      imports.push({ line, lineNum, names, fullLine: match[0] });
    }
  }
  return imports;
}

// Check if a name is used in the content (excluding its own import line)
function isNameUsed(name, content, importLineIndex) {
  // Remove the import line from content
  const contentWithoutImport = content.substring(importLineIndex);
  
  // Check if the name appears as an identifier (not inside a string or comment)
  // We'll use a regex that looks for the name as a word boundary
  const regex = new RegExp('(?<![\\w$])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w$])', 'g');
  let count = 0;
  let m;
  while ((m = regex.exec(contentWithoutImport)) !== null) {
    count++;
  }
  // Subtract 1 if the name appears in the import line itself (the first match is the import declaration)
  return count > 0;
}

// Check for types used in TypeScript
function isTypeUsed(name, content) {
  const regex = new RegExp('(?<![\\w$])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w$])', 'g');
  let count = 0;
  let m;
  while ((m = regex.exec(content)) !== null) {
    count++;
  }
  return count;
}

// Main analysis
let allUnused = [];

for (const file of sourceFiles) {
  const relativePath = path.relative(srcDir, file);
  const content = fs.readFileSync(file, 'utf-8');
  const imports = parseImports(content);
  
  const fileUnused = [];
  
  for (const imp of imports) {
    for (const binding of imp.names) {
      // For type imports, check if types are used
      const isTypeImport = imp.fullLine.startsWith('import type');
      
      // Count occurrences in the whole file  
      const countInFile = (content.match(new RegExp('(?<![\\w$])' + binding.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w$])', 'g')) || []).length;
      
      // Count occurrences in the import line
      const countInImportLine = (imp.fullLine.match(new RegExp('(?<![\\w$])' + binding.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w$])', 'g')) || []).length;
      
      // If total occurrences == occurrences in import line, it's unused
      if (countInFile === countInImportLine) {
        fileUnused.push({ name: binding.name, line: imp.lineNum, importLine: imp.fullLine.trim() });
      }
    }
  }
  
  if (fileUnused.length > 0) {
    allUnused.push({ file: relativePath, unused: fileUnused });
  }
}

// Report
console.log('\n===== UNUSED IMPORTS REPORT =====\n');
let totalUnused = 0;
for (const entry of allUnused) {
  console.log(`\n--- ${entry.file} ---`);
  for (const u of entry.unused) {
    console.log(`  Line ${u.line}: '${u.name}' imported but never used`);
    console.log(`    Import: ${u.importLine}`);
    totalUnused++;
  }
}
console.log(`\n\nTotal unused imports: ${totalUnused} in ${allUnused.length} files`);

// Also check for CSS/SCSS imports that are unused
console.log('\n\n===== ADDITIONAL: Checking style imports =====\n');
for (const file of sourceFiles) {
  const relativePath = path.relative(srcDir, file);
  const content = fs.readFileSync(file, 'utf-8');
  const cssImports = content.match(/^import\s+['"].*\.css['"]/gm);
  if (cssImports) {
    // Check if the CSS file exists and if it's actually needed
    // (Hard to determine for CSS, just note them)
  }
}
