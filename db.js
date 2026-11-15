import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

dotenv.config();

const { Pool } = pg;

// Pasta de dados relativa a este arquivo (antes dependia da pasta de onde o comando era executado)
const DATA_DIR = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const JSON_FILE = path.join(DATA_DIR, 'matriculas.json');
const USERS_FILE = path.join(DATA_DIR, 'usuarios.json');
const ALUNOS_AUTH_FILE = path.join(DATA_DIR, 'alunos_auth.json');
const SEMESTRES_FILE = path.join(DATA_DIR, 'semestres.json');
const LOGS_FILE = path.join(DATA_DIR, 'audit_logs.json');
const CANDIDATOS_FILE = path.join(DATA_DIR, 'candidatos.json');
const CONFIGURACOES_FILE = path.join(DATA_DIR, 'configuracoes.json');
// V2: lista oficial de convocados (inscrição do ENEM, nome, turno, modalidade), importada pela
// secretaria a partir do PDF da chamada. Contém dados pessoais: fica fora do Git (ver .gitignore).
const CONVOCADOS_FILE = path.join(DATA_DIR, 'convocados.json');

// Ensure data directory exists for JSON fallback
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let pool = null;
let usePostgres = false;

// V7: TLS da conexão com o PostgreSQL. Antes, em produção, o certificado do banco nunca era
// conferido (rejectUnauthorized: false): quem estivesse no caminho podia se passar pelo banco.
// Agora confere por padrão, aceita o CA do provedor em DATABASE_CA_CERT e só desliga a
// conferência se DATABASE_SSL_INSECURE=1 for definido de propósito.
export function opcoesSslPostgres(env = process.env) {
  if (env.NODE_ENV !== 'production') return false;
  if (env.DATABASE_SSL_INSECURE === '1') return { rejectUnauthorized: false };
  return { rejectUnauthorized: true, ca: env.DATABASE_CA_CERT || undefined };
}

// Check if PostgreSQL URL is available
if (process.env.DATABASE_URL) {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL_INSECURE === '1') {
      console.warn('⚠️ [DB] DATABASE_SSL_INSECURE=1: o certificado do PostgreSQL NÃO está sendo conferido. Use só temporariamente.');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: opcoesSslPostgres(),
      connectionTimeoutMillis: 5000
    });
    usePostgres = true;
    console.log('✅ [DB] Conectado ao PostgreSQL.');
  } catch (err) {
    console.warn('⚠️ [DB] Falha ao configurar PostgreSQL, utilizando fallback JSON local.', err.message);
    usePostgres = false;
  }
} else {
  console.log('ℹ️ [DB] DATABASE_URL não definida. Operando em modo Fallback JSON local.');
}

// Helper for reading JSON file
function readJson(filePath, defaultValue = []) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf-8');
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error(`Erro ao ler ${filePath}:`, err);
    return defaultValue;
  }
}

// Helper for writing JSON file atomically
function writeJson(filePath, data) {
  try {
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      return true;
    } catch (fallbackErr) {
      console.error(`Erro ao gravar em ${filePath}:`, fallbackErr);
      return false;
    }
  }
}

// Hash "inutilizável" para contas criadas sem senha: vem de bytes aleatórios descartados,
// então ninguém consegue entrar até definir a senha. Antes era o hash público de 'faeterj2026'.
const DEFAULT_HASH = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);

/**
 * Initialize Database Tables / JSON Seed
 */
export async function initDB() {
  if (usePostgres && pool) {
    try {
      const client = await pool.connect();
      try {
        console.log('✅ [DB] Conectado com sucesso ao PostgreSQL.');
        await client.query(`
          CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            login VARCHAR(100) UNIQUE NOT NULL,
            nome VARCHAR(255) NOT NULL,
            senha_hash VARCHAR(255) NOT NULL,
            cargo VARCHAR(100) DEFAULT 'Administrador',
            criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS alunos_auth (
            id SERIAL PRIMARY KEY,
            cpf VARCHAR(20) UNIQUE NOT NULL,
            cpf_clean VARCHAR(20) NOT NULL,
            email VARCHAR(255) NOT NULL,
            nome VARCHAR(255) NOT NULL,
            telefone VARCHAR(50),
            senha_hash VARCHAR(255),
            ultimo_acesso TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
          ALTER TABLE alunos_auth ADD COLUMN IF NOT EXISTS senha_hash VARCHAR(255);
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS candidatos (
            id SERIAL PRIMARY KEY,
            cpf VARCHAR(20) UNIQUE NOT NULL,
            cpf_clean VARCHAR(20) NOT NULL,
            nome_completo VARCHAR(255) NOT NULL,
            email VARCHAR(255),
            telefone VARCHAR(50),
            curso VARCHAR(150),
            turno VARCHAR(50),
            semestre VARCHAR(20) DEFAULT '2026.1',
            status VARCHAR(50) DEFAULT 'Inscrito',
            forma_ingresso VARCHAR(100),
            cota VARCHAR(100),
            protocolo VARCHAR(50),
            motivo_desistencia TEXT,
            historico_status JSONB DEFAULT '[]'::jsonb,
            criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS matriculas (
            id SERIAL PRIMARY KEY,
            protocolo VARCHAR(50) UNIQUE NOT NULL,
            semestre VARCHAR(20) DEFAULT '2026.1',
            curso VARCHAR(150) NOT NULL,
            ue VARCHAR(100) DEFAULT 'FAETERJ-Rio (Quintino)',
            matricula_desup VARCHAR(50),
            nome_completo VARCHAR(255) NOT NULL,
            nome_social VARCHAR(255),
            cpf VARCHAR(20) NOT NULL,
            cpf_data_emissao VARCHAR(20),
            cpf_orgao VARCHAR(50),
            data_nascimento VARCHAR(20) NOT NULL,
            data_matricula VARCHAR(20),
            ano_ingresso VARCHAR(10),
            ingresso_codigo VARCHAR(20),
            semestre_periodo VARCHAR(20),
            sexo VARCHAR(50),
            turno VARCHAR(50) NOT NULL,
            cor_raca VARCHAR(50),
            estado_civil VARCHAR(50),
            estado_civil_outro VARCHAR(100),
            necessidades_especiais BOOLEAN DEFAULT FALSE,
            pcd BOOLEAN DEFAULT FALSE,
            tipo_deficiencia VARCHAR(150),
            tipo_deficiencia_outro VARCHAR(150),
            forma_ingresso_cota VARCHAR(100),
            forma_ingresso VARCHAR(100) NOT NULL,
            sistema_concorrencia VARCHAR(100) DEFAULT 'Ampla Concorrência',
            etapa_tipo VARCHAR(50),
            etapa_reclassificacao_numero VARCHAR(50),
            nota_candidato VARCHAR(50),
            ordem_classificacao VARCHAR(50),
            nome_mae VARCHAR(255) NOT NULL,
            nome_pai VARCHAR(255),
            email VARCHAR(255) NOT NULL,
            email_faeterj VARCHAR(255),
            telefone VARCHAR(50) NOT NULL,
            telefone_fixo VARCHAR(50),
            telefone_cel VARCHAR(50),
            cep VARCHAR(20) NOT NULL,
            logradouro VARCHAR(255) NOT NULL,
            numero VARCHAR(50) NOT NULL,
            complemento VARCHAR(100),
            bairro VARCHAR(150) NOT NULL,
            cidade VARCHAR(150) NOT NULL,
            uf VARCHAR(10) NOT NULL,
            naturalidade_municipio_uf VARCHAR(150),
            nacionalidade VARCHAR(100) DEFAULT 'Brasileira',
            rg_numero VARCHAR(50),
            rg_data_emissao VARCHAR(20),
            rg_orgao VARCHAR(50),
            rg_uf VARCHAR(10),
            titulo_eleitor VARCHAR(50),
            titulo_zona VARCHAR(20),
            titulo_secao VARCHAR(20),
            titulo_emissao VARCHAR(20),
            certificado_militar VARCHAR(100),
            certidao_tipo VARCHAR(50),
            certidao_cartorio_municipio VARCHAR(150),
            certidao_numero VARCHAR(100),
            certidao_termo VARCHAR(50),
            certidao_livro VARCHAR(50),
            certidao_folha VARCHAR(50),
            certidao_cartorio VARCHAR(255),
            cad_unico_nis VARCHAR(50),
            responsavel_nome VARCHAR(255),
            responsavel_rg VARCHAR(50),
            ensino_medio_escola VARCHAR(255) NOT NULL,
            ensino_medio_modalidade VARCHAR(100),
            ensino_medio_tipo VARCHAR(50) NOT NULL,
            ensino_medio_ano VARCHAR(10) NOT NULL,
            ensino_medio_cidade VARCHAR(150),
            ensino_medio_uf VARCHAR(10),
            dados_academicos_tipo VARCHAR(50) DEFAULT 'VESTIBULAR',
            foto_3x4 TEXT,
            status VARCHAR(50) DEFAULT 'Pendente',
            observacoes TEXT,
            data_envio TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS semestres (
            id SERIAL PRIMARY KEY,
            codigo VARCHAR(20) UNIQUE NOT NULL,
            ano INT NOT NULL,
            periodo INT NOT NULL,
            data_inicio VARCHAR(20),
            data_fim VARCHAR(20),
            vagas_totais INT DEFAULT 120,
            ativo BOOLEAN DEFAULT FALSE,
            status VARCHAR(50) DEFAULT 'Aberto',
            criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
        await client.query(`
          CREATE TABLE IF NOT EXISTS audit_logs (
            id SERIAL PRIMARY KEY,
            acao VARCHAR(100) NOT NULL,
            tipo VARCHAR(50) NOT NULL,
            matricula_id VARCHAR(50),
            protocolo VARCHAR(50),
            aluno_nome VARCHAR(255),
            aluno_cpf VARCHAR(50),
            usuario_id INT,
            usuario_nome VARCHAR(255),
            usuario_login VARCHAR(100),
            usuario_cargo VARCHAR(100),
            ip VARCHAR(100),
            user_agent VARCHAR(255),
            detalhes TEXT,
            criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
          );
        `);
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn('⚠️ [DB] Erro no PostgreSQL, fallback para JSON:', err.message);
      usePostgres = false;
      await initJsonDB();
    }
  } else {
    await initJsonDB();
  }
}

async function initJsonDB() {
  const users = readJson(USERS_FILE, []);
  const defaultUsers = [
    { id: 1, login: 'admin', nome: 'Administrador Geral FAETERJ-Rio', cargo: 'Super Administrador' },
    { id: 2, login: 'secretaria', nome: 'Profª. Ana Exemplo (Secretaria)', cargo: 'Gestor da Secretaria Acadêmica' },
    { id: 3, login: 'coordenacao', nome: 'Prof. Carlos Exemplo (Coordenação)', cargo: 'Coordenador de Curso' },
    { id: 4, login: 'atendimento', nome: 'Equipe Atendimento & Balcão', cargo: 'Atendente de Secretaria' },
    { id: 5, login: 'auditoria', nome: 'Auditoria & Conformidade LGPD', cargo: 'Auditor Institucional' }
  ];
  let modified = false;
  const senhasGeradas = [];
  for (const defU of defaultUsers) {
    const exists = users.some(u => (u.login || '').toLowerCase() === defU.login.toLowerCase());
    if (!exists) {
      // Sem senha padrão conhecida: cada perfil recebe uma senha aleatória, mostrada uma única vez
      // no console da 1ª inicialização. Troque depois com: npm run definir-senha -- <login> <nova>
      const senhaInicial = crypto.randomBytes(9).toString('base64url');
      senhasGeradas.push(`${defU.login}: ${senhaInicial}`);
      const defaultHash = await bcrypt.hash(senhaInicial, 10);
      const newId = users.length > 0 ? Math.max(...users.map(u => u.id || 0)) + 1 : defU.id;
      users.push({
        id: newId,
        login: defU.login,
        nome: defU.nome,
        senha_hash: defaultHash,
        cargo: defU.cargo,
        criado_em: new Date().toISOString()
      });
      modified = true;
    }
  }
  if (modified) {
    writeJson(USERS_FILE, users);
    console.log('🔑 [DB] Perfis da equipe criados com senhas iniciais aleatórias (anote agora, não serão exibidas de novo):');
    senhasGeradas.forEach(l => console.log(`   • ${l}`));
  }
}

export function formatCpf(cpf) {
  const digits = String(cpf || '').replace(/\D/g, '').padStart(11, '0').slice(0, 11);
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

export function cleanCpfDigits(cpf) {
  return String(cpf || '').replace(/\D/g, '');
}

export async function findAlunoByCpf(cpf) {
  const clean = cleanCpfDigits(cpf);
  const alunos = readJson(ALUNOS_AUTH_FILE, []);
  return alunos.find(a => a.cpf_clean === clean || a.cpf === cpf) || null;
}

export async function findAlunoByEmail(email) {
  const normEmail = String(email || '').trim().toLowerCase();
  const alunos = readJson(ALUNOS_AUTH_FILE, []);
  return alunos.find(a => (a.email || '').trim().toLowerCase() === normEmail) || null;
}

export async function findAlunoById(id) {
  const alunos = readJson(ALUNOS_AUTH_FILE, []);
  return alunos.find(a => a.id === Number(id)) || null;
}

export async function findAlunoByLogin(loginInput) {
  if (!loginInput) return null;
  const raw = String(loginInput).trim();
  const cleanDigits = cleanCpfDigits(raw);
  const normEmail = raw.toLowerCase();
  if (cleanDigits.length >= 11) {
    const byCpf = await findAlunoByCpf(cleanDigits.slice(0, 11));
    if (byCpf) return byCpf;
  }
  if (normEmail.includes('@')) {
    const byEmail = await findAlunoByEmail(normEmail);
    if (byEmail) return byEmail;
  }
  if (cleanDigits.length > 0) {
    const byCpf = await findAlunoByCpf(cleanDigits);
    if (byCpf) return byCpf;
  }
  const alunos = await getAllAlunosAuth();
  const found = alunos.find(a => 
    (a.cpf_clean && a.cpf_clean === cleanDigits) ||
    (a.cpf && cleanCpfDigits(a.cpf) === cleanDigits) ||
    (a.email && a.email.trim().toLowerCase() === normEmail) ||
    (a.nome && a.nome.trim().toLowerCase() === raw.toLowerCase())
  );
  if (found) return found;
  return null;
}

export async function createOrUpdateAluno({ nome, cpf, email, telefone, senha, senha_hash }) {
  const cleanCpf = cleanCpfDigits(cpf);
  const formattedCpf = formatCpf(cpf);
  const normEmail = String(email || '').trim().toLowerCase();
  const cleanNome = String(nome || '').trim();
  const cleanTelefone = String(telefone || '').trim();
  let finalHash = senha_hash || null;
  if (!finalHash && senha) {
    try {
      finalHash = bcrypt.hashSync(String(senha), 10);
    } catch (e) {
      finalHash = DEFAULT_HASH;
    }
  }

  const alunos = readJson(ALUNOS_AUTH_FILE, []);
  let alIndex = alunos.findIndex(a => a.cpf_clean === cleanCpf || (a.cpf && cleanCpfDigits(a.cpf) === cleanCpf));
  if (alIndex >= 0) {
    const existing = alunos[alIndex];
    alunos[alIndex] = {
      ...existing,
      cpf: formattedCpf,
      cpf_clean: cleanCpf,
      nome: cleanNome || existing.nome || `CANDIDATO ${formattedCpf}`,
      email: normEmail || existing.email,
      telefone: cleanTelefone || existing.telefone,
      senha_hash: finalHash || existing.senha_hash || DEFAULT_HASH,
      ultimo_acesso: new Date().toISOString()
    };
    writeJson(ALUNOS_AUTH_FILE, alunos);
    try {
      await createOrUpdateUsuario({
        login: formattedCpf,
        nome: cleanNome || existing.nome || `CANDIDATO ${formattedCpf}`,
        senha_hash: finalHash || existing.senha_hash || DEFAULT_HASH,
        cargo: 'Candidato / Aluno',
        email: normEmail || existing.email || '',
        telefone: cleanTelefone || existing.telefone || '',
        cpf: formattedCpf
      });
    } catch (uErr) {}
    return alunos[alIndex];
  } else {
    const newId = alunos.length > 0 ? Math.max(...alunos.map(a => a.id || 0)) + 1 : 1;
    const newAluno = {
      id: newId,
      cpf: formattedCpf,
      cpf_clean: cleanCpf,
      email: normEmail,
      nome: cleanNome || `CANDIDATO ${formattedCpf}`,
      telefone: cleanTelefone,
      senha_hash: finalHash || DEFAULT_HASH,
      ultimo_acesso: new Date().toISOString(),
      criado_em: new Date().toISOString()
    };
    alunos.push(newAluno);
    writeJson(ALUNOS_AUTH_FILE, alunos);
    try {
      await createOrUpdateUsuario({
        login: formattedCpf,
        nome: cleanNome || `CANDIDATO ${formattedCpf}`,
        senha_hash: finalHash || DEFAULT_HASH,
        cargo: 'Candidato / Aluno',
        email: normEmail,
        telefone: cleanTelefone,
        cpf: formattedCpf
      });
    } catch (uErr) {}
    return newAluno;
  }
}

// V2: lê a lista de convocados a cada chamada (a secretaria pode trocar o arquivo sem reiniciar).
// Sem o arquivo devolve null (a conferência fica desligada). Não usa readJson, que criaria
// um arquivo vazio e bloquearia todo 1º acesso. Arquivo com erro vira lista vazia (falha fechada).
export function getListaConvocados() {
  if (!fs.existsSync(CONVOCADOS_FILE)) return null;
  try {
    const lista = JSON.parse(fs.readFileSync(CONVOCADOS_FILE, 'utf-8') || '[]');
    return Array.isArray(lista) ? lista : [];
  } catch (err) {
    console.error('❌ [DB] data/convocados.json com erro de formato. Nenhum 1º acesso será liberado até corrigir:', err.message);
    return [];
  }
}

// A lista vem do PDF da chamada (SISU): não tem CPF, a chave é a inscrição do ENEM.
const soDigitos = (v) => String(v === null || v === undefined ? '' : v).replace(/\D/g, '');

export function findConvocadoPorInscricao(inscricao) {
  const lista = getListaConvocados();
  if (lista === null) return { listaExiste: false, convocado: null };
  const alvo = soDigitos(inscricao);
  if (!alvo) return { listaExiste: true, convocado: null };
  return { listaExiste: true, convocado: lista.find(c => soDigitos(c && c.inscricao_enem) === alvo) || null };
}

// Conta de candidato já vinculada a esta inscrição (cada inscrição cria só uma conta)
export async function findAlunoPorInscricao(inscricao) {
  const alvo = soDigitos(inscricao);
  if (!alvo) return null;
  const alunos = readJson(ALUNOS_AUTH_FILE, []);
  return alunos.find(a => soDigitos(a.inscricao_enem) === alvo) || null;
}

// Salva a lista enviada pela secretaria. modo "adicionar" junta com a lista atual (chamadas
// seguintes); "substituir" troca tudo. Contas já criadas continuam valendo nos dois casos.
export function salvarListaConvocados(itens, modo = 'adicionar') {
  const atual = modo === 'substituir' ? [] : (getListaConvocados() || []);
  const porInscricao = new Map(atual.map(c => [soDigitos(c.inscricao_enem), c]));
  const agora = new Date().toISOString();
  let novos = 0;
  for (const item of itens) {
    const chave = soDigitos(item.inscricao_enem);
    if (!chave) continue;
    if (!porInscricao.has(chave)) novos += 1;
    porInscricao.set(chave, { ...porInscricao.get(chave), ...item, inscricao_enem: chave, importado_em: agora });
  }
  const lista = [...porInscricao.values()];
  writeJson(CONVOCADOS_FILE, lista);
  return { total: lista.length, novos };
}

// Atualiza campos de controle da conta do candidato (versão de sessão, liberação etc.)
export async function atualizarAluno(cpf, updates) {
  const clean = cleanCpfDigits(cpf);
  const alunos = readJson(ALUNOS_AUTH_FILE, []);
  const idx = alunos.findIndex(a => a.cpf_clean === clean || (a.cpf && cleanCpfDigits(a.cpf) === clean));
  if (idx < 0) return null;
  alunos[idx] = { ...alunos[idx], ...updates };
  writeJson(ALUNOS_AUTH_FILE, alunos);
  return alunos[idx];
}

// V6: muda a versão de sessão da conta; todo login (token) emitido antes deixa de valer
export async function incrementarVersaoSessaoAluno(cpf) {
  const aluno = await findAlunoByCpf(cpf);
  if (!aluno) return null;
  return atualizarAluno(cpf, { versao_sessao: (Number(aluno.versao_sessao) || 1) + 1 });
}

export async function incrementarVersaoSessaoUsuario(id) {
  const users = readJson(USERS_FILE, []);
  const idx = users.findIndex(u => Number(u.id) === Number(id));
  if (idx < 0) return null;
  users[idx] = { ...users[idx], versao_sessao: (Number(users[idx].versao_sessao) || 1) + 1 };
  writeJson(USERS_FILE, users);
  return users[idx].versao_sessao;
}

// V2: a secretaria "libera" um CPF tomado por outra pessoa. A conta não é apagada de propósito:
// apagar permitiria que a próxima conta reaproveitasse o mesmo id e o login antigo voltasse a valer.
// A senha vira inutilizável, as sessões caem e o próximo acesso conta como 1º acesso (com inscrição).
export async function liberarAcessoAluno(cpf) {
  const aluno = await findAlunoByCpf(cpf);
  if (!aluno) return null;
  await createOrUpdateAluno({ cpf, senha_hash: DEFAULT_HASH });
  return atualizarAluno(cpf, {
    versao_sessao: (Number(aluno.versao_sessao) || 1) + 1,
    // A inscrição do ENEM fica livre para o verdadeiro dono fazer o 1º acesso
    inscricao_enem: null,
    inscricao_enem_anterior: aluno.inscricao_enem || aluno.inscricao_enem_anterior || null,
    acesso_liberado_pela_secretaria: true,
    acesso_liberado_em: new Date().toISOString()
  });
}

export async function getMatriculasByAlunoCpf(cpf) {
  const clean = cleanCpfDigits(cpf);
  const allMatriculas = await getAllMatriculas();
  return allMatriculas.filter(m => cleanCpfDigits(m.cpf) === clean || m.cpf === cpf);
}

export async function getAllAlunosAuth() {
  return readJson(ALUNOS_AUTH_FILE, []);
}

export async function getAllUsuarios(includeHash = false) {
  const users = readJson(USERS_FILE, []);
  if (includeHash) return users;
  return users.map(({ senha_hash, ...rest }) => rest);
}

export async function createOrUpdateUsuario({
  login,
  nome,
  senha,
  senha_hash,
  cargo = 'Candidato / Aluno',
  email = '',
  telefone = '',
  cpf = ''
}) {
  const normLogin = String(login || cpf || email || '').trim();
  const cleanNome = String(nome || '').trim();
  const cleanCpf = cleanCpfDigits(cpf || login || '');
  const formattedCpf = cleanCpf.length === 11 ? formatCpf(cleanCpf) : (cpf || '');
  const normEmail = String(email || '').trim().toLowerCase();
  const cleanTelefone = String(telefone || '').trim();
  let finalHash = senha_hash;
  if (!finalHash && senha) {
    finalHash = await bcrypt.hash(senha, 10);
  }

  const users = readJson(USERS_FILE, []);
  const ehAluno = (c) => /aluno|candidato/i.test(String(c || ''));
  let idx = users.findIndex(u =>
    (u.login && u.login.toLowerCase() === normLogin.toLowerCase()) ||
    (cleanCpf.length === 11 && (u.cpf_clean === cleanCpf || (u.cpf && cleanCpfDigits(u.cpf) === cleanCpf))) ||
    (normEmail && u.email && u.email.toLowerCase() === normEmail)
  );
  // Proteção: a sincronização de um candidato nunca pode alterar uma conta da equipe
  // (antes, um candidato com o mesmo e-mail/CPF de um servidor sobrescrevia senha e cargo dele).
  if (idx >= 0 && ehAluno(cargo) && !ehAluno(users[idx].cargo)) {
    throw new Error('Conflito: dados do candidato coincidem com uma conta da equipe.');
  }
  if (idx >= 0) {
    users[idx] = {
      ...users[idx],
      login: users[idx].login || normLogin,
      nome: cleanNome || users[idx].nome,
      senha_hash: finalHash || users[idx].senha_hash,
      cargo: cargo || users[idx].cargo || 'Candidato / Aluno',
      email: normEmail || users[idx].email || '',
      telefone: cleanTelefone || users[idx].telefone || '',
      cpf: formattedCpf || users[idx].cpf || '',
      cpf_clean: cleanCpf || users[idx].cpf_clean || '',
      atualizado_em: new Date().toISOString()
    };
    writeJson(USERS_FILE, users);
    const { senha_hash: _, ...safeUser } = users[idx];
    return safeUser;
  } else {
    const nextId = users.length > 0 ? Math.max(...users.map(u => Number(u.id) || 0)) + 1 : 1;
    const newUser = {
      id: nextId,
      login: normLogin,
      nome: cleanNome,
      senha_hash: finalHash || DEFAULT_HASH,
      cargo: cargo,
      email: normEmail,
      telefone: cleanTelefone,
      cpf: formattedCpf,
      cpf_clean: cleanCpf,
      criado_em: new Date().toISOString()
    };
    users.push(newUser);
    writeJson(USERS_FILE, users);
    const { senha_hash: _, ...safeUser } = newUser;
    return safeUser;
  }
}

export async function deleteUsuario(id) {
  const numId = Number(id);
  if (numId === 1) {
    throw new Error('O usuário administrador principal (ID 1) não pode ser excluído.');
  }
  const users = readJson(USERS_FILE, []);
  const idx = users.findIndex(u => Number(u.id) === numId);
  if (idx >= 0) {
    const deleted = users.splice(idx, 1)[0];
    writeJson(USERS_FILE, users);
    return deleted;
  }
  return null;
}

export async function findUserByLogin(login) {
  const normLogin = String(login || '').trim().toLowerCase();
  const users = readJson(USERS_FILE, []);
  return users.find(u => 
    (u.login || '').trim().toLowerCase() === normLogin || 
    (u.email || '').trim().toLowerCase() === normLogin
  ) || null;
}

export async function findUserById(id) {
  const users = readJson(USERS_FILE, []);
  const u = users.find(u => u.id === Number(id));
  if (u) {
    const { senha_hash, ...rest } = u;
    return rest;
  }
  return null;
}

export async function getAllSemestres() {
  const semestres = readJson(SEMESTRES_FILE, []);
  const matriculas = readJson(JSON_FILE, []);
  return semestres.map(s => {
    const count = matriculas.filter(m => m.semestre === s.codigo).length;
    return { ...s, total_matriculas: count };
  }).sort((a, b) => (a.ano !== b.ano ? a.ano - b.ano : a.periodo - b.periodo));
}

export async function getSemestreAtivo() {
  const semestres = readJson(SEMESTRES_FILE, []);
  return semestres.find(s => s.ativo) || semestres[semestres.length - 1] || { codigo: '2026.1', ano: 2026, periodo: 1, ativo: true, status: 'Aberto' };
}

export async function createSemestre(data) {
  const codigo = data.codigo || `${data.ano}.${data.periodo}`;
  const ano = parseInt(data.ano, 10) || new Date().getFullYear();
  const periodo = parseInt(data.periodo, 10) || 1;
  const vagas = parseInt(data.vagas_totais, 10) || 120;
  const ativo = Boolean(data.ativo === true || data.ativo === 'true');
  const status = data.status || (ativo ? 'Aberto' : 'Planejado');
  const list = readJson(SEMESTRES_FILE, []);
  if (ativo) {
    list.forEach(s => s.ativo = false);
  }
  const nextId = list.length > 0 ? Math.max(...list.map(s => Number(s.id) || 0)) + 1 : 1;
  const newSem = {
    id: nextId,
    codigo,
    ano,
    periodo,
    data_inicio: data.data_inicio || null,
    data_fim: data.data_fim || null,
    vagas_totais: vagas,
    ativo,
    status,
    criado_em: new Date().toISOString()
  };
  list.push(newSem);
  writeJson(SEMESTRES_FILE, list);
  return newSem;
}

export async function setSemestreAtivo(id) {
  const list = readJson(SEMESTRES_FILE, []);
  let found = null;
  list.forEach(s => {
    if (String(s.id) === String(id) || s.codigo === String(id)) {
      s.ativo = true;
      s.status = 'Aberto';
      found = s;
    } else {
      s.ativo = false;
    }
  });
  writeJson(SEMESTRES_FILE, list);
  return found;
}

export async function deleteSemestre(id) {
  const list = readJson(SEMESTRES_FILE, []);
  const idx = list.findIndex(s => String(s.id) === String(id) || s.codigo === String(id));
  if (idx !== -1) {
    list.splice(idx, 1);
    writeJson(SEMESTRES_FILE, list);
    return true;
  }
  return false;
}

export async function getAllMatriculas(filtroSemestre = '') {
  let list = readJson(JSON_FILE, []);
  if (filtroSemestre && filtroSemestre !== 'todos') {
    list = list.filter(m => m.semestre === filtroSemestre);
  }
  return list.sort((a, b) => new Date(b.data_envio).getTime() - new Date(a.data_envio).getTime());
}

export async function getMatriculaById(id) {
  const list = readJson(JSON_FILE, []);
  return list.find(m => String(m.id) === String(id) || String(m.protocolo) === String(id)) || null;
}

export async function createMatricula(data) {
  const agora = new Date();
  // V5: 12 caracteres hexadecimais aleatórios (antes 5 dígitos = só 90 mil possibilidades).
  // Protocolos antigos continuam válidos: a busca compara o texto do protocolo como está.
  const sufixo = crypto.randomBytes(6).toString('hex').toUpperCase();
  const protocolo = data.protocolo || `MAT-${agora.getFullYear()}-${sufixo}`;
  const dataEnvio = data.data_envio || agora.toISOString();
  let semestre = data.semestre;
  if (!semestre) {
    const semAtivo = await getSemestreAtivo();
    semestre = semAtivo ? semAtivo.codigo : '2026.1';
  }
  const anoAtual = agora.getFullYear();
  const anoIngresso = data.ano_ingresso || String(anoAtual);
  const periodoSemestre = data.semestre_periodo || (semestre.includes('.2') ? 'Segundo' : 'Primeiro');
  const ingressoCodigo = data.ingresso_codigo || `${anoIngresso}-0${periodoSemestre === 'Segundo' ? '2' : '1'}`;
  const dataMatricula = data.data_matricula || agora.toLocaleDateString('pt-BR');

  const record = {
    ...data,
    protocolo,
    semestre,
    curso: data.curso || 'ANÁLISE E DESENVOLVIMENTO DE SISTEMAS',
    ue: data.ue || 'FAETERJ-Rio (Quintino)',
    matricula_desup: data.matricula_desup || '',
    data_matricula: dataMatricula,
    ano_ingresso: anoIngresso,
    ingresso_codigo: ingressoCodigo,
    semestre_periodo: periodoSemestre,
    sexo: data.sexo || 'Masculino',
    turno: data.turno || 'NOTURNO',
    cor_raca: data.cor_raca || 'Parda',
    estado_civil: data.estado_civil || 'Solteiro',
    estado_civil_outro: data.estado_civil_outro || '',
    necessidades_especiais: Boolean(data.necessidades_especiais === true || data.necessidades_especiais === 'true' || data.necessidades_especiais === 'Sim' || data.pcd),
    pcd: Boolean(data.pcd === true || data.pcd === 'true' || data.pcd === 'sim'),
    tipo_deficiencia: data.tipo_deficiencia || '',
    tipo_deficiencia_outro: data.tipo_deficiencia_outro || '',
    forma_ingresso_cota: data.forma_ingresso_cota || 'AMPLA CONCORRÊNCIA',
    forma_ingresso: data.forma_ingresso || 'Vestibular FAETEC',
    sistema_concorrencia: data.sistema_concorrencia || 'Ampla Concorrência',
    etapa_tipo: data.etapa_tipo || 'Classificação',
    etapa_reclassificacao_numero: data.etapa_reclassificacao_numero || '',
    nota_candidato: data.nota_candidato || '',
    ordem_classificacao: data.ordem_classificacao || '',
    telefone: data.telefone || data.telefone_cel || '',
    telefone_fixo: data.telefone_fixo || '',
    telefone_cel: data.telefone_cel || data.telefone || '',
    email: data.email || '',
    email_faeterj: data.email_faeterj || '',
    naturalidade_municipio_uf: data.naturalidade_municipio_uf || `${data.cidade || 'Rio de Janeiro'} / ${data.uf || 'RJ'}`,
    nacionalidade: data.nacionalidade || 'Brasileira',
    certidao_tipo: data.certidao_tipo || 'Nascimento',
    certidao_cartorio_municipio: data.certidao_cartorio_municipio || data.cidade || 'Rio de Janeiro',
    certidao_livro: data.certidao_livro || '',
    certidao_folha: data.certidao_folha || '',
    certidao_termo: data.certidao_termo || data.certidao_numero || '',
    cad_unico_nis: data.cad_unico_nis || '',
    responsavel_nome: data.responsavel_nome || '',
    responsavel_rg: data.responsavel_rg || '',
    responsavel_rg_orgao: data.responsavel_rg_orgao || '',
    responsavel_cpf: data.responsavel_cpf || '',
    certificado_militar_orgao: data.certificado_militar_orgao || '',
    ensino_medio_modalidade: data.ensino_medio_modalidade || 'Regular',
    dados_academicos_tipo: data.dados_academicos_tipo || (data.forma_ingresso?.includes('SISU') ? 'SISU' : 'VESTIBULAR'),
    foto_3x4: data.foto_3x4 || null,
    documentos_anexos: data.documentos_anexos
      ? (typeof data.documentos_anexos === 'string' ? data.documentos_anexos : JSON.stringify(data.documentos_anexos))
      : '[]',
    status: data.status || 'Confirmada',
    data_envio: dataEnvio
  };

  const list = readJson(JSON_FILE, []);
  const cleanNewCpf = cleanCpfDigits(record.cpf || '');
  const existingPreIdx = list.findIndex(m => {
    const c = cleanCpfDigits(m.cpf || '');
    return c === cleanNewCpf && (
      (m.status && m.status.includes('Pré-cadastro')) ||
      (m.status && m.status.includes('Pendente'))
    );
  });
  if (existingPreIdx >= 0) {
    // Completa o pré-cadastro preservando o protocolo e os documentos já anexados
    // (antes o '[]' padrão da nova ficha apagava os anexos enviados na etapa de upload)
    const anterior = list[existingPreIdx];
    const docsNovos = normalizarDocumentos(record.documentos_anexos);
    const docsAntigos = normalizarDocumentos(anterior.documentos_anexos);
    const updated = {
      ...anterior,
      ...record,
      id: anterior.id,
      protocolo: data.protocolo || anterior.protocolo || record.protocolo,
      documentos_anexos: JSON.stringify([...docsAntigos, ...docsNovos.filter(d => !docsAntigos.some(a => a.id === d.id))]),
      status: record.status || 'Confirmada',
      data_envio: dataEnvio
    };
    list[existingPreIdx] = updated;
    writeJson(JSON_FILE, list);
    return updated;
  }
  const nextId = list.length > 0 ? Math.max(...list.map(m => Number(m.id) || 0)) + 1 : 1;
  const newObj = { id: nextId, ...record };
  list.unshift(newObj);
  writeJson(JSON_FILE, list);
  return newObj;
}

export async function updateMatricula(id, updates) {
  const list = readJson(JSON_FILE, []);
  const idx = list.findIndex(m => String(m.id) === String(id) || String(m.protocolo) === String(id));
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...updates };
    writeJson(JSON_FILE, list);
    return list[idx];
  }
  return null;
}

export async function updateMatriculaParecerAuditoria(protocolo, parecerData, user = null, reqInfo = {}) {
  const agora = new Date().toISOString();
  const parecer = {
    status: parecerData.status || 'HOMOLOGADO_SECRETARIA',
    score_auditoria: parecerData.score_auditoria || 100,
    nivel_risco: parecerData.nivel_risco || 'BAIXO',
    auditor_id: user ? user.id : null,
    auditor_nome: user ? user.nome : 'Auditor Acadêmico',
    auditor_cargo: user ? user.cargo : 'Secretaria Acadêmica',
    auditor_login: user ? user.login : 'admin',
    despacho: parecerData.despacho || '',
    observacoes: parecerData.observacoes || '',
    ressalvas: parecerData.ressalvas || [],
    data_parecer: agora
  };
  const matriculaAtualizada = await updateMatricula(protocolo, {
    parecer_auditoria: parecer,
    status_auditoria: parecer.status,
    status: parecer.status === 'HOMOLOGADO_SECRETARIA' ? 'Homologada' : (parecer.status === 'REJEITADO' ? 'Rejeitada' : 'Em Análise')
  });
  return matriculaAtualizada;
}

export function normalizarDocumentos(documentosRaw) {
  if (!documentosRaw) return [];
  if (Array.isArray(documentosRaw)) return documentosRaw;
  if (typeof documentosRaw === 'string') {
    try {
      const parsed = JSON.parse(documentosRaw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function obterDocumentosMatricula(matriculaId) {
  const matricula = await getMatriculaById(matriculaId);
  if (!matricula) return [];
  const anexos = normalizarDocumentos(matricula.documentos_anexos);
  const docs = normalizarDocumentos(matricula.documentos);
  const map = new Map();
  docs.forEach((d, i) => {
    if (!d) return;
    const key = String(d.id || d.tipo || `doc_m_${i}`);
    map.set(key, {
      id: d.id || key,
      tipo: d.tipo || 'OUTROS',
      nome_documento: d.nome_documento || d.label || d.tipo || 'Documento Comprobatório',
      arquivo_nome: d.arquivo_nome || (d.arquivo_url ? 'anexo.pdf' : `${(d.tipo || 'doc').toLowerCase()}.pdf`),
      arquivo_url: d.arquivo_url || '',
      formato: d.formato || (d.arquivo_url && d.arquivo_url.startsWith('data:image') ? 'image' : 'pdf'),
      status: d.status || 'VALIDADO',
      ...d
    });
  });
  anexos.forEach((d, i) => {
    if (!d) return;
    const key = String(d.id || d.tipo || `doc_a_${i}`);
    map.set(key, {
      id: d.id || key,
      tipo: d.tipo || 'OUTROS',
      nome_documento: d.nome_documento || d.label || d.tipo || 'Documento Comprobatório',
      arquivo_nome: d.arquivo_nome || (d.arquivo_url ? 'anexo.pdf' : `${(d.tipo || 'doc').toLowerCase()}.pdf`),
      arquivo_url: d.arquivo_url || '',
      formato: d.formato || (d.arquivo_url && d.arquivo_url.startsWith('data:image') ? 'image' : 'pdf'),
      status: d.status || 'VALIDADO',
      ...d
    });
  });
  return Array.from(map.values());
}

export async function anexarDocumentoMatricula(matriculaId, docData, user = null, reqInfo = {}) {
  const matricula = await getMatriculaById(matriculaId);
  if (!matricula) throw new Error('Matrícula não encontrada.');
  const docs = normalizarDocumentos(matricula.documentos_anexos);
  const agora = new Date().toISOString();
  const docId = docData.id || `doc_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const novoDoc = {
    id: docId,
    tipo: docData.tipo || 'OUTROS',
    secao: docData.secao || 'geral',
    nome_documento: docData.nome_documento || 'Documento Comprobatório',
    arquivo_nome: docData.arquivo_nome || 'documento.pdf',
    arquivo_url: docData.arquivo_url || '',
    formato: docData.formato || (docData.arquivo_nome?.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image'),
    via: docData.via || 'Original',
    tamanho: docData.tamanho || '1.0 MB',
    status: docData.status || (user && user.cargo !== 'Candidato' ? 'VALIDADO' : 'EM_ANALISE'),
    observacao: docData.observacao || '',
    enviado_por: docData.enviado_por || (user ? `${user.nome} (${user.cargo || 'Secretaria'})` : 'Candidato / Aluno'),
    data_upload: agora,
    data_validacao: docData.status === 'VALIDADO' ? agora : null,
    validado_por: docData.status === 'VALIDADO' ? (user ? user.nome : 'Secretaria Acadêmica') : null
  };
  const existingIdx = docs.findIndex(d => String(d.id) === String(docId));
  if (existingIdx >= 0) {
    docs[existingIdx] = { ...docs[existingIdx], ...novoDoc };
  } else {
    docs.unshift(novoDoc);
  }
  const docsJson = JSON.stringify(docs);
  await updateMatricula(matricula.id, { documentos_anexos: docsJson });
  return { documento: novoDoc, total: docs.length, documentos: docs };
}

export async function editarDocumentoMatricula(matriculaId, docId, updates, user = null, reqInfo = {}) {
  const matricula = await getMatriculaById(matriculaId);
  if (!matricula) throw new Error('Matrícula não encontrada.');
  const docs = normalizarDocumentos(matricula.documentos_anexos);
  const idx = docs.findIndex(d => String(d.id) === String(docId));
  if (idx === -1) throw new Error('Documento anexo não encontrado.');
  const docAntigo = docs[idx];
  const agora = new Date().toISOString();
  const docAtualizado = {
    ...docAntigo,
    ...updates,
    id: docAntigo.id,
    data_edicao: agora,
    editado_por: user ? `${user.nome} (${user.cargo || 'Secretaria'})` : 'Secretaria Acadêmica'
  };
  if (updates.status === 'VALIDADO' && docAntigo.status !== 'VALIDADO') {
    docAtualizado.data_validacao = agora;
    docAtualizado.validado_por = user ? user.nome : 'Secretaria Acadêmica';
  }
  docs[idx] = docAtualizado;
  const docsJson = JSON.stringify(docs);
  await updateMatricula(matricula.id, { documentos_anexos: docsJson });
  return { documento: docAtualizado, documentos: docs };
}

export async function removerDocumentoMatricula(matriculaId, docId, user = null, reqInfo = {}) {
  const matricula = await getMatriculaById(matriculaId);
  if (!matricula) throw new Error('Matrícula não encontrada.');
  let anexos = normalizarDocumentos(matricula.documentos_anexos);
  let docs = normalizarDocumentos(matricula.documentos);
  const targetId = String(docId || '').trim();
  let removido = null;
  const idxAnexos = anexos.findIndex(d => 
    String(d.id) === targetId || 
    String(d.tipo) === targetId || 
    String(d.nome_documento) === targetId
  );
  if (idxAnexos !== -1) {
    [removido] = anexos.splice(idxAnexos, 1);
  }
  const idxDocs = docs.findIndex(d => 
    String(d.id) === targetId || 
    String(d.tipo) === targetId || 
    String(d.nome_documento) === targetId
  );
  if (idxDocs !== -1) {
    if (!removido) [removido] = docs.splice(idxDocs, 1);
    else docs.splice(idxDocs, 1);
  }
  if (!removido) {
    removido = { id: targetId, nome_documento: 'Documento Anexo' };
  }
  await updateMatricula(matricula.id, {
    documentos_anexos: JSON.stringify(anexos),
    documentos: JSON.stringify(docs)
  });
  const docsRestantes = await obterDocumentosMatricula(matricula.id);
  return { removido, total: docsRestantes.length, documentos: docsRestantes };
}

export async function deleteMatricula(id, user = null, reqInfo = {}) {
  const list = readJson(JSON_FILE, []);
  const idx = list.findIndex(m => String(m.id) === String(id));
  if (idx !== -1) {
    list.splice(idx, 1);
    writeJson(JSON_FILE, list);
    return true;
  }
  return false;
}

export async function createAuditLog(logData) {
  const agora = new Date().toISOString();
  const entry = {
    acao: logData.acao || 'ACESSO_GERAL',
    tipo: logData.tipo || 'ACESSO',
    matricula_id: logData.matricula_id ? String(logData.matricula_id) : null,
    protocolo: logData.protocolo || null,
    aluno_nome: logData.aluno_nome || null,
    aluno_cpf: logData.aluno_cpf || null,
    usuario_id: logData.usuario_id || null,
    usuario_nome: logData.usuario_nome || 'Administrador',
    usuario_login: logData.usuario_login || 'admin',
    usuario_cargo: logData.usuario_cargo || 'Secretaria Acadêmica',
    ip: logData.ip || '127.0.0.1',
    user_agent: logData.user_agent || 'Coruja Web Client',
    detalhes: logData.detalhes || '',
    criado_em: logData.criado_em || agora
  };

  const logs = readJson(LOGS_FILE, []);
  const nextId = logs.length > 0 ? Math.max(...logs.map(l => Number(l.id) || 0)) + 1 : 1;
  const newLog = { id: nextId, ...entry };
  logs.unshift(newLog);
  if (logs.length > 2000) {
    logs.length = 2000;
  }
  writeJson(LOGS_FILE, logs);
  return newLog;
}

export async function getAllAuditLogs(filters = {}) {
  const { limit = 200, tipo = 'todos', search = '', protocolo = '' } = filters;
  let logs = readJson(LOGS_FILE, []);
  if (tipo && tipo !== 'todos') {
    logs = logs.filter(l => (l.tipo || '').toUpperCase() === tipo.toUpperCase());
  }
  if (protocolo) {
    logs = logs.filter(l => (l.protocolo || '').toLowerCase().includes(protocolo.toLowerCase()));
  }
  if (search) {
    const s = search.toLowerCase();
    logs = logs.filter(l => 
      (l.aluno_nome && l.aluno_nome.toLowerCase().includes(s)) ||
      (l.usuario_nome && l.usuario_nome.toLowerCase().includes(s)) ||
      (l.usuario_login && l.usuario_login.toLowerCase().includes(s)) ||
      (l.acao && l.acao.toLowerCase().includes(s)) ||
      (l.protocolo && l.protocolo.toLowerCase().includes(s)) ||
      (l.detalhes && l.detalhes.toLowerCase().includes(s))
    );
  }
  return logs.slice(0, parseInt(limit, 10) || 200);
}

export async function getAuditLogsStats() {
  const allLogs = await getAllAuditLogs({ limit: 10000 });
  const total = allLogs.length;
  const visualizacoes = allLogs.filter(l => l.tipo === 'VISUALIZACAO' || l.acao.includes('VISUALIZ') || l.acao.includes('IMPRESSAO')).length;
  const exclusoes = allLogs.filter(l => l.tipo === 'EXCLUSAO' || l.acao.includes('EXCLUS') || l.acao.includes('DELETE')).length;
  const acessos = allLogs.filter(l => l.tipo === 'ACESSO' || l.acao.includes('LOGIN') || l.acao.includes('SISTEMA')).length;
  const exportacoes = allLogs.filter(l => l.tipo === 'EXPORTACAO' || l.acao.includes('EXPORT')).length;
  const distinctUsers = new Set(allLogs.map(l => l.usuario_login || l.usuario_nome).filter(Boolean)).size;
  return {
    total,
    visualizacoes,
    exclusoes,
    acessos,
    exportacoes,
    usuarios_distintos: distinctUsers,
    ultimo_registro: allLogs[0] ? allLogs[0].criado_em : null
  };
}

export async function bulkCreateMatriculas(items) {
  const created = [];
  for (const item of items) {
    const res = await createMatricula(item);
    if (res) created.push(res);
  }
  return created;
}

export async function getEstatisticasIntersemestrais() {
  const semestres = await getAllSemestres();
  const allMatriculas = await getAllMatriculas('todos');
  const semestresStats = semestres.map((sem) => {
    const list = allMatriculas.filter(m => m.semestre === sem.codigo);
    const total = list.length;
    const manha = list.filter(m => m.turno === 'Manhã' || m.turno === 'MATUTINO').length;
    const tarde = list.filter(m => m.turno === 'Tarde' || m.turno === 'VESPERTINO').length;
    const noite = list.filter(m => m.turno === 'Noite' || m.turno === 'NOTURNO').length;
    const vestibular = list.filter(m => (m.forma_ingresso || '').includes('Vestibular')).length;
    const sisu = list.filter(m => (m.forma_ingresso || '').includes('SISU') || (m.forma_ingresso || '').includes('ENEM')).length;
    const transferencia = list.filter(m => (m.forma_ingresso || '').includes('Transferência')).length;
    const reingresso = list.filter(m => (m.forma_ingresso || '').includes('Reingresso')).length;
    const diploma = list.filter(m => (m.forma_ingresso || '').includes('Diploma')).length;
    const ampla = list.filter(m => (m.sistema_concorrencia || '').includes('Ampla')).length;
    const redePublica = list.filter(m => (m.sistema_concorrencia || '').includes('Pública')).length;
    const negrosIndigenas = list.filter(m => (m.sistema_concorrencia || '').includes('Negros') || (m.sistema_concorrencia || '').includes('Indígenas')).length;
    const pcd = list.filter(m => m.pcd === true || (m.sistema_concorrencia || '').includes('Deficiência')).length;
    const totalCotistas = total - ampla;
    const vagas = sem.vagas_totais || 120;
    const taxaOcupacao = vagas > 0 ? Math.round((total / vagas) * 100) : 0;
    return {
      id: sem.id,
      codigo: sem.codigo,
      ano: sem.ano,
      periodo: sem.periodo,
      ativo: sem.ativo,
      status: sem.status,
      vagas_totais: vagas,
      total_inscritos: total,
      taxa_ocupacao: taxaOcupacao,
      turnos: { manha, tarde, noite },
      formas_ingresso: { vestibular, sisu, transferencia, reingresso, diploma },
      concorrencia: { ampla, redePublica, negrosIndigenas, pcd, cotistas: totalCotistas },
      pcd_count: pcd
    };
  });

  for (let i = 0; i < semestresStats.length; i++) {
    if (i === 0) {
      semestresStats[i].variacao_percentual = 0;
      semestresStats[i].variacao_absoluta = 0;
    } else {
      const prevTotal = semestresStats[i - 1].total_inscritos;
      const currTotal = semestresStats[i].total_inscritos;
      const diff = currTotal - prevTotal;
      const pct = prevTotal > 0 ? Math.round((diff / prevTotal) * 100) : (currTotal > 0 ? 100 : 0);
      semestresStats[i].variacao_percentual = pct;
      semestresStats[i].variacao_absoluta = diff;
    }
  }

  const totalHistorico = allMatriculas.length;
  const mediaPorSemestre = semestresStats.length > 0 ? Math.round(totalHistorico / semestresStats.length) : 0;
  const maxInscritos = semestresStats.reduce((max, s) => s.total_inscritos > max.total_inscritos ? s : max, semestresStats[0] || { codigo: '-', total_inscritos: 0 });

  return {
    resumo: {
      total_semestres: semestresStats.length,
      total_matriculas_historico: totalHistorico,
      media_inscritos_por_semestre: mediaPorSemestre,
      semestre_maior_demanda: maxInscritos.codigo,
      max_inscritos: maxInscritos.total_inscritos
    },
    semestres: semestresStats
  };
}

export async function getConfiguracoesJanela() {
  const configs = readJson(CONFIGURACOES_FILE, {
    janela_matricula_aberta: true,
    data_inicio: '2026-01-01T00:00:00.000Z',
    data_fim: '2026-12-31T23:59:59.000Z',
    tempo_limite_minutos: 60,
    semestre_vigente: '2026.1',
    mensagem_bloqueio: 'O período regulamentar de matrículas está encerrado pela Secretaria Acadêmica da FAETERJ-Rio. Para orientações adicionais, procure o atendimento presencial da unidade.',
    atualizado_em: new Date().toISOString(),
    atualizado_por: 'Secretaria Acadêmica'
  });
  const now = new Date();
  const inicio = configs.data_inicio ? new Date(configs.data_inicio) : null;
  const fim = configs.data_fim ? new Date(configs.data_fim) : null;
  let dentroDoPrazo = true;
  let motivoBloqueio = '';
  if (!configs.janela_matricula_aberta) {
    dentroDoPrazo = false;
    motivoBloqueio = configs.mensagem_bloqueio || 'Janela de matrículas desativada pela Secretaria.';
  } else if (inicio && now < inicio) {
    dentroDoPrazo = false;
    motivoBloqueio = `O período de matrículas iniciará em ${inicio.toLocaleDateString('pt-BR')} às ${inicio.toLocaleTimeString('pt-BR')}.`;
  } else if (fim && now > fim) {
    dentroDoPrazo = false;
    motivoBloqueio = `O prazo regulamentar de matrículas encerrou-se em ${fim.toLocaleDateString('pt-BR')} às ${fim.toLocaleTimeString('pt-BR')}.`;
  }
  return {
    ...configs,
    em_periodo_valido: dentroDoPrazo,
    status_janela: dentroDoPrazo ? 'ABERTA' : 'ENCERRADA',
    motivo_bloqueio: motivoBloqueio
  };
}

export async function updateConfiguracoesJanela(updates, user = null) {
  const current = await getConfiguracoesJanela();
  const updated = {
    ...current,
    ...updates,
    atualizado_em: new Date().toISOString(),
    atualizado_por: user ? `${user.nome} (${user.cargo || 'Secretaria'})` : 'Secretaria Acadêmica'
  };
  delete updated.em_periodo_valido;
  delete updated.status_janela;
  delete updated.motivo_bloqueio;
  writeJson(CONFIGURACOES_FILE, updated);
  return getConfiguracoesJanela();
}

export async function getAllCandidatos(filters = {}) {
  const list = readJson(CANDIDATOS_FILE, []);
  let filtered = [...list];
  if (filters.status && filters.status !== 'todos') {
    filtered = filtered.filter(c => String(c.status).toLowerCase() === String(filters.status).toLowerCase());
  }
  if (filters.search) {
    const s = String(filters.search).toLowerCase().trim();
    filtered = filtered.filter(c => 
      (c.nome_completo && c.nome_completo.toLowerCase().includes(s)) ||
      (c.cpf && c.cpf.includes(s)) ||
      (c.cpf_clean && c.cpf_clean.includes(s)) ||
      (c.protocolo && c.protocolo.toLowerCase().includes(s)) ||
      (c.email && c.email.toLowerCase().includes(s))
    );
  }
  return filtered;
}

export async function getCandidatoByCpf(cpf) {
  const clean = cleanCpfDigits(cpf);
  const list = readJson(CANDIDATOS_FILE, []);
  return list.find(c => (c.cpf_clean && c.cpf_clean === clean) || cleanCpfDigits(c.cpf || '') === clean) || null;
}

export async function getCandidatoById(id) {
  const list = readJson(CANDIDATOS_FILE, []);
  return list.find(c => String(c.id) === String(id) || String(c.protocolo) === String(id)) || null;
}

export async function createOrUpdateCandidato(dados) {
  const list = readJson(CANDIDATOS_FILE, []);
  const clean = cleanCpfDigits(dados.cpf || '');
  const agora = new Date().toISOString();
  const idx = list.findIndex(c => (c.cpf_clean && c.cpf_clean === clean) || cleanCpfDigits(c.cpf || '') === clean);
  if (idx !== -1) {
    const existing = list[idx];
    const historico = existing.historico_status || [];
    if (dados.status && dados.status !== existing.status) {
      historico.push({
        data: agora,
        status: dados.status,
        observacao: dados.observacao_status || `Status atualizado para ${dados.status}`
      });
    }
    list[idx] = {
      ...existing,
      ...dados,
      cpf_clean: clean,
      historico_status: historico,
      atualizado_em: agora
    };
    writeJson(CANDIDATOS_FILE, list);
    return list[idx];
  } else {
    const nextId = list.length > 0 ? Math.max(...list.map(c => Number(c.id) || 0)) + 1 : 1;
    const novo = {
      id: nextId,
      ...dados,
      cpf_clean: clean,
      status: dados.status || 'Inscrito',
      historico_status: [
        {
          data: agora,
          status: dados.status || 'Inscrito',
          observacao: 'Inscrição no processo seletivo registrada no sistema'
        }
      ],
      criado_em: agora,
      atualizado_em: agora
    };
    list.unshift(novo);
    writeJson(CANDIDATOS_FILE, list);
    return novo;
  }
}

export async function reativarCandidato(idOuCpf, motivo = '', user = null) {
  const list = readJson(CANDIDATOS_FILE, []);
  const clean = cleanCpfDigits(idOuCpf);
  const agora = new Date().toISOString();
  const idx = list.findIndex(c => String(c.id) === String(idOuCpf) || String(c.protocolo) === String(idOuCpf) || (c.cpf_clean && c.cpf_clean === clean) || cleanCpfDigits(c.cpf || '') === clean);
  if (idx === -1) return null;
  const candidato = list[idx];
  const historico = candidato.historico_status || [];
  const statusAnterior = candidato.status;
  historico.push({
    data: agora,
    status_anterior: statusAnterior,
    status: 'Inscrito',
    observacao: motivo ? `Reativação: ${motivo}` : 'Inscrição reativada pela Secretaria / Processo Seletivo',
    autor: user ? `${user.nome} (${user.cargo || 'Secretaria'})` : 'Candidato / Auto-Reativação'
  });
  list[idx] = {
    ...candidato,
    status: 'Inscrito',
    motivo_desistencia: null,
    reativado_em: agora,
    historico_status: historico,
    atualizado_em: agora
  };
  writeJson(CANDIDATOS_FILE, list);
  return list[idx];
}

export async function desistirCandidato(idOuCpf, motivo = '', user = null) {
  const list = readJson(CANDIDATOS_FILE, []);
  const clean = cleanCpfDigits(idOuCpf);
  const agora = new Date().toISOString();
  const idx = list.findIndex(c => String(c.id) === String(idOuCpf) || String(c.protocolo) === String(idOuCpf) || (c.cpf_clean && c.cpf_clean === clean) || cleanCpfDigits(c.cpf || '') === clean);
  if (idx === -1) return null;
  const candidato = list[idx];
  const historico = candidato.historico_status || [];
  historico.push({
    data: agora,
    status_anterior: candidato.status,
    status: 'Desistente',
    observacao: motivo ? `Desistência informada: ${motivo}` : 'Registro de desistência',
    autor: user ? `${user.nome} (${user.cargo || 'Secretaria'})` : 'Candidato'
  });
  list[idx] = {
    ...candidato,
    status: 'Desistente',
    motivo_desistencia: motivo || 'Opção voluntária do candidato',
    desistido_em: agora,
    historico_status: historico,
    atualizado_em: agora
  };
  writeJson(CANDIDATOS_FILE, list);
  return list[idx];
}
