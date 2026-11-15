/**
 * FAETERJ-Rio (Quintino) - Sistema Coruja de Matrícula Digital
 * Módulo de Backup Diário Agendado e Segurança Acadêmica
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { 
  getAllMatriculas, 
  getAllSemestres, 
  getAllAuditLogs, 
  getAllAlunosAuth, 
  getAllUsuarios, 
  createAuditLog 
} from './db.js';

dotenv.config();

const require = createRequire(import.meta.url);
// V13: o archiver 8 não exporta mais uma função (antes: archiver('zip', ...)), e sim classes.
// Com o import antigo todo backup falhava com "archiver is not a function".
const { ZipArchive } = require('archiver');
const cron = require('node-cron');

const BACKUPS_DIR = process.env.BACKUPS_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'backups');
const RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10);
const CRON_SCHEDULE = process.env.BACKUP_CRON_SCHEDULE || '0 0 * * *';

if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

export function calcularHashSha256(filePathOrBuffer) {
  const hash = crypto.createHash('sha256');
  if (Buffer.isBuffer(filePathOrBuffer) || typeof filePathOrBuffer === 'string') {
    if (typeof filePathOrBuffer === 'string' && fs.existsSync(filePathOrBuffer)) {
      const fileBuffer = fs.readFileSync(filePathOrBuffer);
      hash.update(fileBuffer);
    } else {
      hash.update(filePathOrBuffer);
    }
  }
  return hash.digest('hex');
}

function gerarTimestampFormatado(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const ano = date.getFullYear();
  const mes = pad(date.getMonth() + 1);
  const dia = pad(date.getDate());
  const hora = pad(date.getHours());
  const min = pad(date.getMinutes());
  const seg = pad(date.getSeconds());
  return `${ano}-${mes}-${dia}_${hora}-${min}-${seg}`;
}

function gerarSqlDump({ matriculas, alunos, semestres, usuarios, logs, timestamp }) {
  let sql = `-- ====================================================================\n`;
  sql += `-- FAETERJ-RIO (QUINTINO) - SISTEMA CORUJA DE MATRÍCULA DIGITAL\n`;
  sql += `-- DUMP DE SEGURANÇA ACADÊMICA E AUDITORIA\n`;
  sql += `-- Gerado em: ${timestamp} (ISO)\n`;
  sql += `-- ====================================================================\n\n`;

  sql += `-- 1. TABELA: semestres\n`;
  sql += `CREATE TABLE IF NOT EXISTS semestres (\n`;
  sql += `  id SERIAL PRIMARY KEY,\n`;
  sql += `  codigo VARCHAR(20) UNIQUE NOT NULL,\n`;
  sql += `  ano INT NOT NULL,\n`;
  sql += `  periodo INT NOT NULL,\n`;
  sql += `  data_inicio VARCHAR(20),\n`;
  sql += `  data_fim VARCHAR(20),\n`;
  sql += `  vagas_totais INT DEFAULT 120,\n`;
  sql += `  ativo BOOLEAN DEFAULT FALSE,\n`;
  sql += `  status VARCHAR(50) DEFAULT 'Aberto',\n`;
  sql += `  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP\n`;
  sql += `);\n\n`;

  if (semestres.length > 0) {
    sql += `INSERT INTO semestres (id, codigo, ano, periodo, data_inicio, data_fim, vagas_totais, ativo, status) VALUES\n`;
    // Valores escapados/convertidos: um código de semestre com aspas não pode injetar SQL no dump
    const sqlStr = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`;
    const sqlInt = (v, padrao) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : padrao);
    const semRows = semestres.map(s => {
      return `  (${sqlInt(s.id, 'DEFAULT')}, ${sqlStr(s.codigo)}, ${sqlInt(s.ano, 'NULL')}, ${sqlInt(s.periodo, 'NULL')}, ${sqlStr(s.data_inicio || '')}, ${sqlStr(s.data_fim || '')}, ${sqlInt(s.vagas_totais, 120)}, ${s.ativo ? 'TRUE' : 'FALSE'}, ${sqlStr(s.status || 'Aberto')})`;
    });
    sql += semRows.join(',\n') + `\nON CONFLICT (codigo) DO NOTHING;\n\n`;
  }

  sql += `-- 2. TABELA: alunos_auth\n`;
  sql += `CREATE TABLE IF NOT EXISTS alunos_auth (\n`;
  sql += `  id SERIAL PRIMARY KEY,\n`;
  sql += `  cpf VARCHAR(20) UNIQUE NOT NULL,\n`;
  sql += `  cpf_clean VARCHAR(20) NOT NULL,\n`;
  sql += `  email VARCHAR(255) NOT NULL,\n`;
  sql += `  nome VARCHAR(255) NOT NULL,\n`;
  sql += `  telefone VARCHAR(50),\n`;
  sql += `  ultimo_acesso TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,\n`;
  sql += `  criado_em TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP\n`;
  sql += `);\n\n`;

  sql += `-- 3. TABELA: matriculas\n`;
  sql += `CREATE TABLE IF NOT EXISTS matriculas (\n`;
  sql += `  id SERIAL PRIMARY KEY,\n`;
  sql += `  protocolo VARCHAR(50) UNIQUE NOT NULL,\n`;
  sql += `  semestre VARCHAR(20) DEFAULT '2026.1',\n`;
  sql += `  curso VARCHAR(150) NOT NULL,\n`;
  sql += `  ue VARCHAR(100) DEFAULT 'FAETERJ-Rio (Quintino)',\n`;
  sql += `  nome_completo VARCHAR(255) NOT NULL,\n`;
  sql += `  cpf VARCHAR(20) NOT NULL,\n`;
  sql += `  data_nascimento VARCHAR(20) NOT NULL,\n`;
  sql += `  turno VARCHAR(50) NOT NULL,\n`;
  sql += `  forma_ingresso VARCHAR(100) NOT NULL,\n`;
  sql += `  sistema_concorrencia VARCHAR(100) DEFAULT 'Ampla Concorrência',\n`;
  sql += `  email VARCHAR(255) NOT NULL,\n`;
  sql += `  telefone VARCHAR(50) NOT NULL,\n`;
  sql += `  cep VARCHAR(20) NOT NULL,\n`;
  sql += `  logradouro VARCHAR(255) NOT NULL,\n`;
  sql += `  bairro VARCHAR(150) NOT NULL,\n`;
  sql += `  cidade VARCHAR(150) NOT NULL,\n`;
  sql += `  uf VARCHAR(10) NOT NULL,\n`;
  sql += `  status VARCHAR(50) DEFAULT 'Pendente',\n`;
  sql += `  data_envio TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP\n`;
  sql += `);\n\n`;

  return sql;
}

export async function aplicarPoliticaRetencao() {
  try {
    const arquivos = fs.readdirSync(BACKUPS_DIR);
    const agora = Date.now();
    const limiteMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;
    let removidos = 0;
    for (const arq of arquivos) {
      if (arq.startsWith('backup_faeterj_') && (arq.endsWith('.zip') || arq.endsWith('.tar.gz'))) {
        const caminho = path.join(BACKUPS_DIR, arq);
        const stats = fs.statSync(caminho);
        if (agora - stats.mtimeMs > limiteMs) {
          fs.unlinkSync(caminho);
          removidos++;
          console.log(`🗑️ [BACKUP] Arquivo antigo removido (${RETENTION_DAYS} dias): ${arq}`);
        }
      }
    }
    return removidos;
  } catch (err) {
    console.error('❌ [BACKUP] Erro na política de retenção:', err.message);
    return 0;
  }
}

export async function executarBackupDiario({ modo = 'auto', usuario = 'Sistema Cron' } = {}) {
  const dataInicio = new Date();
  const timestampStr = gerarTimestampFormatado(dataInicio);
  const zipFileName = `backup_faeterj_${timestampStr}.zip`;
  const zipFilePath = path.join(BACKUPS_DIR, zipFileName);

  console.log(`📦 [BACKUP] Iniciando backup (${modo.toUpperCase()}) às ${dataInicio.toISOString()}...`);

  try {
    const [matriculas, alunos, semestres, logs, usuarios] = await Promise.all([
      getAllMatriculas('todos'),
      getAllAlunosAuth(),
      getAllSemestres(),
      getAllAuditLogs(),
      getAllUsuarios(false)
    ]);

    const sqlDump = gerarSqlDump({
      matriculas,
      alunos,
      semestres,
      usuarios,
      logs,
      timestamp: dataInicio.toISOString()
    });

    const manifesto = {
      instituicao: 'FAETERJ-Rio (Quintino) - Fundação de Apoio à Escola Técnica do Estado do Rio de Janeiro',
      sistema: 'Sistema Coruja de Matrícula Digital e Gestão Acadêmica',
      versao_sistema: '1.0.0',
      tipo_backup: modo === 'manual' ? 'Backup Manual Sob Demanda' : 'Backup Diário Agendado Automático',
      data_geracao_utc: dataInicio.toISOString(),
      data_geracao_brasilia: dataInicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      usuario_solicitante: usuario,
      politica_retencao_dias: RETENTION_DAYS,
      totais: {
        total_matriculas: matriculas.length,
        total_alunos_cadastrados: alunos.length,
        total_semestres: semestres.length,
        total_logs_auditoria: logs.length,
        total_usuarios_sistema: usuarios.length
      },
      arquivos_inclusos: [
        'manifesto.json',
        'matriculas.json',
        'alunos_auth.json',
        'semestres.json',
        'audit_logs.json',
        'usuarios.json',
        'database_dump.sql'
      ]
    };

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipFilePath);
      const archive = new ZipArchive({ zlib: { level: 9 } });

      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);

      archive.append(JSON.stringify(manifesto, null, 2), { name: 'manifesto.json' });
      archive.append(JSON.stringify(matriculas, null, 2), { name: 'matriculas.json' });
      archive.append(JSON.stringify(alunos, null, 2), { name: 'alunos_auth.json' });
      archive.append(JSON.stringify(semestres, null, 2), { name: 'semestres.json' });
      archive.append(JSON.stringify(logs, null, 2), { name: 'audit_logs.json' });
      archive.append(JSON.stringify(usuarios, null, 2), { name: 'usuarios.json' });
      archive.append(sqlDump, { name: 'database_dump.sql' });

      archive.finalize().catch(reject);
    });

    const fileStats = fs.statSync(zipFilePath);
    const checksumSha256 = calcularHashSha256(zipFilePath);
    const tamanhoKb = (fileStats.size / 1024).toFixed(2);

    console.log(`✅ [BACKUP] Arquivo gerado: ${zipFileName} (${tamanhoKb} KB)`);
    console.log(`🔒 [BACKUP] Checksum SHA-256: ${checksumSha256}`);

    try {
      await createAuditLog({
        acao: modo === 'manual' ? 'BACKUP_MANUAL_EXECUTADO' : 'BACKUP_DIARIO_EXECUTADO',
        tipo: 'SEGURANCA',
        usuario_nome: usuario,
        usuario_login: modo === 'manual' ? 'admin' : 'sistema_cron',
        usuario_cargo: 'Segurança / TI Acadêmica',
        ip: '127.0.0.1',
        user_agent: 'Sistema Coruja / Backup Daemon',
        detalhes: `Backup gerado: ${zipFileName} (${tamanhoKb} KB) | SHA-256: ${checksumSha256}`
      });
    } catch (e) {
      console.warn('⚠️ Falha ao registrar log de auditoria do backup:', e.message);
    }

    await aplicarPoliticaRetencao();

    return {
      sucesso: true,
      arquivo: zipFileName,
      caminho: zipFilePath,
      tamanho_bytes: fileStats.size,
      tamanho_kb: tamanhoKb,
      checksum_sha256: checksumSha256,
      totais: manifesto.totais,
      data_geracao: dataInicio.toISOString()
    };
  } catch (error) {
    console.error('❌ Falha ao gerar backup:', error);
    return {
      sucesso: false,
      erro: error.message
    };
  }
}

export async function listarBackups() {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return [];
    const arquivos = fs.readdirSync(BACKUPS_DIR);
    const lista = [];
    for (const arq of arquivos) {
      if (arq.startsWith('backup_faeterj_') && arq.endsWith('.zip')) {
        const caminho = path.join(BACKUPS_DIR, arq);
        const stats = fs.statSync(caminho);
        const sha256 = calcularHashSha256(caminho);
        lista.push({
          nome_arquivo: arq,
          tamanho_bytes: stats.size,
          tamanho_formatado: (stats.size / 1024).toFixed(1) + ' KB',
          data_criacao: stats.birthtime.toISOString(),
          data_modificacao: stats.mtime.toISOString(),
          checksum_sha256: sha256
        });
      }
    }
    return lista.sort((a, b) => new Date(b.data_criacao).getTime() - new Date(a.data_criacao).getTime());
  } catch (err) {
    console.error('Erro ao listar backups:', err);
    return [];
  }
}

export function obterCaminhoBackup(fileName) {
  if (!fileName || typeof fileName !== 'string') return null;
  const safeName = path.basename(fileName);
  // Proteção estrita contra Path Traversal (CWE-22)
  if (!safeName.startsWith('backup_faeterj_') || !safeName.endsWith('.zip')) {
    return null;
  }
  const fullPath = path.resolve(BACKUPS_DIR, safeName);
  const resolvedBackupsDir = path.resolve(BACKUPS_DIR);
  if (!fullPath.startsWith(resolvedBackupsDir)) {
    return null;
  }
  if (fs.existsSync(fullPath)) {
    return fullPath;
  }
  return null;
}

let cronTask = null;
export function iniciarAgendamentoBackupDiario() {
  if (cronTask) {
    return;
  }
  console.log(`⏰ [BACKUP CRON] Agendando rotina (${CRON_SCHEDULE})...`);
  cronTask = cron.schedule(CRON_SCHEDULE, async () => {
    await executarBackupDiario({ modo: 'auto', usuario: 'Rotina Cron Diária FAETERJ' });
  });
  return cronTask;
}
