/**
 * Testes de integração da API (node:test, sem dependências extras).
 * Sobe o servidor real numa porta livre, com pastas de dados temporárias,
 * e confere cada correção de segurança do relatório (M001...).
 * Rodar: npm test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORTA}`;
let servidor;
let pastaTemp;
const senhasIniciais = {};

// Gera um CPF válido (dígitos verificadores pelo módulo 11)
function gerarCpf(base9) {
  const d = base9.split('').map(Number);
  const dv = (arr) => {
    const soma = arr.reduce((s, n, i) => s + n * (arr.length + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  d.push(dv(d));
  d.push(dv(d));
  const s = d.join('');
  return `${s.slice(0, 3)}.${s.slice(3, 6)}.${s.slice(6, 9)}-${s.slice(9)}`;
}

async function api(metodo, caminho, { corpo, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(BASE + caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  let dados = null;
  try { dados = await r.json(); } catch { dados = null; }
  return { status: r.status, dados, headers: r.headers };
}

before(async () => {
  pastaTemp = mkdtempSync(join(tmpdir(), 'coruja-teste-'));
  copyFileSync(join(RAIZ, 'data', 'configuracoes.json'), join(pastaTemp, 'configuracoes.json'));
  copyFileSync(join(RAIZ, 'data', 'semestres.json'), join(pastaTemp, 'semestres.json'));
  servidor = spawn(process.execPath, ['server.js', '--port', String(PORTA)], {
    cwd: RAIZ,
    env: { ...process.env, NODE_ENV: 'test', DATA_DIR: pastaTemp, BACKUPS_DIR: join(pastaTemp, 'backups'), JWT_SECRET: 'x'.repeat(48), GEMINI_API_KEY: '', RENDER_EXTERNAL_URL: 'https://coruja-teste.onrender.com' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((ok, falha) => {
    const limite = setTimeout(() => falha(new Error('Servidor não iniciou')), 20000);
    servidor.stdout.on('data', (b) => {
      const txt = b.toString();
      for (const m of txt.matchAll(/•\s+(\w+):\s+(\S+)/g)) senhasIniciais[m[1]] = m[2];
      if (txt.includes('Servidor rodando')) { clearTimeout(limite); ok(); }
    });
  });
});

after(() => {
  servidor?.kill();
  try { rmSync(pastaTemp, { recursive: true, force: true }); } catch {}
});

const CPF_A = gerarCpf('529982247');
const CPF_B = gerarCpf('111444777');

test('M003: senha padrão antiga "faeterj2026" não entra mais como admin', async () => {
  const r = await api('POST', '/api/auth/login', { corpo: { login: 'admin', senha: 'faeterj2026' } });
  assert.equal(r.status, 401);
  assert.ok(senhasIniciais.admin, 'senha aleatória inicial deve ser exibida no console');
  const ok = await api('POST', '/api/auth/login', { corpo: { login: 'admin', senha: senhasIniciais.admin } });
  assert.equal(ok.status, 200);
  assert.equal(ok.dados.tipo, 'ADMIN');
});

test('M004/M006: identificação do candidato cria conta e confere senha', async () => {
  const curta = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: CPF_A, senha: '123' } });
  assert.equal(curta.status, 400);
  const novo = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: CPF_A, senha: 'senhaDoA#1' } });
  assert.equal(novo.status, 201);
  assert.ok(novo.dados.token);
  const errada = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: CPF_A, senha: 'outraSenha' } });
  assert.equal(errada.status, 401);
  const invalido = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: '123.456.789-00', senha: 'qualquer1' } });
  assert.equal(invalido.status, 400);
});

test('M006: cadastro não sobrescreve conta existente e login não cria conta', async () => {
  const r = await api('POST', '/api/auth/aluno/cadastro', { corpo: { cpf: CPF_A, email: 'x@exemplo.com', senha: 'invasor123' } });
  assert.equal(r.status, 409);
  const l = await api('POST', '/api/auth/login', { corpo: { login: CPF_B, senha: 'qualquer123' } });
  assert.equal(l.status, 401);
});

test('M001: token de candidato não acessa rotas da equipe', async () => {
  const { dados } = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: CPF_A, senha: 'senhaDoA#1' } });
  for (const rota of ['/api/usuarios', '/api/matriculas', '/api/logs', '/api/auditoria/painel', '/api/database/status']) {
    const r = await api('GET', rota, { token: dados.token });
    assert.ok([401, 403].includes(r.status), `${rota} respondeu ${r.status}`);
  }
});

test('M002: recuperação de senha não devolve o código e não revela se a conta existe', async () => {
  const existe = await api('POST', '/api/auth/esqueci-senha', { corpo: { email: 'admin' } });
  const naoExiste = await api('POST', '/api/auth/esqueci-senha', { corpo: { email: 'ninguem@exemplo.com' } });
  assert.equal(existe.status, 200);
  assert.equal(existe.dados.codigo_verificacao, undefined);
  assert.deepEqual(existe.dados, naoExiste.dados);
});

test('M004: rotas do candidato exigem token e só acessam o próprio CPF', async () => {
  const semToken = await api('GET', `/api/candidatos/ficha-cadastral/${encodeURIComponent(CPF_A)}`);
  assert.equal(semToken.status, 401);
  const docsSemToken = await api('GET', `/api/candidato/documentos?cpf=${encodeURIComponent(CPF_A)}`);
  assert.equal(docsSemToken.status, 401);
  const delSemToken = await api('DELETE', `/api/candidato/documentos/doc1?cpf=${encodeURIComponent(CPF_A)}`);
  assert.equal(delSemToken.status, 401);

  const b = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: CPF_B, senha: 'senhaDoB#1' } });
  const fichaAlheia = await api('GET', `/api/candidatos/ficha-cadastral/${encodeURIComponent(CPF_A)}`, { token: b.dados.token });
  assert.equal(fichaAlheia.status, 403);
});

test('Upload: rejeita arquivo que não é PDF/imagem', async () => {
  const a = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: CPF_A, senha: 'senhaDoA#1' } });
  const r = await api('POST', '/api/candidato/documentos', {
    token: a.dados.token,
    corpo: { documento: { nome_documento: 'x', arquivo_url: 'data:text/html;base64,PHNjcmlwdD4=' } }
  });
  assert.equal(r.status, 415);
});

test('M008/M005: matrícula ignora status enviado e consulta pública exige CPF + protocolo', async () => {
  const a = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: CPF_A, senha: 'senhaDoA#1' } });
  const ficha = {
    nome_completo: 'MARIA DA SILVA TESTE', cpf: CPF_A, email: 'maria@exemplo.com', telefone: '(21) 98888-7777',
    data_nascimento: '10/05/2000', status: 'Deferida', protocolo: 'MAT-FALSO-1'
  };
  const outraPessoa = await api('POST', '/api/matriculas', { token: a.dados.token, corpo: { ...ficha, cpf: CPF_B } });
  assert.equal(outraPessoa.status, 403);

  const m = await api('POST', '/api/matriculas', { token: a.dados.token, corpo: ficha });
  assert.equal(m.status, 201, JSON.stringify(m.dados));
  assert.equal(m.dados.matricula.status, 'Confirmada');
  assert.notEqual(m.dados.protocolo, 'MAT-FALSO-1');

  const soCpf = await api('GET', `/api/public/matricula-consulta?cpf=${encodeURIComponent(CPF_A)}`);
  assert.equal(soCpf.status, 400);
  const porNome = await api('GET', '/api/public/matricula-consulta?busca=maria');
  assert.equal(porNome.status, 400);
  const certo = await api('GET', `/api/public/matricula-consulta?cpf=${encodeURIComponent(CPF_A)}&protocolo=${m.dados.protocolo}`);
  assert.equal(certo.status, 200);
  assert.equal(certo.dados.matricula.email, undefined, 'consulta pública não deve expor e-mail');

  // V1: reenvio agora exige o login do candidato (antes bastava CPF + protocolo)
  const semProva = await api('POST', '/api/public/reenviar-documentos-exigencia', { corpo: { cpf: CPF_A, documentos: [{ tipo: 'X' }] } });
  assert.equal(semProva.status, 401);
});

test('M038: troca de senha do candidato exige CPF + data de nascimento corretos', async () => {
  const rota = '/api/auth/aluno/redefinir-senha-nascimento';
  // CPF_A tem matrícula com nascimento 10/05/2000 (teste anterior)
  const dataErrada = await api('POST', rota, { corpo: { cpf: CPF_A, data_nascimento: '11/05/2000', nova_senha: 'novaSenha#9' } });
  assert.equal(dataErrada.status, 400);
  const cpfSemConta = await api('POST', rota, { corpo: { cpf: '111.444.777-35', data_nascimento: '10/05/2000', nova_senha: 'novaSenha#9' } });
  assert.equal(cpfSemConta.status, 400);
  assert.deepEqual(cpfSemConta.dados, dataErrada.dados, 'mesma resposta exista ou não a conta');

  const certo = await api('POST', rota, { corpo: { cpf: CPF_A, data_nascimento: '10/05/2000', nova_senha: 'novaSenha#9' } });
  assert.equal(certo.status, 200, JSON.stringify(certo.dados));
  const senhaVelha = await api('POST', '/api/auth/aluno/login', { corpo: { cpf: CPF_A, senha: 'senhaDoA#1' } });
  assert.equal(senhaVelha.status, 401);
  const senhaNova = await api('POST', '/api/auth/aluno/login', { corpo: { cpf: CPF_A, senha: 'novaSenha#9' } });
  assert.equal(senhaNova.status, 200);
  assert.ok(senhaNova.dados.matriculas_anteriores.length >= 1, 'login devolve a matrícula para a consulta');

  // Volta a senha original para os próximos testes
  const volta = await api('POST', rota, { corpo: { cpf: CPF_A, data_nascimento: '10/05/2000', nova_senha: 'senhaDoA#1' } });
  assert.equal(volta.status, 200);
});

test('M030: documentos anexados antes de finalizar não se perdem na matrícula', async () => {
  const cpf = gerarCpf('390533447');
  const a = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf, senha: 'senhaDoC#1' } });
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const doc = await api('POST', '/api/candidato/documentos', {
    token: a.dados.token,
    corpo: { documento: { nome_documento: 'Histórico', tipo: 'HISTORICO_ESCOLAR', arquivo_url: png } }
  });
  assert.equal(doc.status, 201);
  const m = await api('POST', '/api/matriculas', {
    token: a.dados.token,
    corpo: { nome_completo: 'JOSE DOS SANTOS TESTE', cpf, email: 'jose@exemplo.com', telefone: '21977776666', data_nascimento: '01/02/2001' }
  });
  assert.equal(m.status, 201, JSON.stringify(m.dados));
  assert.equal(m.dados.protocolo, doc.dados.protocolo, 'mantém o protocolo do pré-cadastro');
  const lista = await api('GET', '/api/candidato/documentos', { token: a.dados.token });
  assert.equal(lista.dados.documentos.length, 1);
});

test('M041: candidato edita a própria matrícula pelo "Verificar Matrícula" e mantém o protocolo', async () => {
  const cpf = gerarCpf('613428975');
  const a = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf, senha: 'senhaDoE#1' } });
  const ficha = { nome_completo: 'ANA PEREIRA TESTE', cpf, email: 'ana@exemplo.com', telefone: '21966665555', data_nascimento: '03/04/2002', turno: 'NOTURNO' };
  const m = await api('POST', '/api/matriculas', { token: a.dados.token, corpo: ficha });
  assert.equal(m.status, 201, JSON.stringify(m.dados));

  // Sem pedir edição continua proibido matricular duas vezes
  const dup = await api('POST', '/api/matriculas', { token: a.dados.token, corpo: ficha });
  assert.equal(dup.status, 409);

  const ed = await api('POST', '/api/matriculas', {
    token: a.dados.token,
    corpo: { ...ficha, edicao: true, turno: 'MATUTINO', email: 'ana.nova@exemplo.com', status: 'Deferida',
      documentos_pendentes: ['Certidão Nascimento/Casamento', 5, 'x'.repeat(200)] }
  });
  // Pendências vão para o comprovante: só texto, no máximo 120 caracteres cada
  assert.deepEqual(ed.dados.matricula.documentos_pendentes, ['Certidão Nascimento/Casamento', 'x'.repeat(120)]);
  assert.equal(ed.status, 200, JSON.stringify(ed.dados));
  assert.equal(ed.dados.editada, true);
  assert.equal(ed.dados.protocolo, m.dados.protocolo, 'edição mantém o protocolo');
  assert.equal(ed.dados.matricula.turno, 'MATUTINO');
  assert.equal(ed.dados.matricula.email, 'ana.nova@exemplo.com');
  assert.equal(ed.dados.matricula.status, 'Confirmada', 'candidato não muda o status');

  // Outro candidato não edita esta matrícula
  const b = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: CPF_B, senha: 'senhaDoB#1' } });
  const alheia = await api('POST', '/api/matriculas', { token: b.dados.token, corpo: { ...ficha, edicao: true } });
  assert.equal(alheia.status, 403);
});

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('V1: reenvio de documentos exige login, valida arquivo, só em exigência e não vaza dados', async () => {
  const cpf = gerarCpf('724519836');
  const a = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf, senha: 'senhaDoV1#1' } });
  const m = await api('POST', '/api/matriculas', {
    token: a.dados.token,
    corpo: { nome_completo: 'CARLA REENVIO TESTE', cpf, email: 'carla@exemplo.com', telefone: '21955554444', data_nascimento: '05/06/2001' }
  });
  assert.equal(m.status, 201, JSON.stringify(m.dados));
  const protocolo = m.dados.protocolo;
  const rota = '/api/public/reenviar-documentos-exigencia';
  const docOk = [{ tipo: 'CERTIDAO_CIVIL', arquivo_url: PNG_1PX }];

  const semToken = await api('POST', rota, { corpo: { cpf, protocolo, documentos: docOk } });
  assert.equal(semToken.status, 401, 'sem login');

  const b = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: CPF_B, senha: 'senhaDoB#1' } });
  const outroCpf = await api('POST', rota, { token: b.dados.token, corpo: { cpf, protocolo, documentos: docOk } });
  assert.equal(outroCpf.status, 403, 'token de outro candidato');

  const html = await api('POST', rota, { token: a.dados.token, corpo: { cpf, protocolo, documentos: [{ tipo: 'X', arquivo_url: 'data:text/html;base64,PHNjcmlwdD4=' }] } });
  assert.equal(html.status, 415, 'arquivo HTML');

  const confirmada = await api('POST', rota, { token: a.dados.token, corpo: { cpf, protocolo, documentos: docOk } });
  assert.equal(confirmada.status, 409, 'matrícula Confirmada não aceita reenvio');

  // Secretaria coloca a matrícula em exigência: agora o reenvio é aceito
  const adm = await api('POST', '/api/auth/login', { corpo: { login: 'admin', senha: senhasIniciais.admin } });
  const exig = await api('POST', `/api/matriculas/${m.dados.matricula.id}/deferimento`, { token: adm.dados.token, corpo: { status: 'Em Exigência', despacho: 'Falta certidão legível' } });
  assert.equal(exig.status, 200, JSON.stringify(exig.dados));

  const ok = await api('POST', rota, { token: a.dados.token, corpo: { cpf, protocolo, documentos: docOk } });
  assert.equal(ok.status, 200, JSON.stringify(ok.dados));
  assert.deepEqual(Object.keys(ok.dados).sort(), ['message', 'protocolo', 'status', 'total_reenviados']);
  assert.equal(ok.dados.total_reenviados, 1);
  const texto = JSON.stringify(ok.dados);
  assert.ok(!texto.includes('carla@exemplo.com') && !texto.includes('21955554444') && !texto.includes('base64'), 'resposta sem e-mail, telefone ou arquivos');
});

test('V2: com a lista da chamada, o 1º acesso exige inscrição do ENEM da lista, uma conta por inscrição; secretaria libera inscrição usada por outro', async () => {
  const intruso = gerarCpf('815372946');
  const dono = gerarCpf('926483157');
  const INSCRICAO = '251000000042';
  const arquivo = join(pastaTemp, 'convocados.json');
  writeFileSync(arquivo, JSON.stringify([{ inscricao_enem: INSCRICAO, nome: 'FULANO CONVOCADO TESTE', turno: 'NOTURNO', modalidade: 'AMPLA' }]));
  try {
    const janela = await api('GET', '/api/configuracoes/janela');
    assert.equal(janela.dados.exige_numero_inscricao, true);
    const semInscricao = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: intruso, senha: 'senhaQualquer#1' } });
    assert.equal(semInscricao.status, 400, 'sem inscrição');
    const fora = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: intruso, senha: 'senhaQualquer#1', numero_inscricao: '259999999999' } });
    assert.equal(fora.status, 403, 'inscrição fora da lista');
    const cadastroSemInscricao = await api('POST', '/api/auth/aluno/cadastro', { corpo: { cpf: intruso, email: 'x@exemplo.com', senha: 'senhaDoIntruso#1' } });
    assert.equal(cadastroSemInscricao.status, 400, 'rota de cadastro também confere a inscrição');

    // Intruso chega primeiro com a inscrição de outra pessoa (a lista é pública)
    const primeiro = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: intruso, senha: 'senhaPrimeira#1', numero_inscricao: '2510 0000 0042' } });
    assert.equal(primeiro.status, 201, JSON.stringify(primeiro.dados));
    assert.equal(primeiro.dados.aluno.nome, 'FULANO CONVOCADO TESTE', 'nome vem da lista');
    const segundo = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: dono, senha: 'senhaDoDono#1', numero_inscricao: INSCRICAO } });
    assert.equal(segundo.status, 409, 'inscrição já usada por outro CPF');

    // Secretaria vê o vínculo (CPF mascarado) e libera a inscrição
    const adm = await api('POST', '/api/auth/login', { corpo: { login: 'admin', senha: senhasIniciais.admin } });
    const lista = await api('GET', '/api/convocados', { token: adm.dados.token });
    assert.equal(lista.status, 200);
    assert.match(lista.dados.itens[0].conta.cpf, /^\*\*\*\.\d{3}\.\d{3}-\*\*$/);
    assert.equal(lista.dados.com_acesso, 1);
    const rota = `/api/convocados/${INSCRICAO}/liberar`;
    assert.equal((await api('POST', rota)).status, 401, 'sem login');
    assert.ok([401, 403].includes((await api('POST', rota, { token: primeiro.dados.token })).status), 'token de candidato');
    const liberou = await api('POST', rota, { token: adm.dados.token });
    assert.equal(liberou.status, 200, JSON.stringify(liberou.dados));

    // Sessão do intruso cai, a senha dele não entra, e o dono faz o 1º acesso
    assert.equal((await api('GET', '/api/auth/aluno/minha-matricula', { token: primeiro.dados.token })).status, 401, 'sessão antiga derrubada');
    assert.notEqual((await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: intruso, senha: 'senhaPrimeira#1' } })).status, 200, 'senha antiga não entra');
    const doDono = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: dono, senha: 'senhaDoDono#1', numero_inscricao: INSCRICAO } });
    assert.equal(doDono.status, 201, JSON.stringify(doDono.dados));
    assert.equal((await api('GET', '/api/auth/aluno/minha-matricula', { token: doDono.dados.token })).status, 200);
    const intrusoDeNovo = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: intruso, senha: 'senhaNova#1', numero_inscricao: INSCRICAO } });
    assert.equal(intrusoDeNovo.status, 409, 'intruso não retoma a inscrição');
  } finally {
    rmSync(arquivo, { force: true });
  }
});

// PDF mínimo com uma linha de texto por item (dados fictícios, no formato da lista da chamada)
function gerarPdfLista(linhas) {
  const esc = (s) => s.replace(/[()\\]/g, (m) => '\\' + m);
  let y = 800;
  const corpo = ['BT', '/F1 10 Tf'];
  for (const l of linhas) { corpo.push(`1 0 0 1 40 ${y} Tm (${esc(l)}) Tj`); y -= 16; }
  corpo.push('ET');
  const stream = corpo.join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(pdf, 'latin1')); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

async function enviarPdf(caminho, buffer, token, tipo = 'application/pdf') {
  const headers = { 'Content-Type': tipo };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(BASE + caminho, { method: 'POST', headers, body: buffer });
  let dados = null;
  try { dados = await r.json(); } catch { dados = null; }
  return { status: r.status, dados };
}

test('Convocados: secretaria importa o PDF da chamada (prévia, salvar, adicionar); candidato e PDF inválido são recusados', async () => {
  const arquivo = join(pastaTemp, 'convocados.json');
  const pdf = gerarPdfLista([
    '1a Chamada - 1o semestre 2026 - Turno MATUTINO - FAETERJ-Rio',
    'Ampla concorrência',
    'ORDEM NOME DO CANDIDATO NOTA INSCRIÇÃO DO ENEM',
    '1 ALUNO FICTICIO UM 650,10 250000000101',
    'Candidatos que tenham cursado na rede pública todo o ensino médio e com comprovação de carência socioeconômica',
    'ORDEM NOME DO CANDIDATO NOTA INSCRIÇÃO DO ENEM',
    '1 ALUNA FICTICIA DOIS 612,40 250000000102',
    '1a Chamada - 1o semestre 2026 - Turno NOTURNO - FAETERJ-Rio',
    'Ampla concorrência',
    'ORDEM NOME DO CANDIDATO NOTA INSCRIÇÃO DO ENEM',
    '1 ALUNO FICTICIO TRES 640,00 250000000103'
  ]);
  try {
    const adm = await api('POST', '/api/auth/login', { corpo: { login: 'admin', senha: senhasIniciais.admin } });
    const aluno = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: gerarCpf('364829175'), senha: 'senhaAluno#1' } });
    assert.ok([401, 403].includes((await enviarPdf('/api/convocados', pdf, aluno.dados.token)).status), 'candidato não importa lista');
    assert.equal((await enviarPdf('/api/convocados/previa', pdf)).status, 401, 'sem login');

    const previa = await enviarPdf('/api/convocados/previa', pdf, adm.dados.token);
    assert.equal(previa.status, 200, JSON.stringify(previa.dados));
    assert.equal(previa.dados.resumo.total, 3);
    assert.deepEqual(previa.dados.resumo.por_turno, { MATUTINO: 2, NOTURNO: 1 });
    assert.equal(previa.dados.itens[1].modalidade, 'REDE_PUBLICA');
    assert.equal((await api('GET', '/api/convocados', { token: adm.dados.token })).dados.existe, false, 'prévia não salva');

    const falso = await enviarPdf('/api/convocados/previa', Buffer.from('isto não é um pdf'), adm.dados.token);
    assert.equal(falso.status, 400);

    const salvo = await enviarPdf('/api/convocados?modo=substituir', pdf, adm.dados.token);
    assert.equal(salvo.status, 201, JSON.stringify(salvo.dados));
    assert.equal(salvo.dados.total, 3);

    const outra = gerarPdfLista([
      '2a Chamada - 1o semestre 2026 - Turno NOTURNO - FAETERJ-Rio',
      'Ampla concorrência',
      'ORDEM NOME DO CANDIDATO NOTA INSCRIÇÃO DO ENEM',
      '1 ALUNO FICTICIO TRES 640,00 250000000103',
      '2 ALUNA FICTICIA QUATRO 630,00 250000000104'
    ]);
    const somou = await enviarPdf('/api/convocados?modo=adicionar', outra, adm.dados.token);
    assert.equal(somou.status, 201);
    assert.equal(somou.dados.novos, 1);
    assert.equal(somou.dados.total, 4);
    const lista = await api('GET', '/api/convocados', { token: adm.dados.token });
    assert.equal(lista.dados.itens.length, 4);
  } finally {
    rmSync(arquivo, { force: true });
  }
});

test('V3/V6: troca de senha por nascimento bloqueia o CPF após 5 erros e derruba a sessão antiga', async () => {
  const cpf = gerarCpf('437261985');
  const a = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf, senha: 'senhaDoV3#1' } });
  await api('POST', '/api/matriculas', {
    token: a.dados.token,
    corpo: { nome_completo: 'DANIEL SENHA TESTE', cpf, email: 'daniel@exemplo.com', telefone: '21944443333', data_nascimento: '20/07/2002' }
  });
  const rota = '/api/auth/aluno/redefinir-senha-nascimento';

  // V6: troca bem-sucedida derruba o login anterior
  const troca = await api('POST', rota, { corpo: { cpf, data_nascimento: '20/07/2002', nova_senha: 'senhaNova#V3' } });
  assert.equal(troca.status, 200, JSON.stringify(troca.dados));
  assert.equal((await api('GET', '/api/auth/aluno/minha-matricula', { token: a.dados.token })).status, 401, 'token antigo não vale mais');
  const novo = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf, senha: 'senhaNova#V3' } });
  assert.equal((await api('GET', '/api/auth/aluno/minha-matricula', { token: novo.dados.token })).status, 200);
  assert.equal(JSON.stringify(novo.dados).includes('senha_hash'), false);

  // V3: 5 erros para o mesmo CPF bloqueiam; a 6ª tentativa é recusada mesmo com a data certa
  for (let i = 0; i < 5; i++) {
    const errado = await api('POST', rota, { corpo: { cpf, data_nascimento: `0${i + 1}/01/1990`, nova_senha: 'outraSenha#9' } });
    assert.equal(errado.status, 400, `tentativa ${i + 1}`);
  }
  const sexta = await api('POST', rota, { corpo: { cpf, data_nascimento: '20/07/2002', nova_senha: 'outraSenha#9' } });
  assert.equal(sexta.status, 429, 'CPF bloqueado por 1 hora');

  // minha-matricula não devolve o hash da senha
  const minha = await api('GET', '/api/auth/aluno/minha-matricula', { token: novo.dados.token });
  assert.equal(JSON.stringify(minha.dados).includes('senha_hash'), false, 'resposta sem senha_hash');
});

test('V4: anexos têm limite por tipo de documento e tipo desconhecido é recusado', async () => {
  const cpf = gerarCpf('358162947');
  const a = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf, senha: 'senhaDoV4#1' } });
  const enviar = (tipo) => api('POST', '/api/candidato/documentos', { token: a.dados.token, corpo: { documento: { nome_documento: tipo, tipo, arquivo_url: PNG_1PX } } });

  assert.equal((await enviar('FOTO_3X4')).status, 201);
  assert.equal((await enviar('FOTO_3X4')).status, 409, '2ª foto 3x4');
  assert.equal((await enviar('RG_CPF')).status, 201);
  assert.equal((await enviar('RG_CPF')).status, 201);
  assert.equal((await enviar('RG_CPF')).status, 409, '3º arquivo de RG/CPF');
  assert.equal((await enviar('TIPO_QUE_NAO_EXISTE')).status, 400, 'tipo desconhecido');
  for (let i = 0; i < 5; i++) assert.equal((await enviar('HISTORICO_ESCOLAR')).status, 201, `histórico ${i + 1}`);
  assert.equal((await enviar('HISTORICO_ESCOLAR')).status, 409, '6º histórico');
  const lista = await api('GET', '/api/candidato/documentos', { token: a.dados.token });
  assert.equal(lista.dados.documentos.length, 8, 'só os aceitos foram gravados');
});

test('V5: consulta pública bloqueia depois de 10 erros e protocolo novo é longo', async () => {
  const cpf = gerarCpf('549271638');
  const a = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf, senha: 'senhaDoV5#1' } });
  const m = await api('POST', '/api/matriculas', {
    token: a.dados.token,
    corpo: { nome_completo: 'ELISA PROTOCOLO TESTE', cpf, email: 'elisa@exemplo.com', telefone: '21933332222', data_nascimento: '09/09/2000' }
  });
  assert.match(m.dados.protocolo, /^MAT-\d{4}-[0-9A-F]{12}$/, 'protocolo com 12 caracteres aleatórios');

  let bloqueouEm = null;
  for (let i = 1; i <= 11; i++) {
    const r = await api('GET', `/api/public/matricula-consulta?cpf=${encodeURIComponent(cpf)}&protocolo=MAT-2026-${10000 + i}`);
    if (r.status === 429) { bloqueouEm = i; break; }
    assert.equal(r.status, 404, `tentativa ${i}`);
  }
  assert.ok(bloqueouEm !== null && bloqueouEm <= 11, 'a 11ª consulta errada (ou antes) é bloqueada');
});

test('V12: campo com tipo errado (objeto no lugar de texto) recebe 400, não 500', async () => {
  const login = await api('POST', '/api/auth/login', { corpo: { login: { $gt: '' }, senha: { $gt: '' } } });
  assert.equal(login.status, 400, 'login da equipe');
  const loginAluno = await api('POST', '/api/auth/aluno/login', { corpo: { cpf: { $ne: null }, senha: 'x' } });
  assert.equal(loginAluno.status, 400, 'login do candidato');
  const acesso = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: CPF_A, senha: { $ne: null } } });
  assert.equal(acesso.status, 400, 'acesso com senha objeto');
  const esqueci = await api('POST', '/api/auth/esqueci-senha', { corpo: { login: ['admin'] } });
  assert.equal(esqueci.status, 400, 'esqueci-senha com lista');

  // Rotas de documento da equipe: matrícula inexistente e arquivo inválido não viram 500
  const adm = await api('POST', '/api/auth/login', { corpo: { login: 'admin', senha: senhasIniciais.admin } });
  const semMatricula = await api('POST', '/api/matriculas/999999/documentos', { token: adm.dados.token, corpo: { tipo: 'RG_CPF', arquivo_url: PNG_1PX } });
  assert.equal(semMatricula.status, 404);
  const apagarSemMatricula = await api('DELETE', '/api/matriculas/999999/documentos/1', { token: adm.dados.token });
  assert.equal(apagarSemMatricula.status, 404);
});

test('V13/V11: backup funciona sem expor detalhe interno e cabeçalho Permissions-Policy presente', async () => {
  const adm = await api('POST', '/api/auth/login', { corpo: { login: 'admin', senha: senhasIniciais.admin } });
  const b = await api('POST', '/api/backup/executar', { token: adm.dados.token });
  const texto = JSON.stringify(b.dados);
  assert.ok(!/is not a function|archiver/i.test(texto), 'sem nome de biblioteca nem erro interno');
  assert.equal(b.status, 201, texto);
  assert.equal(b.dados.backup.caminho, undefined, 'sem caminho do servidor na resposta');

  const r = await fetch(BASE + '/');
  const pp = r.headers.get('permissions-policy') || '';
  assert.match(pp, /camera=\(self\)/);
  assert.match(pp, /microphone=\(\)/);
  assert.match(pp, /geolocation=\(\)/);
});

test('V8: páginas não carregam mais Tailwind, Font Awesome nem SheetJS de CDN', async () => {
  const csp = (await fetch(BASE + '/')).headers.get('content-security-policy') || '';
  for (const origem of ['cdn.tailwindcss.com', 'cdn.sheetjs.com', 'cdnjs.cloudflare.com']) {
    assert.ok(!csp.includes(origem), `CSP ainda libera ${origem}`);
  }
  for (const pagina of ['/', '/login.html']) {
    const html = await (await fetch(BASE + pagina)).text();
    assert.ok(!/cdn\.tailwindcss\.com|cdn\.sheetjs\.com|cdnjs\.cloudflare\.com/.test(html), `${pagina} ainda usa CDN`);
  }
  for (const arquivo of ['/tailwind.css', '/tailwind-login.css', '/vendor/fontawesome/css/all.min.css', '/vendor/fontawesome/webfonts/fa-solid-900.woff2']) {
    assert.equal((await fetch(BASE + arquivo)).status, 200, `${arquivo} não é servido`);
  }
});

test('CORS: aceita o endereço do Render (RENDER_EXTERNAL_URL) e recusa site desconhecido', async () => {
  const pedir = (origem) => fetch(BASE + '/api/configuracoes/janela', { headers: { Origin: origem } });
  const render = await pedir('https://coruja-teste.onrender.com');
  assert.equal(render.status, 200);
  assert.equal(render.headers.get('access-control-allow-origin'), 'https://coruja-teste.onrender.com');
  const estranho = await pedir('https://site-qualquer.example');
  assert.equal(estranho.headers.get('access-control-allow-origin'), null, 'site desconhecido não recebe liberação');
});

test('NIS: matrícula por cota exige NIS válido do CadÚnico; ampla concorrência não exige', async () => {
  const cpf = gerarCpf('681539247');
  const a = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf, senha: 'senhaDoNis#1' } });
  const ficha = { nome_completo: 'FABIO COTA TESTE', cpf, email: 'fabio@exemplo.com', telefone: '21922221111', data_nascimento: '11/11/2001', forma_ingresso_cota: 'Rede Pública' };
  const semNis = await api('POST', '/api/matriculas', { token: a.dados.token, corpo: ficha });
  assert.equal(semNis.status, 400, 'cota sem NIS');
  const zeros = await api('POST', '/api/matriculas', { token: a.dados.token, corpo: { ...ficha, cad_unico_nis: '00000000000' } });
  assert.equal(zeros.status, 400, 'NIS de zeros');
  const dvErrado = await api('POST', '/api/matriculas', { token: a.dados.token, corpo: { ...ficha, cad_unico_nis: '12345678901' } });
  assert.equal(dvErrado.status, 400, 'NIS com dígito verificador errado');
  const ok = await api('POST', '/api/matriculas', { token: a.dados.token, corpo: { ...ficha, cad_unico_nis: '123.45678.90-0' } });
  assert.equal(ok.status, 201, JSON.stringify(ok.dados));
  assert.equal(ok.dados.matricula.cad_unico_nis, '12345678900', 'NIS gravado só com dígitos');

  const cpf2 = gerarCpf('792641358');
  const b = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf: cpf2, senha: 'senhaDoNis#2' } });
  const ampla = await api('POST', '/api/matriculas', { token: b.dados.token, corpo: { ...ficha, cpf: cpf2, forma_ingresso_cota: 'AMPLA CONCORRÊNCIA' } });
  assert.equal(ampla.status, 201, 'ampla concorrência sem NIS');
});

test('M040: anexo do candidato acima de 8MB é recusado', async () => {
  const cpf = gerarCpf('512837461');
  const a = await api('POST', '/api/auth/aluno/acesso', { corpo: { cpf, senha: 'senhaDoD#1' } });
  // 9MB de dados viram ~12MB em base64
  const grande = 'data:application/pdf;base64,' + Buffer.alloc(9 * 1024 * 1024).toString('base64');
  const r = await api('POST', '/api/candidato/documentos', {
    token: a.dados.token,
    corpo: { documento: { nome_documento: 'Certidão', tipo: 'CERTIDAO_CIVIL', arquivo_url: grande } }
  });
  assert.equal(r.status, 413);
  assert.match(r.dados.error, /8MB/);
});

test('M011: leitura por IA exige identificação', async () => {
  const r = await api('POST', '/api/ia/extrair-documentos', { corpo: { files: [{ data: 'data:image/png;base64,AAAA' }] } });
  assert.equal(r.status, 401);
});

test('M010: perfil sem poder de administrador não cria usuários', async () => {
  const login = await api('POST', '/api/auth/login', { corpo: { login: 'atendimento', senha: senhasIniciais.atendimento } });
  assert.equal(login.status, 200);
  const r = await api('POST', '/api/usuarios', { token: login.dados.token, corpo: { login: 'novo', nome: 'Novo', senha: 'SenhaForte#2026', cargo: 'Super Administrador' } });
  assert.equal(r.status, 403);
});

test('M017: cabeçalho Content-Security-Policy presente', async () => {
  const r = await fetch(BASE + '/');
  assert.match(r.headers.get('content-security-policy') || '', /default-src 'self'/);
});
