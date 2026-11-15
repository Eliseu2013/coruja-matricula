// Lê a lista de convocados publicada pela FAETERJ-Rio (PDF da chamada do SISU) e devolve
// um item por candidato: turno, modalidade, ordem, nome, nota e inscrição do ENEM.
// O PDF não traz CPF: o vínculo CPF <-> inscrição nasce no 1º acesso do candidato.

const MAX_PAGINAS = 60;
const INSCRICAO_ENEM = /^\d{12}$/;

// Linha de candidato (exemplo fictício): "1 CANDIDATO EXEMPLO DA SILVA 669,62 250000000001"
const LINHA_CANDIDATO = /^(\d{1,4})\s+(.+?)\s+(\d{1,4}[.,]\d{1,3})\s+(\d{12})$/;
const LINHA_CABECALHO = /^ORDEM\s+NOME/i;
const LINHA_TITULO = /Turno\s+(MATUTINO|VESPERTINO|NOTURNO|INTEGRAL)/i;

export function normalizarInscricao(valor) {
  return String(valor === null || valor === undefined ? '' : valor).replace(/\D/g, '');
}

export function inscricaoValida(valor) {
  return INSCRICAO_ENEM.test(normalizarInscricao(valor));
}

function codigoModalidade(texto) {
  const t = String(texto || '').toLowerCase();
  if (t.includes('ampla')) return 'AMPLA';
  if (t.includes('rede pública') || t.includes('rede publica')) return 'REDE_PUBLICA';
  if (t.includes('negro') || t.includes('indígena') || t.includes('indigena') || t.includes('quilombola')) return 'NEGROS_INDIGENAS';
  if (t.includes('deficiência') || t.includes('deficiencia') || t.includes('policiais') || t.includes('bombeiros')) return 'PCD_FILHOS_AGENTES';
  return 'OUTRA';
}

export const ROTULO_MODALIDADE = {
  AMPLA: 'Ampla concorrência',
  REDE_PUBLICA: 'Rede pública + carência',
  NEGROS_INDIGENAS: 'Negros, indígenas e quilombolas + carência',
  PCD_FILHOS_AGENTES: 'PcD ou filhos de agentes de segurança + carência',
  OUTRA: 'Outra modalidade'
};

/**
 * Interpreta as linhas de texto da lista. Função pura (testável sem PDF).
 * Devolve { itens, avisos }.
 */
export function interpretarLinhas(linhas) {
  const itens = [];
  const avisos = [];
  const vistos = new Set();
  let chamada = '';
  let turno = '';
  let modalidadeTexto = '';
  let buffer = [];

  for (const bruta of linhas) {
    const linha = String(bruta || '').replace(/\s+/g, ' ').trim();
    if (!linha) continue;

    const titulo = linha.match(LINHA_TITULO);
    if (titulo) {
      turno = titulo[1].toUpperCase();
      chamada = linha.split(/\s+-\s+Turno/i)[0].trim();
      buffer = [];
      continue;
    }
    if (LINHA_CABECALHO.test(linha)) {
      if (buffer.length) modalidadeTexto = buffer.join(' ');
      buffer = [];
      continue;
    }
    const cand = linha.match(LINHA_CANDIDATO);
    if (cand) {
      buffer = [];
      const inscricao = cand[4];
      if (vistos.has(inscricao)) {
        avisos.push(`Inscrição ${inscricao} aparece mais de uma vez; mantida a primeira.`);
        continue;
      }
      vistos.add(inscricao);
      itens.push({
        inscricao_enem: inscricao,
        nome: cand[2].trim().toUpperCase().slice(0, 150),
        nota: cand[3].replace(',', '.'),
        ordem: Number(cand[1]),
        turno: turno || 'NAO_INFORMADO',
        modalidade: codigoModalidade(modalidadeTexto),
        modalidade_texto: modalidadeTexto.slice(0, 300),
        chamada: chamada.slice(0, 120)
      });
      continue;
    }
    if (/\d{12}/.test(linha)) {
      avisos.push(`Linha não reconhecida (confira no PDF): "${linha.slice(0, 120)}"`);
      continue;
    }
    // Texto comum: título de modalidade (pode quebrar em mais de uma linha)
    buffer.push(linha);
  }
  if (!turno && itens.length) avisos.push('Turno não encontrado no título da lista.');
  return { itens, avisos };
}

// Extrai o texto do PDF linha a linha (agrupa os trechos pela altura na página)
export async function extrairLinhasPdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  try {
    if (doc.numPages > MAX_PAGINAS) throw new Error(`O PDF tem ${doc.numPages} páginas; o limite é ${MAX_PAGINAS}.`);
    const saida = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const linhas = [];
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const y = it.transform[5];
        let linha = linhas.find(l => Math.abs(l.y - y) <= 2);
        if (!linha) { linha = { y, partes: [] }; linhas.push(linha); }
        linha.partes.push({ x: it.transform[4], s: it.str.trim() });
      }
      linhas.sort((a, b) => b.y - a.y);
      for (const l of linhas) saida.push(l.partes.sort((a, b) => a.x - b.x).map(i => i.s).join(' '));
    }
    return saida;
  } finally {
    await doc.destroy();
  }
}

export async function lerListaConvocadosPdf(buffer) {
  if (!buffer || !buffer.length) throw new Error('Arquivo vazio.');
  if (buffer.slice(0, 5).toString('latin1') !== '%PDF-') throw new Error('O arquivo enviado não é um PDF.');
  const linhas = await extrairLinhasPdf(buffer);
  return interpretarLinhas(linhas);
}
