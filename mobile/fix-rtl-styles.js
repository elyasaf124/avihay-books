const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

function processFile(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
  
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Replace textAlign: "right" with textAlign: "left"
  // Why? In React Native RTL mode, "right" gets mirrored to "left" visually.
  // Changing it to "left" ensures it mirrors to "right" visually in RTL.
  content = content.replace(/textAlign:\s*["']right["']/g, 'textAlign: "left"');
  
  // Replace textAlign="right" (for components) with textAlign="left"
  content = content.replace(/textAlign=["']right["']/g, 'textAlign="left"');
  
  // Remove writingDirection: "rtl" as it's unnecessary and can cause confusion
  content = content.replace(/\s*writingDirection:\s*["']rtl["'],?/g, '');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Fixed:', filePath);
  }
}

['src', 'app'].forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (fs.existsSync(fullPath)) {
    walkDir(fullPath, processFile);
  }
});

console.log('Done.');
