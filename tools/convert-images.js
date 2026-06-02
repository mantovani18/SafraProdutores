import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const svgPath = path.join(process.cwd(), 'uploads', 'contratos', 'test-image.svg');
const outDir = path.join(process.cwd(), 'uploads', 'contratos');

const sizes = [
  { name: 'regular', width: 1200, height: 600 },
  { name: 'thumb', width: 400, height: 200 }
];

async function run() {
  try {
    const svg = await fs.readFile(svgPath);

    await fs.mkdir(outDir, { recursive: true });

    for (const s of sizes) {
      const outPath = path.join(outDir, `test-image-${s.name}.png`);
      await sharp(svg)
        .resize(s.width, s.height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toFile(outPath);
      console.log('Wrote', outPath);
    }

    console.log('Conversão concluída.');
  } catch (err) {
    console.error('Erro ao converter imagens:', err);
    process.exit(1);
  }
}

run();
