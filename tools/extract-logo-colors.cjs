const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');

function toHex([r,g,b]){
  return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
}

function darken([r,g,b], pct){
  return [Math.max(0, Math.round(r*(1-pct))), Math.max(0, Math.round(g*(1-pct))), Math.max(0, Math.round(b*(1-pct)))];
}

function rgbaStr([r,g,b], a){
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function keyToColor(key){
  const r = (key>>10)&31;
  const g = (key>>5)&31;
  const b = key&31;
  return [(r<<3)+4, (g<<3)+4, (b<<3)+4];
}

const logoPath = path.join(__dirname, '..', 'img', 'Selmi_logo.jpg');
const themePath = path.join(__dirname, '..', 'public', 'theme.css');

if (!fs.existsSync(logoPath)){
  console.error('Logo not found at', logoPath);
  process.exit(2);
}

const buf = fs.readFileSync(logoPath);
const raw = jpeg.decode(buf, {useTArray:true});
const pixels = raw.data;

const counts = new Map();
for (let i=0;i<pixels.length;i+=4){
  const r = pixels[i];
  const g = pixels[i+1];
  const b = pixels[i+2];
  // quantize to 5 bits per channel
  const key = ((r>>3)<<10) | ((g>>3)<<5) | (b>>3);
  counts.set(key, (counts.get(key)||0)+1);
}

const sorted = [...counts.entries()].sort((a,b)=>b[1]-a[1]);
if (sorted.length===0){
  console.error('No colors found');
  process.exit(3);
}

const primary = keyToColor(sorted[0][0]);
let accent = null;
for (let i=1;i<sorted.length;i++){
  const col = keyToColor(sorted[i][0]);
  const dr = col[0]-primary[0];
  const dg = col[1]-primary[1];
  const db = col[2]-primary[2];
  const dist = Math.sqrt(dr*dr+dg*dg+db*db);
  if (dist > 60){ accent = col; break; }
}
if (!accent) accent = keyToColor(sorted[1] ? sorted[1][0] : sorted[0][0]);

const primaryHex = toHex(primary);
const primaryHoverHex = toHex(darken(primary, 0.12));
const primarySoft = rgbaStr(primary, 0.12);
const accentHex = toHex(accent);
const accentSoft = rgbaStr(accent, 0.12);

console.log('Detected colors:', {primary: primaryHex, primaryHover: primaryHoverHex, accent: accentHex});

if (!fs.existsSync(themePath)){
  console.error('theme.css not found at', themePath);
  process.exit(4);
}

let theme = fs.readFileSync(themePath, 'utf8');
theme = theme.replace(/(--primary:\s*)#[0-9a-fA-F]{6};/, `$1${primaryHex};`);
theme = theme.replace(/(--primary-hover:\s*)#[0-9a-fA-F]{6};/, `$1${primaryHoverHex};`);
theme = theme.replace(/(--primary-soft:\s*)rgba\([^;]+;?\)/, `$1${primarySoft}`);
theme = theme.replace(/(--accent:\s*)#[0-9a-fA-F]{6};/, `$1${accentHex};`);
theme = theme.replace(/(--accent-soft:\s*)rgba\([^;]+;?\)/, `$1${accentSoft}`);

// If replacements didn't find the variables (older file variants), insert them in :root
if (!theme.includes(primaryHex)){
  theme = theme.replace(/:root\s*{/, `:root {\n  --primary: ${primaryHex};\n  --primary-hover: ${primaryHoverHex};\n  --primary-soft: ${primarySoft};\n  --accent: ${accentHex};\n  --accent-soft: ${accentSoft};`);
}

// Add small logo rule if not present
if (!/\.brand-logo/.test(theme)){
  theme += `\n\n.brand-logo {\n  height: 48px;\n  width: auto;\n  display: block;\n  border-radius: 6px;\n}\n\n.hero-inline .brand-logo {\n  height: 56px;\n}\n`;
}

fs.writeFileSync(themePath, theme, 'utf8');
console.log('theme.css updated with extracted colors.');

process.exit(0);
