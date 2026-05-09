#!/usr/bin/env node
// build-pokedex-gif.mjs — compõe pokedex.gif animado a partir de frames Gen5 BW.
// Cada um dos 10 percorre uma trajetória própria (walkers horizontais com bounce,
// flyers com sine-wave). Loop seamless via wrap-around.
//
// Pré-req: assets/frames/{nome}/NNN.png já extraídos.
// Saída:  assets/pokemon-pokedex.gif

import { execSync } from 'node:child_process';
import { readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dirname, '..');
const FRM   = join(ROOT, 'assets', 'frames');
const TMP   = join(ROOT, 'assets', 'tmp-pokedex');
const OUT   = join(ROOT, 'assets', 'pokemon-pokedex.gif');

// Canvas e loop
const W = 1200;
const H = 240;
const FRAMES = 60;     // 60 frames @ 15fps = 4s loop
const FPS    = 15;
const DELAY  = Math.round(100 / FPS); // centissegundos por frame (GIF unit)

// Motion paths — cada pokémon tem (modo, faseY, faseX, vel)
// modo: 'walk' (chão + bounce) | 'fly' (sine wave) | 'float' (lento, vertical leve)
// Fases distribuídas em múltiplos de 0.1 pra evitar sobreposição inicial
const POKEMON = [
  { name: 'venusaur',  mode: 'walk',  speed: 0.9,  yBase: 175, phase: 0.00 },
  { name: 'pikachu',   mode: 'walk',  speed: 1.8,  yBase: 198, phase: 0.10 }, // pequeno + rápido
  { name: 'charizard', mode: 'fly',   speed: 1.1,  yBase: 55,  phase: 0.20, amp: 28 },
  { name: 'blastoise', mode: 'walk',  speed: 0.8,  yBase: 178, phase: 0.30 },
  { name: 'articuno',  mode: 'fly',   speed: 0.95, yBase: 48,  phase: 0.40, amp: 24 },
  { name: 'mewtwo',    mode: 'float', speed: 0.7,  yBase: 115, phase: 0.50 }, // psíquico flutua
  { name: 'zapdos',    mode: 'fly',   speed: 1.25, yBase: 85,  phase: 0.60, amp: 26 },
  { name: 'mew',       mode: 'fly',   speed: 1.4,  yBase: 65,  phase: 0.70, amp: 38 }, // brincalhão
  { name: 'moltres',   mode: 'fly',   speed: 1.0,  yBase: 95,  phase: 0.80, amp: 30 },
  { name: 'dragonite', mode: 'fly',   speed: 1.05, yBase: 130, phase: 0.90, amp: 20 },
];

// Frame counts por pokémon
const frameCount = Object.fromEntries(
  POKEMON.map(p => [p.name, readdirSync(join(FRM, p.name)).filter(f => f.endsWith('.png')).length])
);

// Tamanho aproximado por pokémon (pra centralizar X dentro da janela)
const dims = Object.fromEntries(
  POKEMON.map(p => {
    const out = execSync(`magick identify -format "%w %h" "${join(FRM, p.name, '000.png')}"`).toString().trim().split(' ');
    return [p.name, { w: +out[0], h: +out[1] }];
  })
);

if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

console.log(`Compondo ${FRAMES} frames de ${W}×${H} @ ${FPS}fps:`);

// Renderiza cada frame de saída
for (let f = 0; f < FRAMES; f++) {
  const t = f / FRAMES; // [0,1) normalizado por loop

  // monta args do magick: canvas transparente + sequência de -draw composite
  const parts = [`magick -size ${W}x${H} xc:none`];

  for (const p of POKEMON) {
    const fc = frameCount[p.name];
    const srcFrame = (f * 1) % fc; // ciclo natural de animação interna
    const srcPath  = join(FRM, p.name, String(srcFrame).padStart(3, '0') + '.png');
    const { w, h } = dims[p.name];

    // X: traversa horizontal completa, com wrap
    const tx = ((t * p.speed + p.phase) % 1);  // [0,1)
    let x = Math.round(-w + tx * (W + w));     // entra pela esquerda (-w), sai pela direita (W)

    // Y: depende do modo
    let y;
    if (p.mode === 'walk') {
      // bounce de 4px
      y = p.yBase - h + Math.round(Math.sin(t * Math.PI * 2 * p.speed * 4) * 4);
    } else if (p.mode === 'float') {
      // hover lento
      y = p.yBase - h/2 + Math.round(Math.sin(t * Math.PI * 2 + p.phase * 6) * 8);
    } else { // fly
      const amp = p.amp || 24;
      y = p.yBase - h/2 + Math.round(Math.sin(tx * Math.PI * 2 * 1.5 + p.phase * 6) * amp);
    }

    parts.push(`"${srcPath}" -geometry +${x}+${y} -composite`);
  }

  const outFrame = join(TMP, `f${String(f).padStart(3, '0')}.png`);
  parts.push(`"${outFrame}"`);
  execSync(parts.join(' '), { stdio: 'pipe' });
  if ((f + 1) % 10 === 0) process.stdout.write(`  ${f + 1}/${FRAMES}\n`);
}

console.log('\nEncodando GIF final…');
// Combina frames em GIF animado, otimizado, com loop infinito e transparência
execSync(
  `magick -delay ${DELAY} -loop 0 -dispose previous "${TMP}/f*.png" ` +
  `-layers OptimizePlus -fuzz 1% "${OUT}"`,
  { stdio: 'inherit' }
);

const sizeKB = Math.round(execSync(`stat -f %z "${OUT}"`).toString().trim() / 1024);
console.log(`\nGerado: ${OUT} (${sizeKB} KB)`);
