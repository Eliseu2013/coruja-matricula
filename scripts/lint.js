/**
 * Verificação de sintaxe de todos os arquivos JavaScript do projeto (node --check).
 * Substitui o antigo "tsc --noEmit", que só olhava a pasta src/ (removida, não era usada).
 * Foi esta verificação que revelou o erro de sintaxe que impedia public/app.js de carregar.
 */
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const IGNORAR = new Set(['node_modules', 'data', 'backups', '.git']);
const arquivos = [];

function varrer(dir) {
  for (const nome of readdirSync(dir)) {
    if (IGNORAR.has(nome)) continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) varrer(caminho);
    else if (nome.endsWith('.js')) arquivos.push(caminho);
  }
}
varrer(process.cwd());

let falhas = 0;
for (const arq of arquivos) {
  const r = spawnSync(process.execPath, ['--check', arq], { encoding: 'utf-8' });
  if (r.status !== 0) {
    falhas++;
    console.error(`✖ ${arq}\n${r.stderr}`);
  }
}
console.log(`${arquivos.length - falhas}/${arquivos.length} arquivos sem erro de sintaxe.`);
process.exit(falhas ? 1 : 0);
