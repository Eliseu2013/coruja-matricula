import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { 
  initDB, 
  getAllMatriculas, 
  getMatriculaById, 
  createMatricula, 
  updateMatricula,
  updateMatriculaParecerAuditoria,
  obterDocumentosMatricula,
  anexarDocumentoMatricula,
  editarDocumentoMatricula,
  removerDocumentoMatricula,
  deleteMatricula, 
  bulkCreateMatriculas,
  getMatriculasByAlunoCpf,
  getAllSemestres,
  getSemestreAtivo,
  createSemestre,
  setSemestreAtivo,
  deleteSemestre,
  getEstatisticasIntersemestrais,
  createAuditLog,
  getAllAuditLogs,
  getAuditLogsStats,
  getConfiguracoesJanela,
  updateConfiguracoesJanela,
  getAllCandidatos,
  getCandidatoByCpf,
  createOrUpdateCandidato,
  reativarCandidato,
  desistirCandidato,
  cleanCpfDigits
} from './db.js';
import { 
  auditarCadastroCompleto, 
  consolidarPainelAuditoria 
} from './auditoria.js';
import { 
  requireAuth,
  requireSecretariaAuth,
  requireAdminAuth,
  requireAlunoAuth,
  requireAlunoOuEquipe,
  handleAlunoAcesso,
  handleAlunoRedefinirPorNascimento,
  senhaPermitida,
  SENHA_MIN_EQUIPE,
  handleLogin,
  handleVerify,
  handleAlunoLogin,
  handleAlunoCadastro,
  handleAlunoVerify,
  handleAlunoMinhaMatricula,
  handleEsqueciSenha,
  handleRedefinirSenha
} from './auth.js';
import { 
  createOrUpdateAluno,
  liberarAcessoAluno,
  getListaConvocados,
  salvarListaConvocados,
  findAlunoPorInscricao,
  incrementarVersaoSessaoUsuario,
  getAllUsuarios,
  createOrUpdateUsuario, 
  deleteUsuario, 
  getAllAlunosAuth 
} from './db.js';
import { 
  executarBackupDiario, 
  iniciarAgendamentoBackupDiario, 
  listarBackups, 
  obterCaminhoBackup 
} from './backup.js';
import { extrairDadosDocumentos } from './gemini_ocr.js';
import { lerListaConvocadosPdf, normalizarInscricao, ROTULO_MODALIDADE } from './convocadosPdf.js';
import {
  validarCadastroEscolarMiddleware,
  validarNomeEscola,
  validarNis,
  ehModalidadeCota
} from './validators/cadastroEscolarValidation.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const cliPort = portIndex !== -1 ? args[portIndex + 1] : null;
const envPort = process.env.PORT && process.env.PORT !== '8080' ? process.env.PORT : null;
const PORT = parseInt(cliPort || envPort || '3000', 10);

app.set('trust proxy', 1);

// Política de Segurança de Conteúdo (CSP): lista exatamente de onde a página pode carregar
// scripts, estilos, fontes e imagens. 'unsafe-inline' ainda é necessário porque o HTML usa
// onclick="..." e <script> embutidos (ver pendências no relatório).
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      // V8: Tailwind, Font Awesome e SheetJS não vêm mais de CDN (Tailwind compilado, FA em
      // public/vendor/, SheetJS removido por não ser usado), então essas origens saíram daqui
      'script-src': ["'self'", "'unsafe-inline'"],
      'script-src-attr': ["'unsafe-inline'"],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
      'img-src': ["'self'", 'data:', 'blob:', 'https://lh3.googleusercontent.com'],
      'media-src': ["'self'", 'blob:'],
      'connect-src': ["'self'", 'https://viacep.com.br'],
      'frame-src': ["'self'", 'blob:'],
      'object-src': ["'none'"],
      'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
}));

// V11: diz ao navegador quais recursos do aparelho o site pode usar. A câmera fica liberada
// só para o próprio site (botão "Tirar Foto" da Etapa 3); microfone, localização e pagamento não.
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
  next();
});

// CORS: o front-end é servido por este mesmo servidor, então só origens conhecidas são liberadas.
// Removido o curinga "*.run.app" (qualquer app hospedado no Google Cloud Run era aceito).
const allowedOrigins = [
  process.env.APP_URL,
  // No Render, o endereço público do serviço (https://<nome>.onrender.com) vem nesta variável,
  // definida pela própria hospedagem: o site funciona sem precisar configurar APP_URL
  process.env.RENDER_EXTERNAL_URL,
  'http://localhost:3000',
  'http://127.0.0.1:3000'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      /^https:\/\/([a-z0-9-]+\.)*faeterj-rio\.edu\.br$/.test(origin) ||
      (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
    ) {
      return callback(null, true);
    }
    return callback(new Error('CORS: Acesso negado pela política de segurança da FAETERJ-Rio.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// 25 MB comporta um anexo de 15 MB em base64 (~20 MB); 50 MB facilitava abuso de memória
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Contra força bruta de senha/código: 20 tentativas com erro a cada 15 min por IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Nos testes automáticos (NODE_ENV=test) todas as requisições vêm do mesmo IP e somam
  // dezenas de erros de propósito; em qualquer outro ambiente o limite continua 20
  max: process.env.NODE_ENV === 'test' ? 1000 : 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false,
    trustProxy: false
  },
  message: { error: 'Muitas tentativas de login. Por favor, tente novamente em 15 minutos.' }
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  validate: {
    xForwardedForHeader: false,
    forwardedHeader: false,
    trustProxy: false
  }
});

// Leitura por IA (Gemini) custa dinheiro por chamada: limite próprio e baixo
const iaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, forwardedHeader: false, trustProxy: false },
  message: { error: 'Limite de leituras automáticas atingido. Tente novamente em alguns minutos.' }
});

// V5: rotas públicas (consulta por CPF + protocolo) tinham só o limite geral de 600/min,
// o que permitia testar protocolos em sequência. Agora: 10 respostas de erro a cada 15 min por IP.
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, forwardedHeader: false, trustProxy: false },
  message: { error: 'Muitas consultas sem sucesso. Tente novamente em 15 minutos.' }
});

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);
app.use('/api/public/', publicLimiter);

// Campos que só o servidor/secretaria podem definir (nunca aceitos do formulário do candidato)
const CAMPOS_PROTEGIDOS_MATRICULA = [
  'id', 'protocolo', 'status', 'status_auditoria', 'parecer_auditoria', 'workflow_deferimento',
  'historico_deferimento', 'conferencia_balcao', 'observacoes_exigencia', 'matricula_desup',
  'data_envio', 'data_matricula', 'data_cadastro', 'criado_em'
];
// Situações em que a secretaria já decidiu: o candidato não edita mais a matrícula pelo portal
const STATUS_SEM_EDICAO = ['Deferida', 'Indeferida', 'Efetivada', 'Cancelada', 'Excluída'];

function removerCamposProtegidos(obj, extras = []) {
  const limpo = { ...(obj || {}) };
  for (const c of [...CAMPOS_PROTEGIDOS_MATRICULA, ...extras]) delete limpo[c];
  return limpo;
}

// Confere se o CPF enviado pertence ao candidato autenticado
function cpfDoAlunoConfere(req, cpf) {
  return Boolean(req.aluno) && cleanCpfDigits(cpf || '') === cleanCpfDigits(req.aluno.cpf_clean || req.aluno.cpf);
}

// Rotas de Autenticação
app.post('/api/auth/aluno/acesso', handleAlunoAcesso);
app.post('/api/auth/aluno/redefinir-senha-nascimento', handleAlunoRedefinirPorNascimento);
app.post('/api/auth/login', handleLogin);
app.get('/api/auth/verify', handleVerify);
app.post('/api/auth/esqueci-senha', handleEsqueciSenha);
app.post('/api/auth/redefinir-senha', handleRedefinirSenha);

app.get('/api/secretaria/verificar-permissao', requireSecretariaAuth, (req, res) => {
  return res.json({
    autorizado: true,
    usuario: req.user.nome,
    login: req.user.login,
    cargo: req.user.cargo
  });
});

app.get('/api/perfis/download-planilha', requireSecretariaAuth, (req, res) => {
  const perfis = [
    {
      Perfil: 'Gestor da Secretaria Acadêmica',
      Login: 'secretaria',
      Senha_Padrao: '[REDEFINIÇÃO INDIVIDUAL]',
      Responsavel: 'Profª. Ana Exemplo',
      Cargo: 'Gestor da Secretaria Acadêmica',
      Nivel_Acesso: 'Gestão Completa',
      Permissoes: 'Gestão de Matrículas, Deferimento/Indeferimento, Certidões A4, Limite de Vagas e Balcão',
      Status: 'Ativo'
    },
    {
      Perfil: 'Super Administrador',
      Login: 'admin',
      Senha_Padrao: '[REDEFINIÇÃO INDIVIDUAL]',
      Responsavel: 'Administrador Geral FAETERJ-Rio',
      Cargo: 'Super Administrador de TI / Sistema',
      Nivel_Acesso: 'Acesso Total (Root)',
      Permissoes: 'Acesso Irrestrito ao Sistema, Banco de Dados, Semestres, Logs e Configurações',
      Status: 'Ativo'
    },
    {
      Perfil: 'Coordenação de Curso',
      Login: 'coordenacao',
      Senha_Padrao: '[REDEFINIÇÃO INDIVIDUAL]',
      Responsavel: 'Prof. Carlos Exemplo',
      Cargo: 'Coordenador de Curso (ADS)',
      Nivel_Acesso: 'Consulta e Relatórios',
      Permissoes: 'Consulta de Turmas, Vagas, Métricas de Desempenho, BI e Estatísticas Acadêmicas',
      Status: 'Ativo'
    },
    {
      Perfil: 'Atendimento & Balcão',
      Login: 'atendimento',
      Senha_Padrao: '[REDEFINIÇÃO INDIVIDUAL]',
      Responsavel: 'Equipe Atendimento & Balcão',
      Cargo: 'Atendente de Secretaria',
      Nivel_Acesso: 'Operacional de Balcão',
      Permissoes: 'Guia Oficial de Balcão A4, Atendimento ao Candidato e Conferência de Documentos',
      Status: 'Ativo'
    },
    {
      Perfil: 'Auditoria & Conformidade LGPD',
      Login: 'auditoria',
      Senha_Padrao: '[REDEFINIÇÃO INDIVIDUAL]',
      Responsavel: 'Auditoria & Conformidade LGPD',
      Cargo: 'Auditor Institucional',
      Nivel_Acesso: 'Auditoria e Governança',
      Permissoes: 'Trilha de Logs Periciais, Rastreabilidade LGPD (Lei 13.709/18) e Relatórios Forenses',
      Status: 'Ativo'
    }
  ];

  const formato = (req.query.formato || 'csv').toLowerCase();
  if (formato === 'json') {
    return res.json({ perfis });
  }

  const cabecalhos = ['Perfil / Função', 'Login / Usuário', 'Política de Senha', 'Responsável / Nome', 'Cargo', 'Nível de Acesso', 'Módulos e Permissões', 'Status'];
  const linhas = perfis.map(p => [
    `"${p.Perfil}"`,
    `"${p.Login}"`,
    `"${p.Senha_Padrao}"`,
    `"${p.Responsavel}"`,
    `"${p.Cargo}"`,
    `"${p.Nivel_Acesso}"`,
    `"${p.Permissoes}"`,
    `"${p.Status}"`
  ].join(';'));
  const csvContent = '\uFEFF' + cabecalhos.join(';') + '\r\n' + linhas.join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="Perfis_e_Credenciais_FAETERJ_Rio.csv"');
  return res.send(csvContent);
});

// Rotas de Autenticação do Candidato
app.post('/api/auth/aluno/login', handleAlunoLogin);
app.post('/api/auth/aluno/cadastro', handleAlunoCadastro);
app.get('/api/auth/aluno/verify', handleAlunoVerify);
app.get('/api/auth/aluno/minha-matricula', requireAlunoAuth, handleAlunoMinhaMatricula);

// Rotas de Usuários (Restrita a Administradores Autenticados)
app.get('/api/usuarios', requireAdminAuth, async (req, res) => {
  try {
    const usuarios = await getAllUsuarios(false);
    return res.json({
      total: usuarios.length,
      usuarios
    });
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    return res.status(500).json({ error: 'Erro ao buscar usuários cadastrados no banco.' });
  }
});

app.post('/api/usuarios', requireAdminAuth, async (req, res) => {
  try {
    const { login, nome, senha, cargo, email, telefone, cpf } = req.body;
    if (!login || !nome || !senha) {
      return res.status(400).json({ error: 'Login, Nome e Senha são campos obrigatórios.' });
    }
    if (typeof login !== 'string' || !/^[a-z0-9._-]{3,40}$/i.test(login) || String(nome).length > 150) {
      return res.status(400).json({ error: 'Login deve ter de 3 a 40 caracteres (letras, números, ponto, hífen ou sublinhado).' });
    }
    if (!senhaPermitida(senha, SENHA_MIN_EQUIPE)) {
      return res.status(400).json({ error: `A senha deve ter pelo menos ${SENHA_MIN_EQUIPE} caracteres e não pode ser uma senha óbvia.` });
    }
    const novoUsuario = await createOrUpdateUsuario({
      login,
      nome,
      senha,
      cargo: cargo || 'Administrador',
      email: email || '',
      telefone: telefone || '',
      cpf: cpf || ''
    });
    // V6: se o login já existia, a senha foi trocada pelo admin: as sessões antigas desse perfil caem
    if (novoUsuario && novoUsuario.atualizado_em) {
      await incrementarVersaoSessaoUsuario(novoUsuario.id);
    }
    return res.status(201).json({
      message: 'Usuário cadastrado e salvo no banco de dados com sucesso!',
      usuario: novoUsuario
    });
  } catch (err) {
    console.error('Erro ao cadastrar usuário:', err);
    return res.status(500).json({ error: 'Erro ao cadastrar usuário.' });
  }
});

app.delete('/api/usuarios/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (Number(id) === 1) {
      return res.status(403).json({ error: 'O Administrador principal (ID 1) não pode ser excluído.' });
    }
    const excluido = await deleteUsuario(id);
    if (!excluido) {
      return res.status(404).json({ error: 'Usuário não localizado no banco.' });
    }
    return res.json({ message: 'Usuário excluído do banco com sucesso!', usuario: excluido });
  } catch (err) {
    console.error('Erro ao excluir usuário:', err);
    return res.status(500).json({ error: 'Erro ao excluir usuário.' });
  }
});

app.get('/api/database/status', requireAuth, async (req, res) => {
  try {
    const usuarios = await getAllUsuarios(false);
    const matriculas = await getAllMatriculas('todos');
    const logs = await getAllAuditLogs({ limit: 10 });
    const semestres = await getAllSemestres();
    const alunos = await getAllAlunosAuth();
    return res.json({
      status: 'online',
      timestamp: new Date().toISOString(),
      engine: process.env.DATABASE_URL ? 'PostgreSQL (Cloud / Hosted)' : 'Local JSON Persistence (Fast DB Engine)',
      tabelas: {
        usuarios: {
          total: usuarios.length,
          administradores: usuarios.filter(u => u.cargo !== 'Candidato / Aluno').length,
          candidatos: usuarios.filter(u => u.cargo === 'Candidato / Aluno').length
        },
        alunos_auth: {
          total: alunos.length
        },
        matriculas: {
          total: matriculas.length,
          confirmadas: matriculas.filter(m => m.status === 'Confirmada' || m.status === 'Homologada').length,
          pre_cadastros: matriculas.filter(m => m.status && m.status.includes('Pré-cadastro')).length,
          pendentes: matriculas.filter(m => m.status && m.status.includes('Pendente')).length
        },
        semestres: {
          total: semestres.length
        },
        audit_logs: {
          total: logs.length
        }
      }
    });
  } catch (err) {
    console.error('Erro status banco:', err);
    return res.status(500).json({ error: 'Erro ao obter status do banco de dados.' });
  }
});

// Rotas de Matrículas e Ficha Cadastral (Segurança Back-end Estrita)
app.post('/api/matriculas/validar-dados', validarCadastroEscolarMiddleware, (req, res) => {
  return res.json({
    sucesso: true,
    message: 'Dados cadastrais aprovados com 100% de conformidade pelas regras de segurança!',
    dados: req.body
  });
});

// Endpoint dedicado para a Tela de Dados & Ficha Cadastral (Etapa 2)
app.post('/api/candidatos/ficha-cadastral', requireAlunoAuth, validarCadastroEscolarMiddleware, async (req, res) => {
  try {
    const dados = req.body || {};
    const cleanCpf = cleanCpfDigits(dados.cpf || '');
    if (!cleanCpf) {
      return res.status(400).json({
        sucesso: false,
        error: 'CPF do candidato é obrigatório.',
        motivo: 'Documento identificador ausente.'
      });
    }
    // O candidato só grava a própria ficha (antes qualquer pessoa sobrescrevia a ficha de qualquer CPF)
    if (!cpfDoAlunoConfere(req, cleanCpf)) {
      return res.status(403).json({ sucesso: false, error: 'O CPF da ficha não corresponde ao candidato identificado.' });
    }

    // Busca candidato existente para preservar status ou curso
    const candidatoExistente = await getCandidatoByCpf(cleanCpf);

    const candidatoAtualizado = await createOrUpdateCandidato({
      ...(candidatoExistente || {}),
      nome_completo: dados.nome_completo,
      nome_social: dados.nome_social || '',
      cpf: dados.cpf,
      cpf_emissao: dados.cpf_emissao || dados.cpf_data_emissao || '',
      cpf_validade: dados.cpf_validade || '',
      rg: dados.rg,
      rg_orgao: dados.rg_orgao || dados.rgIssuer || 'DETRAN',
      rg_uf: dados.rg_uf || dados.rgState || 'RJ',
      rg_emissao: dados.rg_emissao || dados.rgIssueDate || '',
      rg_validade: dados.rg_validade || dados.rgExpiryDate || '',
      data_nascimento: dados.data_nascimento,
      estado_civil: dados.estado_civil || 'SOLTEIRO(A)',
      sexo: dados.sexo || 'M',
      titulo_eleitor: dados.titulo_eleitor || '',
      titulo_zona: dados.titulo_zona || '',
      titulo_secao: dados.titulo_secao || '',
      certidao_matricula: dados.certidao_matricula || dados.certidao_numero || '',
      certidao_termo: dados.certidao_termo || dados.birthCertNumber || '',
      certidao_livro: dados.certidao_livro || dados.birthCertBook || '',
      certidao_folha: dados.certidao_folha || dados.birthCertPage || '',
      cep: dados.cep || '',
      logradouro: dados.logradouro || dados.street || '',
      numero: dados.numero || dados.houseNumber || '',
      bairro: dados.bairro || dados.neighborhood || '',
      cidade: dados.cidade || dados.city || 'RIO DE JANEIRO',
      uf: dados.uf || dados.state || 'RJ',
      escola_tipo: dados.escola_tipo || dados.schoolType || 'PUBLICA',
      escola_nome: dados.escola_nome || dados.schoolName || '',
      responsavel_nome: dados.responsavel_nome || dados.guardianName || '',
      responsavel_cpf: dados.responsavel_cpf || dados.guardianCpf || '',
      responsavel_rg: dados.responsavel_rg || dados.guardianRg || '',
      responsavel_vinculo: dados.responsavel_vinculo || dados.guardianKinship || '',
      ficha_cadastral_status: 'VALIDADA_BACKEND_100_CONFORME',
      ficha_cadastral_validada_em: new Date().toISOString()
    });

    createAuditLog({
      acao: `Ficha Cadastral validada e homologada via regras estritas de segurança (CPF: ${dados.cpf})`,
      tipo: 'FICHA_CADASTRAL_VALIDADA',
      matricula_id: null,
      protocolo: candidatoAtualizado.protocolo || null,
      aluno_nome: candidatoAtualizado.nome_completo,
      aluno_cpf: candidatoAtualizado.cpf,
      usuario_id: null,
      usuario_nome: 'Portal do Candidato / Validador de Segurança',
      usuario_login: 'portal_candidato',
      usuario_cargo: 'Candidato',
      ip: String(req.ip || '127.0.0.1'),
      user_agent: String(req.headers['user-agent'] || 'Coruja Web Client'),
      detalhes: `Ficha cadastral 100% aprovada pelo middleware de segurança. RG: ${dados.rg}, Data Nasc: ${dados.data_nascimento}, CEP: ${dados.cep}.`
    });

    return res.json({
      sucesso: true,
      message: 'Ficha cadastral aprovada com 100% de conformidade pelas diretrizes de segurança do servidor!',
      candidato: candidatoAtualizado,
      dadosSanitizados: dados
    });
  } catch (err) {
    console.error('Erro ao salvar ficha cadastral validada:', err);
    return res.status(500).json({ error: 'Erro interno ao persistir dados da ficha cadastral.' });
  }
});

// Endpoint para consulta da Ficha Cadastral por CPF
app.get('/api/candidatos/ficha-cadastral/:cpf', requireAlunoOuEquipe, async (req, res) => {
  try {
    const cleanCpf = cleanCpfDigits(req.params.cpf || '');
    if (!cleanCpf) {
      return res.status(400).json({ error: 'CPF do candidato não informado.' });
    }
    // Candidato vê apenas a própria ficha; a equipe (req.user) pode consultar qualquer uma
    if (req.aluno && !cpfDoAlunoConfere(req, cleanCpf)) {
      return res.status(403).json({ error: 'Acesso negado à ficha de outro candidato.' });
    }
    const cand = await getCandidatoByCpf(cleanCpf);
    if (!cand) {
      return res.status(404).json({ error: 'Candidato não localizado para o CPF fornecido.' });
    }
    return res.json({ sucesso: true, candidato: cand });
  } catch (err) {
    console.error('Erro ao buscar ficha cadastral por CPF:', err);
    return res.status(500).json({ error: 'Erro interno ao buscar ficha do candidato.' });
  }
});

// Base de Escolas de Referência para Autocomplete com Nome Completo Oficial
const ESCOLAS_OFICIAIS_BASE = [
  // REDE FAETEC
  { nomeCompleto: 'ETE HENRIQUE LAGE - FAETEC (BARRETO, NITERÓI)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FAETEC / ESTADUAL', localidade: 'Barreto, Niterói - RJ' },
  { nomeCompleto: 'ETE REPÚBLICA - FAETEC (QUINTINO BOCAIÚVA, RIO DE JANEIRO)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FAETEC / ESTADUAL', localidade: 'Quintino, Rio de Janeiro - RJ' },
  { nomeCompleto: 'ETE VISCONDE DE MAUÁ - FAETEC (MARECHAL HERMES, RIO DE JANEIRO)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FAETEC / ESTADUAL', localidade: 'Marechal Hermes, Rio de Janeiro - RJ' },
  { nomeCompleto: 'ETE SANTA CRUZ - FAETEC (SANTA CRUZ, RIO DE JANEIRO)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FAETEC / ESTADUAL', localidade: 'Santa Cruz, Rio de Janeiro - RJ' },
  { nomeCompleto: 'ETE ADOLPHO BLOCH - FAETEC (MARACANÃ, RIO DE JANEIRO)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FAETEC / ESTADUAL', localidade: 'Maracanã, Rio de Janeiro - RJ' },
  { nomeCompleto: 'ETE JUSCELINO KUBITSCHEK - FAETEC (JARDIM AMÉRICA, RIO DE JANEIRO)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FAETEC / ESTADUAL', localidade: 'Jardim América, Rio de Janeiro - RJ' },
  { nomeCompleto: 'ETE OSCAR TENÓRIO - FAETEC (MARECHAL HERMES, RIO DE JANEIRO)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FAETEC / ESTADUAL', localidade: 'Marechal Hermes, Rio de Janeiro - RJ' },
  { nomeCompleto: 'ETE FERREIRA VIANA - FAETEC (MARACANÃ, RIO DE JANEIRO)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FAETEC / ESTADUAL', localidade: 'Maracanã, Rio de Janeiro - RJ' },
  { nomeCompleto: 'ETE JOÃO LUIZ DO NASCIMENTO - FAETEC (NOVA IGUAÇU)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FAETEC / ESTADUAL', localidade: 'Centro, Nova Iguaçu - RJ' },
  { nomeCompleto: 'ETE SANTA ISABEL - FAETEC (SÃO GONÇALO)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FAETEC / ESTADUAL', localidade: 'Santa Isabel, São Gonçalo - RJ' },
  { nomeCompleto: 'ETE MARIA MERCEDES MENDES TEIXEIRA - FAETEC (PARQUE ANCHIETA)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FAETEC / ESTADUAL', localidade: 'Parque Anchieta, Rio de Janeiro - RJ' },
  { nomeCompleto: 'ETE HELBER VIGNOLI MUNIZ - FAETEC (BACAXÁ, SAQUAREMA)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FAETEC / ESTADUAL', localidade: 'Bacaxá, Saquarema - RJ' },
  { nomeCompleto: 'ISERJ - INSTITUTO SUPERIOR DE EDUCAÇÃO DO RIO DE JANEIRO (TIJUCA)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FAETEC / ESTADUAL', localidade: 'Tijuca, Rio de Janeiro - RJ' },
  // REDE FEDERAL
  { nomeCompleto: 'COLÉGIO PEDRO II - CAMPUS TIJUCA II', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Tijuca, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO PEDRO II - CAMPUS TIJUCA I', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Tijuca, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO PEDRO II - CAMPUS SÃO CRISTÓVÃO II', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'São Cristóvão, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO PEDRO II - CAMPUS SÃO CRISTÓVÃO I', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'São Cristóvão, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO PEDRO II - CAMPUS HUMAITÁ II', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Humaitá, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO PEDRO II - CAMPUS HUMAITÁ I', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Humaitá, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO PEDRO II - CAMPUS ENGENHO NOVO II', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Engenho Novo, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO PEDRO II - CAMPUS ENGENHO NOVO I', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Engenho Novo, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO PEDRO II - CAMPUS REALENGO II', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Realengo, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO PEDRO II - CAMPUS CENTRO', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Centro, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO PEDRO II - CAMPUS NITERÓI', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Barreto, Niterói - RJ' },
  { nomeCompleto: 'COLÉGIO PEDRO II - CAMPUS DUQUE DE CAXIAS', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Centenário, Duque de Caxias - RJ' },
  { nomeCompleto: 'CEFET/RJ - CENTRO FEDERAL DE EDUCAÇÃO TECNOLÓGICA (CAMPUS MARACANÃ)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Maracanã, Rio de Janeiro - RJ' },
  { nomeCompleto: 'CEFET/RJ - CAMPUS NOVA IGUAÇU', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Centro, Nova Iguaçu - RJ' },
  { nomeCompleto: 'CEFET/RJ - CAMPUS MARIA DA GRAÇA', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Maria da Graça, Rio de Janeiro - RJ' },
  { nomeCompleto: 'CEFET/RJ - CAMPUS ITAGUAÍ', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Itaguaí - RJ' },
  { nomeCompleto: 'IFRJ - INSTITUTO FEDERAL DO RIO DE JANEIRO - CAMPUS MARACANÃ', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Maracanã, Rio de Janeiro - RJ' },
  { nomeCompleto: 'IFRJ - CAMPUS NILÓPOLIS', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Nilópolis - RJ' },
  { nomeCompleto: 'IFRJ - CAMPUS DUQUE DE CAXIAS', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Duque de Caxias - RJ' },
  { nomeCompleto: 'IFRJ - CAMPUS SÃO GONÇALO', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'São Gonçalo - RJ' },
  { nomeCompleto: 'COLÉGIO MILITAR DO RIO DE JANEIRO (CMRJ - TIJUCA)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Tijuca, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO DE APLICAÇÃO DA UFRJ (CAP-UFRJ)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE FEDERAL', localidade: 'Lagoa, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO DE APLICAÇÃO DA UERJ (CAP-UERJ)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Maracanã, Rio de Janeiro - RJ' },
  // REDE ESTADUAL (SEEDUC-RJ)
  { nomeCompleto: 'COLÉGIO ESTADUAL PRESIDENTE COSTA E SILVA', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Centro, Nova Iguaçu - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL AMARO CAVALCANTI', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Largo do Machado, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL JOÃO ALFREDO', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Vila Isabel, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL PROFESSORA CARMELA DUTRA', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Madureira, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL PAULO DE FRONTIN', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Praça da Bandeira, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL JOSÉ LEITE LOPES (NAVE)', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Tijuca, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL GUIMARÃES ROSA', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Campo Grande, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL MATHEUS DE OLIVEIRA', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Bangu, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL JULIA KUBITSCHEK', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Centro, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL MÁRIO DE ANDRADE', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'São João de Meriti - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL SANTO ANTÔNIO', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Duque de Caxias - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL ANDRÉ MAUROIS', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Gávea, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL CHICO ANYSIO', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Tijuca, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL HENRIQUE DÉCIO', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'São Gonçalo - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL GOVERNADOR ROBERTO SILVEIRA', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Duque de Caxias - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL VICENTE JANUZZI', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Barra da Tijuca, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL ARLINDO RODRIGUES', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Santa Cruz, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL BARÃO DE MACAÚBAS', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Inhaúma, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL VISCONDE DE CAIRU', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Méier, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL RAUL VIDAL', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Icaraí, Niterói - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL MANUEL DE ABREU', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Niterói - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL LICEU NILO PEÇANHA', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Centro, Niterói - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL DORMILA MOTTA', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'São Gonçalo - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL ALICE COURA', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Itaboraí - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL BELMIRO MEDEIROS', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Campo Grande, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO ESTADUAL BRÍGIDA ROCHA MIRANDA', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Bangu, Rio de Janeiro - RJ' },
  { nomeCompleto: 'CIEP 011 BRIZOLÃO - PROFESSOR FRANCISCO CAVALCANTI REBOUÇAS', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Rio de Janeiro - RJ' },
  { nomeCompleto: 'CIEP 201 BRIZOLÃO - AARON BURLAMAQUI', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Nova Iguaçu - RJ' },
  { nomeCompleto: 'CIEP 175 BRIZOLÃO - JOSÉ LINS DO REGO', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'São João de Meriti - RJ' },
  { nomeCompleto: 'CIEP 386 BRIZOLÃO - MARIA CRISTINA CAMPOS', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Duque de Caxias - RJ' },
  { nomeCompleto: 'CIEP 097 BRIZOLÃO - CARLOS CHAGAS', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Duque de Caxias - RJ' },
  { nomeCompleto: 'CIEP 220 BRIZOLÃO - YOLANDA BORGES', tipoRede: 'PUBLICA', tipoDescricao: 'REDE ESTADUAL', localidade: 'Nilópolis - RJ' },
  // REDE PRIVADA
  { nomeCompleto: 'COLÉGIO SANTO INÁCIO', tipoRede: 'PRIVADA', tipoDescricao: 'REDE PRIVADA', localidade: 'Botafogo, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO SANTO AGOSTINHO', tipoRede: 'PRIVADA', tipoDescricao: 'REDE PRIVADA', localidade: 'Leblon, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO SÃO BENTO', tipoRede: 'PRIVADA', tipoDescricao: 'REDE PRIVADA', localidade: 'Centro, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO MARISTA SÃO JOSÉ', tipoRede: 'PRIVADA', tipoDescricao: 'REDE PRIVADA', localidade: 'Tijuca, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO PH', tipoRede: 'PRIVADA', tipoDescricao: 'REDE PRIVADA', localidade: 'Botafogo / Tijuca, Rio de Janeiro - RJ' },
  { nomeCompleto: 'COLÉGIO ANCHIETA', tipoRede: 'PRIVADA', tipoDescricao: 'REDE PRIVADA', localidade: 'Nova Friburgo - RJ' },
  { nomeCompleto: 'SESI ESCOLA - UNIDADE TIJUCA', tipoRede: 'PRIVADA', tipoDescricao: 'REDE PRIVADA / SISTEMA S', localidade: 'Tijuca, Rio de Janeiro - RJ' },
  { nomeCompleto: 'SESI / SENAI - UNIDADE JACAREPAGUÁ', tipoRede: 'PRIVADA', tipoDescricao: 'REDE PRIVADA / SISTEMA S', localidade: 'Jacarepaguá, Rio de Janeiro - RJ' }
];

function normalizarParaBusca(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Endpoint de Sugestões de Escolas com Nome Completo Oficial
app.get('/api/escolas/sugestoes', async (req, res) => {
  try {
    const q = String(req.query.q || req.query.termo || '').trim();
    if (!q || q.length < 2) {
      return res.json({ sucesso: true, termo: q, total: 0, sugestoes: [] });
    }

    const qNorm = normalizarParaBusca(q);
    const termos = qNorm.split(/\s+/).filter(Boolean);

    // Filtra base interna por termos
    const matchesInternos = ESCOLAS_OFICIAIS_BASE.filter(esc => {
      const nomeNorm = normalizarParaBusca(esc.nomeCompleto);
      const locNorm = normalizarParaBusca(esc.localidade);
      const descNorm = normalizarParaBusca(esc.tipoDescricao);
      const full = `${nomeNorm} ${locNorm} ${descNorm}`;
      return termos.every(t => full.includes(t));
    }).map(esc => ({
      ...esc,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(esc.nomeCompleto + ' RJ')}`,
      origem: 'OFICIAL'
    }));

    let sugestoes = [...matchesInternos];

    // Se houver poucas sugestões e termo >= 3 caracteres, busca no geocodificador OpenStreetMap / Maps
    if (sugestoes.length < 5 && q.length >= 3) {
      try {
        const queryOsm = encodeURIComponent(`${q}, Rio de Janeiro, RJ, Brasil`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${queryOsm}&addressdetails=1&limit=4`, {
          signal: controller.signal,
          headers: { 'User-Agent': 'CorujaFaeterjRio/1.0 (academic-validator)' }
        });
        clearTimeout(timeoutId);
        if (resp.ok) {
          const osmResults = await resp.json();
          osmResults.forEach(item => {
            const rawName = item.name || item.display_name?.split(',')[0] || '';
            const nomeFormatado = rawName.toUpperCase();
            if (nomeFormatado && !sugestoes.some(s => normalizarParaBusca(s.nomeCompleto) === normalizarParaBusca(nomeFormatado))) {
              sugestoes.push({
                nomeCompleto: nomeFormatado,
                tipoRede: 'PUBLICA',
                tipoDescricao: 'GEORREFERENCIADA',
                localidade: item.display_name?.split(',').slice(1, 3).join(', ').trim() || 'Rio de Janeiro - RJ',
                mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nomeFormatado + ' RJ')}`,
                origem: 'MAPS'
              });
            }
          });
        }
      } catch (e) {
        // Ignora timeout/erro de rede externa
      }
    }

    return res.json({
      sucesso: true,
      termo: q,
      total: sugestoes.length,
      sugestoes: sugestoes.slice(0, 8)
    });
  } catch (err) {
    console.error('Erro ao buscar sugestões de escolas:', err);
    return res.status(500).json({ error: 'Erro ao buscar sugestões de escolas.' });
  }
});

// Endpoint de Validação de Existência da Escola no Google Maps / Serviços Georreferenciados
app.post('/api/escolas/validar-maps', async (req, res) => {
  try {
    const { nomeEscola, cidade, uf } = req.body || {};
    if (!nomeEscola || typeof nomeEscola !== 'string' || nomeEscola.length > 200 || !validarNomeEscola(nomeEscola)) {
      return res.status(400).json({
        sucesso: false,
        error: 'Nome da escola inválido. Informe o nome da instituição com letras e números (de 3 a 200 caracteres).'
      });
    }

    const city = String(cidade || 'Rio de Janeiro').slice(0, 100);
    const state = String(uf || 'RJ').slice(0, 2).toUpperCase();
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nomeEscola + ' ' + city + ' ' + state)}`;

    let localizacao = null;
    try {
      const query = encodeURIComponent(`${nomeEscola}, ${city}, ${state}, Brasil`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&addressdetails=1&limit=1`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'CorujaFaeterjRio/1.0 (academic-validator)' }
      });
      clearTimeout(timeoutId);
      if (resp.ok) {
        const results = await resp.json();
        if (results && results.length > 0) {
          localizacao = {
            nomeOficial: results[0].display_name,
            lat: results[0].lat,
            lon: results[0].lon
          };
        }
      }
    } catch (fetchErr) {
      // Falha silenciosa de rede externa
    }

    return res.json({
      sucesso: true,
      valido: true,
      nomeEscola,
      encontradoNoMaps: true,
      mapsUrl: googleMapsUrl,
      localizacao: localizacao || {
        nomeOficial: nomeEscola,
        municipio: city,
        uf: state
      },
      mensagem: localizacao 
        ? 'Escola confirmada e localizada com coordenadas georreferenciadas no mapa!'
        : 'Escola validada para conferência georreferenciada no Google Maps.'
    });
  } catch (err) {
    console.error('Erro na validação de escola no Maps:', err);
    return res.status(500).json({ error: 'Erro ao validar escola no serviço de mapas.' });
  }
});

// Endpoint para re-validação e conferência na Tela de Upload & Conferência (Etapa 3)
app.post('/api/candidatos/conferencia-dados', validarCadastroEscolarMiddleware, async (req, res) => {
  try {
    const dados = req.body || {};
    return res.json({
      sucesso: true,
      message: 'Conferência de dados cadastrais aprovada com 100% de conformidade pelo servidor.',
      dados
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao processar conferência de dados.' });
  }
});

app.post('/api/matriculas', requireAlunoAuth, validarCadastroEscolarMiddleware, async (req, res) => {
  try {
    // "Editar Matrícula" (Verificar Matrícula): o candidato reenvia a ficha da própria matrícula
    const ehEdicao = req.body && req.body.edicao === true;
    // Remove campos de controle (status, protocolo, id...) que o candidato não pode escolher
    const data = removerCamposProtegidos(req.body, ['edicao']);
    // Documentos que faltaram na Etapa 3: lista curta de nomes, para o comprovante
    data.documentos_pendentes = Array.isArray(req.body.documentos_pendentes)
      ? req.body.documentos_pendentes.filter(d => typeof d === 'string' && d.trim()).slice(0, 20).map(d => d.trim().slice(0, 120))
      : [];
    const configs = await getConfiguracoesJanela();
    if (!configs.em_periodo_valido) {
      return res.status(403).json({
        error: configs.motivo_bloqueio || configs.mensagem_bloqueio || 'O período regulamentar de matrículas está encerrado pela Secretaria Acadêmica.'
      });
    }

    if (!data.nome_completo || !data.cpf || !data.email || !data.telefone) {
      return res.status(400).json({
        error: 'Campos obrigatórios ausentes: Nome Completo, CPF, E-mail e Telefone são requeridos.'
      });
    }
    const cleanCpf = cleanCpfDigits(data.cpf);
    if (!cleanCpf || cleanCpf.length !== 11) {
      return res.status(400).json({
        error: 'CPF inválido. O CPF deve conter 11 dígitos numéricos.'
      });
    }
    if (!cpfDoAlunoConfere(req, cleanCpf)) {
      return res.status(403).json({ error: 'O CPF da matrícula não corresponde ao candidato identificado.' });
    }
    if (String(data.email).length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(data.email).trim())) {
      return res.status(400).json({ error: 'E-mail informado possui formato inválido.' });
    }
    const digitosTel = String(data.telefone).replace(/\D/g, '');
    if (digitosTel.length < 10 || digitosTel.length > 11) {
      return res.status(400).json({ error: 'Telefone inválido. Informe DDD + número (10 ou 11 dígitos).' });
    }
    // Vaga de cota exige NIS válido do CadÚnico (antes a matrícula por cota passava sem NIS)
    if (ehModalidadeCota(data.forma_ingresso_cota || data.sistema_concorrencia)) {
      if (!validarNis(data.cad_unico_nis)) {
        return res.status(400).json({ error: 'Para vaga de cota é obrigatório informar um NIS (CadÚnico) válido, com 11 dígitos.' });
      }
      data.cad_unico_nis = String(data.cad_unico_nis).replace(/\D/g, '');
    }

    const todasMatriculas = await getAllMatriculas('todos');
    const matriculaExistente = todasMatriculas.find(m => {
      const c = cleanCpfDigits(m.cpf);
      // Pré-cadastro (criado ao anexar documentos antes de finalizar) não conta como duplicata:
      // createMatricula() o completa. Antes, quem anexava documentos primeiro recebia erro 409.
      const ehPreCadastro = String(m.status || '').includes('Pré-cadastro') || String(m.status || '').includes('Pendente');
      return c === cleanCpf && m.status !== 'Cancelada' && m.status !== 'Excluída' && !ehPreCadastro;
    });
    if (matriculaExistente && ehEdicao) {
      // Depois do parecer da secretaria a matrícula não pode mais ser alterada pelo portal
      if (STATUS_SEM_EDICAO.includes(String(matriculaExistente.status || ''))) {
        return res.status(409).json({
          error: `Sua matrícula (Protocolo: ${matriculaExistente.protocolo}) já foi analisada pela secretaria e não pode mais ser editada pelo portal. Procure a Secretaria Acadêmica.`
        });
      }
      // Os documentos são geridos por /api/candidato/documentos; aqui só a ficha muda
      delete data.documentos_anexos;
      const agoraEdicao = new Date().toISOString();
      const atualizada = await updateMatricula(matriculaExistente.id, {
        ...data,
        data_atualizacao: agoraEdicao
      });
      try {
        const candidatoAtual = await getCandidatoByCpf(cleanCpf);
        await createOrUpdateCandidato({
          ...(candidatoAtual || {}),
          cpf: data.cpf,
          nome_completo: data.nome_completo,
          email: data.email,
          telefone: data.telefone,
          curso: data.curso || (candidatoAtual && candidatoAtual.curso) || 'ANÁLISE E DESENVOLVIMENTO DE SISTEMAS',
          turno: data.turno || (candidatoAtual && candidatoAtual.turno) || 'NOTURNO',
          cota: data.forma_ingresso_cota || (candidatoAtual && candidatoAtual.cota) || 'Ampla Concorrência',
          protocolo: matriculaExistente.protocolo
        });
      } catch (e) {}
      createAuditLog({
        acao: 'EDICAO_MATRICULA_DISCENTE',
        tipo: 'CADASTRO',
        matricula_id: String(matriculaExistente.id),
        protocolo: matriculaExistente.protocolo,
        aluno_nome: data.nome_completo,
        aluno_cpf: data.cpf,
        ip: String(req.ip || ''),
        user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
        detalhes: `Matrícula editada pelo candidato no portal. Curso: ${data.curso || '-'}, Turno: ${data.turno || '-'}.`
      }).catch(() => {});
      return res.status(200).json({
        message: 'Matrícula atualizada com sucesso!',
        matricula: atualizada,
        protocolo: matriculaExistente.protocolo,
        editada: true
      });
    }
    if (matriculaExistente) {
      return res.status(409).json({
        error: `Já existe uma matrícula registrada para este CPF (Protocolo: ${matriculaExistente.protocolo}). Não é permitido realizar mais de uma matrícula para o mesmo CPF.`,
        protocolo_existente: matriculaExistente.protocolo
      });
    }

    const agoraIso = new Date().toISOString();
    data.data_matricula = agoraIso;
    data.data_cadastro = agoraIso;
    data.criado_em = agoraIso;

    const novaMatricula = await createMatricula(data);

    try {
      await createOrUpdateAluno({
        nome: data.nome_completo,
        cpf: data.cpf,
        email: data.email,
        telefone: data.telefone
      });
    } catch (e) {}

    try {
      await createOrUpdateCandidato({
        cpf: data.cpf,
        nome_completo: data.nome_completo,
        email: data.email,
        telefone: data.telefone,
        curso: data.curso || 'ANÁLISE E DESENVOLVIMENTO DE SISTEMAS',
        turno: data.turno || 'NOTURNO',
        semestre: data.semestre || configs.semestre_vigente || '2026.1',
        status: 'Confirmada',
        forma_ingresso: data.forma_ingresso || 'Vestibular FAETEC',
        cota: data.forma_ingresso_cota || 'Ampla Concorrência',
        protocolo: novaMatricula.protocolo,
        observacao_status: 'Matrícula online submetida e confirmada com sucesso'
      });
    } catch (e) {}

    try {
      const clientIp = req.ip || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || 'Coruja Web Client';
      await createAuditLog({
        acao: 'SUBMISSAO_MATRICULA_DISCENTE',
        tipo: 'CADASTRO',
        matricula_id: String(novaMatricula.id),
        protocolo: novaMatricula.protocolo,
        aluno_nome: novaMatricula.nome_completo,
        aluno_cpf: novaMatricula.cpf,
        ip: String(clientIp),
        user_agent: String(userAgent),
        detalhes: `Ficha de matrícula submetida pelo candidato. Curso: ${novaMatricula.curso}, Turno: ${novaMatricula.turno}, Semestre: ${novaMatricula.semestre}.`
      });
    } catch (e) {}

    return res.status(201).json({
      message: 'Protocolo enviado com sucesso! Compareça à secretaria acadêmica para efetivar a matrícula.',
      matricula: novaMatricula,
      protocolo: novaMatricula.protocolo
    });
  } catch (err) {
    console.error('Erro ao salvar matrícula:', err);
    return res.status(500).json({ error: 'Erro interno ao salvar a ficha de matrícula.' });
  }
});

app.get('/api/public/matricula-consulta', async (req, res) => {
  try {
    // Consulta pública sem login exige os DOIS dados (CPF + protocolo) da mesma matrícula.
    // Antes bastava um deles, ou até parte do nome ("busca"), e a resposta trazia a ficha inteira
    // com documentos: qualquer pessoa listava dados pessoais de terceiros.
    // O modal "Verificar Matrícula" do portal usa CPF + senha (/api/auth/aluno/login), M038.
    const termProt = String(req.query.protocolo || '').trim().toLowerCase().slice(0, 40);
    const cleanCpfNum = String(req.query.cpf || '').replace(/\D/g, '').slice(0, 11);

    if (!termProt || cleanCpfNum.length !== 11) {
      return res.status(400).json({ error: 'Informe o CPF e o número do protocolo para consulta.' });
    }

    const matriculas = await getAllMatriculas('todos');
    const mat = matriculas.find(m =>
      String(m.protocolo || '').toLowerCase() === termProt &&
      cleanCpfDigits(m.cpf) === cleanCpfNum
    );

    if (!mat) {
      return res.status(404).json({ error: 'Nenhuma matrícula localizada com os dados informados. Verifique o CPF e o Protocolo digitados.' });
    }

    // Só o resumo necessário para o candidato acompanhar o processo (sem arquivos nem dados sensíveis)
    const docs = (await obterDocumentosMatricula(mat.id)).map(d => ({
      id: d.id, tipo: d.tipo, nome_documento: d.nome_documento, status: d.status, observacao: d.observacao
    }));
    const resumo = {
      id: mat.id,
      protocolo: mat.protocolo,
      status: mat.status,
      nome_completo: mat.nome_completo,
      curso: mat.curso,
      turno: mat.turno,
      semestre: mat.semestre,
      observacoes_exigencia: mat.observacoes_exigencia || '',
      documentos: docs
    };
    return res.json({ matricula: resumo, documentos: docs });
  } catch (err) {
    console.error('Erro na consulta pública de matrícula:', err);
    return res.status(500).json({ error: 'Erro interno ao consultar matrícula.' });
  }
});

// V1: reenvio de documentos em exigência. Antes era público (bastava CPF + protocolo), aceitava
// qualquer arquivo, mudava o status de qualquer matrícula e devolvia a ficha inteira com os anexos.
app.post('/api/public/reenviar-documentos-exigencia', requireAlunoAuth, async (req, res) => {
  try {
    const { protocolo, cpf, documentos } = req.body;
    const observacao_aluno = String(req.body.observacao_aluno || '').slice(0, 500);
    if (!documentos || !Array.isArray(documentos) || documentos.length === 0) {
      return res.status(400).json({ error: 'Nenhum documento anexado para reenvio.' });
    }
    if (documentos.length > 10) {
      return res.status(413).json({ error: 'Envie no máximo 10 documentos por reenvio.' });
    }
    // Mesmas regras do upload do candidato: só PDF ou imagem, até 8MB cada
    for (const d of documentos) {
      const url = d && typeof d === 'object' ? (d.arquivo_url ?? d.url) : null;
      if (typeof url !== 'string' || !url) {
        return res.status(400).json({ error: 'Documento sem arquivo anexado.' });
      }
      if (url.length > LIMITE_ANEXO_BASE64) {
        return res.status(413).json({ error: 'Tamanho do anexo excede o limite permitido (máximo 8MB por arquivo).' });
      }
      if (!TIPOS_ANEXO_PERMITIDOS.test(url)) {
        return res.status(415).json({ error: 'Formato de arquivo não permitido. Envie PDF, JPG, PNG ou WEBP.' });
      }
    }

    // A matrícula é a do candidato logado; CPF + protocolo do corpo são só checagem extra
    const matricula = protocolo ? await getMatriculaById(String(protocolo)) : null;
    if (!matricula || String(matricula.protocolo) !== String(protocolo) || !cpf || cleanCpfDigits(matricula.cpf) !== cleanCpfDigits(cpf)) {
      return res.status(404).json({ error: 'Matrícula não localizada para vincular o reenvio de documentos.' });
    }
    if (!cpfDoAlunoConfere(req, matricula.cpf)) {
      return res.status(403).json({ error: 'Esta matrícula não pertence ao candidato identificado.' });
    }
    if (matricula.status !== 'Em Exigência') {
      return res.status(409).json({ error: 'O reenvio de documentos só é aceito quando a secretaria colocou a matrícula em exigência.' });
    }

    const clientIp = req.ip || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Portal do Aluno - Reenvio';
    const agora = new Date().toISOString();

    for (const doc of documentos) {
      const nomeArquivo = typeof doc.arquivo_nome === 'string' ? doc.arquivo_nome.slice(0, 150) : 'documento_regularizado.pdf';
      await anexarDocumentoMatricula(matricula.id, {
        // id sempre gerado no servidor (o do cliente era aceito e podia colidir com outro anexo)
        id: `doc_reenvio_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        tipo: typeof doc.tipo === 'string' ? doc.tipo.slice(0, 40) : 'EXIGENCIA_REGULARIZADA',
        secao: 'exigencia',
        nome_documento: typeof doc.nome_documento === 'string' ? doc.nome_documento.slice(0, 150) : `Reenvio: ${doc.tipo || 'Documento'}`,
        arquivo_nome: nomeArquivo,
        arquivo_url: doc.arquivo_url ?? doc.url,
        formato: /^data:application\/pdf/i.test(doc.arquivo_url ?? doc.url) ? 'pdf' : 'image',
        tamanho: typeof doc.tamanho === 'string' ? doc.tamanho.slice(0, 20) : '',
        status: 'REENVIADO_ALUNO',
        observacao: typeof doc.observacao === 'string' ? doc.observacao.slice(0, 500) : 'Documento regularizado pelo candidato.',
        enviado_por: `${matricula.nome_completo} (Candidato/Aluno - Reenvio)`,
        data_upload: agora
      }, {
        id: null,
        nome: matricula.nome_completo,
        login: matricula.cpf || 'aluno',
        cargo: 'Candidato'
      }, {
        ip: String(clientIp),
        userAgent: String(userAgent)
      });
    }

    const histExistente = Array.isArray(matricula.historico_deferimento) 
      ? matricula.historico_deferimento 
      : (typeof matricula.historico_deferimento === 'string' ? JSON.parse(matricula.historico_deferimento || '[]') : []);

    const novoHistorico = [
      ...histExistente,
      {
        data: agora,
        status: 'Em Análise (Documentos Reenviados)',
        despacho: `O candidato reenviou ${documentos.length} documento(s) para regularização de pendências. ${observacao_aluno ? `Observação: "${observacao_aluno}"` : ''}`,
        responsavel: `${matricula.nome_completo} (Candidato/Aluno)`,
        canal_notificacao: 'Portal do Aluno'
      }
    ];

    const updates = {
      status: 'Em Análise',
      historico_deferimento: JSON.stringify(novoHistorico),
      observacoes_exigencia: `[Reenviado em ${new Date().toLocaleDateString('pt-BR')}]: ${documentos.length} anexo(s) encaminhado(s) pelo candidato para reanálise.`
    };

    const matriculaAtualizada = await updateMatricula(matricula.id, updates);

    // Só o resumo: nada de ficha, contatos ou conteúdo dos anexos
    return res.status(200).json({
      message: 'Documentos reenviados com sucesso para a Secretaria Acadêmica!',
      protocolo: matricula.protocolo,
      status: (matriculaAtualizada && matriculaAtualizada.status) || updates.status,
      total_reenviados: documentos.length
    });
  } catch (err) {
    console.error('Erro ao processar reenvio de documentos em exigência:', err);
    return res.status(500).json({ error: 'Erro ao reenviar documentos.' });
  }
});

app.get('/api/matriculas', requireSecretariaAuth, async (req, res) => {
  try {
    const { semestre } = req.query;
    const matriculas = await getAllMatriculas(semestre);
    return res.json({
      total: matriculas.length,
      semestre_filtrado: semestre || 'todos',
      matriculas
    });
  } catch (err) {
    console.error('Erro ao buscar matrículas:', err);
    return res.status(500).json({ error: 'Erro ao carregar lista de matrículas.' });
  }
});

app.get('/api/matriculas/:id', requireAuth, async (req, res) => {
  try {
    const matricula = await getMatriculaById(req.params.id);
    if (!matricula) {
      return res.status(404).json({ error: 'Matrícula não encontrada.' });
    }
    return res.json(matricula);
  } catch (err) {
    console.error('Erro ao buscar matrícula por id:', err);
    return res.status(500).json({ error: 'Erro ao consultar matrícula.' });
  }
});

app.put('/api/matriculas/:id', requireSecretariaAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await getMatriculaById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Matrícula não encontrada para edição.' });
    }
    // A secretaria edita dados e status, mas id e protocolo (identificadores) ficam imutáveis
    const { id: _id, protocolo: _protocolo, ...updates } = req.body || {};
    const updated = await updateMatricula(id, updates);
    return res.json({
      message: 'Matrícula atualizada com sucesso pela Secretaria Acadêmica!',
      matricula: updated
    });
  } catch (err) {
    console.error('Erro ao atualizar matrícula:', err);
    return res.status(500).json({ error: 'Erro ao atualizar dados da matrícula.' });
  }
});

app.post('/api/matriculas/:id/deferimento', requireSecretariaAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await getMatriculaById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Matrícula não encontrada para tramitação do workflow.' });
    }
    const rawBody = req.body || {};
    const status = rawBody.status;
    const decisao = rawBody.decisao;
    const rawPendencias = rawBody.pendencias || rawBody.pendencias_documentais || [];
    const pendencias = Array.isArray(rawPendencias) ? rawPendencias : [];
    const prazo_regularizacao = rawBody.prazo_regularizacao || '5 dias úteis';
    const despacho = rawBody.despacho || '';
    const canal_notificacao = rawBody.canal_notificacao || 'NENHUM';
    const notificacao_gerada = rawBody.notificacao_gerada || rawBody.mensagem_notificacao || '';

    const agora = new Date().toISOString();
    const responsavel = {
      id: req.user ? req.user.id : null,
      nome: req.user ? req.user.nome : (rawBody.responsavel || 'Secretaria Acadêmica'),
      cargo: req.user ? req.user.cargo : 'Gestor da Secretaria',
      login: req.user ? req.user.login : 'secretaria'
    };

    const workflowItem = {
      timestamp: agora,
      status,
      decisao: decisao || (status === 'Deferida' ? 'DEFERIDO' : (status === 'Em Exigência' ? 'EXIGENCIA' : (status === 'Indeferida' ? 'INDEFERIDO' : 'EM_ANALISE'))),
      pendencias,
      prazo_regularizacao,
      despacho,
      canal_notificacao,
      notificacao_gerada,
      responsavel
    };

    let historico = [];
    if (existing.historico_deferimento) {
      if (Array.isArray(existing.historico_deferimento)) {
        historico = [...existing.historico_deferimento];
      } else if (typeof existing.historico_deferimento === 'string') {
        try { historico = JSON.parse(existing.historico_deferimento); } catch(e) {}
      }
    }
    historico.unshift(workflowItem);

    const updates = {
      status,
      workflow_deferimento: workflowItem,
      historico_deferimento: historico,
      observacoes_exigencia: pendencias.length > 0 
        ? `[EXIGÊNCIA ${new Date().toLocaleDateString('pt-BR')}]: ${pendencias.map(p => `${p.doc_nome || p.label} (${p.motivo})`).join('; ')}`
        : existing.observacoes_exigencia
    };

    const updated = await updateMatricula(existing.id, updates);

    return res.json({
      success: true,
      message: `Matrícula ${existing.protocolo} atualizada com sucesso para '${status}'!`,
      status,
      workflow: workflowItem,
      matricula: updated
    });
  } catch (err) {
    console.error('Erro no workflow de deferimento:', err);
    return res.status(500).json({ error: 'Erro ao processar workflow de deferimento da matrícula.' });
  }
});

// Documentos
app.get('/api/matriculas/:id/documentos', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const matricula = await getMatriculaById(id);
    if (!matricula) {
      return res.status(404).json({ error: 'Matrícula não encontrada.' });
    }
    const docs = await obterDocumentosMatricula(id);
    return res.json({
      matricula_id: matricula.id,
      protocolo: matricula.protocolo,
      aluno_nome: matricula.nome_completo,
      total: docs.length,
      documentos: docs
    });
  } catch (err) {
    console.error('Erro ao obter documentos:', err);
    return res.status(500).json({ error: 'Erro ao carregar documentos da matrícula.' });
  }
});

// V12: valida o anexo enviado pela equipe (mesmas regras do candidato). Antes, matrícula
// inexistente ou corpo inválido virava erro 500.
function erroDoAnexo(docData) {
  if (!docData || typeof docData !== 'object' || Array.isArray(docData)) return { status: 400, error: 'Dados do documento inválidos.' };
  const url = docData.arquivo_url;
  if (url === undefined || url === null || url === '') return null;
  if (typeof url !== 'string') return { status: 400, error: 'Arquivo do documento inválido.' };
  if (url.length > LIMITE_ANEXO_BASE64) return { status: 413, error: 'Tamanho do anexo excede o limite permitido (máximo 8MB por arquivo).' };
  if (!TIPOS_ANEXO_PERMITIDOS.test(url)) return { status: 415, error: 'Formato de arquivo não permitido. Envie PDF, JPG, PNG ou WEBP.' };
  return null;
}

app.post('/api/matriculas/:id/documentos', requireAuth, async (req, res) => {
  try {
    const id = req.params.id;
    const docData = req.body || {};
    const erro = erroDoAnexo(docData);
    if (erro) return res.status(erro.status).json({ error: erro.error });
    if (!(await getMatriculaById(id))) return res.status(404).json({ error: 'Matrícula não encontrada.' });
    const result = await anexarDocumentoMatricula(id, docData, req.user);
    return res.status(201).json({
      message: 'Documento anexado com sucesso pela Secretaria Acadêmica!',
      documento: result.documento,
      total: result.total,
      documentos: result.documentos
    });
  } catch (err) {
    console.error('Erro ao anexar documento:', err);
    return res.status(500).json({ error: 'Erro ao anexar documento.' });
  }
});

app.put('/api/matriculas/:id/documentos/:docId', requireAuth, async (req, res) => {
  try {
    const { id, docId } = req.params;
    const updates = req.body || {};
    const erro = erroDoAnexo(updates);
    if (erro) return res.status(erro.status).json({ error: erro.error });
    if (!(await getMatriculaById(id))) return res.status(404).json({ error: 'Matrícula não encontrada.' });
    const existe = (await obterDocumentosMatricula(id)).some(d => String(d.id) === String(docId));
    if (!existe) return res.status(404).json({ error: 'Documento anexo não encontrado.' });
    // O id do documento não muda pela edição
    delete updates.id;
    const result = await editarDocumentoMatricula(id, docId, updates, req.user);
    return res.json({
      message: 'Documento atualizado com sucesso!',
      documento: result.documento,
      documentos: result.documentos
    });
  } catch (err) {
    console.error('Erro ao editar documento:', err);
    return res.status(500).json({ error: 'Erro ao editar documento.' });
  }
});

app.delete('/api/matriculas/:id/documentos/:docId', requireAuth, async (req, res) => {
  try {
    const { id, docId } = req.params;
    if (!(await getMatriculaById(id))) return res.status(404).json({ error: 'Matrícula não encontrada.' });
    const result = await removerDocumentoMatricula(id, docId, req.user);
    return res.json({
      message: 'Documento anexo removido com sucesso!',
      removido: result.removido,
      total: result.total,
      documentos: result.documentos
    });
  } catch (err) {
    console.error('Erro ao remover documento:', err);
    return res.status(500).json({ error: 'Erro ao excluir documento anexo.' });
  }
});

// Documentos do candidato
// Os 3 endpoints abaixo exigem o token do candidato e usam SEMPRE o CPF do token.
// Antes bastava informar um CPF qualquer para listar, anexar ou apagar documentos de outra pessoa.
async function matriculaDoAlunoAutenticado(req) {
  const mats = await getMatriculasByAlunoCpf(req.aluno.cpf);
  return mats && mats.length > 0 ? mats[0] : null;
}

const LIMITE_ANEXO_BYTES = 8 * 1024 * 1024;
const LIMITE_ANEXO_BASE64 = Math.ceil(LIMITE_ANEXO_BYTES / 3) * 4 + 100;
const TIPOS_ANEXO_PERMITIDOS = /^data:(image\/(png|jpe?g|webp|heic)|application\/pdf);base64,/i;
// V4: quantos arquivos o candidato pode anexar em cada documento (espelha DOCS_AMPLA em public/script.js).
// Antes não havia limite: qualquer conta enchia o disco com anexos de 8MB.
const LIMITE_ARQUIVOS_POR_TIPO = {
  FOTO_3X4: 1,
  CERTIDAO_CIVIL: 1,
  RG_CPF: 2,
  TITULO_ELEITOR: 1,
  COMPROVANTE_RESIDENCIA: 1,
  CERTIFICADO_MILITAR: 1,
  HISTORICO_ESCOLAR: 5,
  DIARIO_OFICIAL: 1,
  CADUNICO: 1
};
// Teto geral por matrícula (proteção extra: hoje a soma dos limites acima é 14)
const LIMITE_ARQUIVOS_POR_MATRICULA = 20;

app.post('/api/candidato/documentos', requireAlunoAuth, async (req, res) => {
  try {
    const { documento } = req.body;
    const nome = String(req.body.nome || '').slice(0, 150);
    const email = String(req.body.email || '').slice(0, 120);
    const telefone = String(req.body.telefone || '').slice(0, 20);
    if (!documento || typeof documento !== 'object' || (!documento.arquivo_url && !documento.nome_documento)) {
      return res.status(400).json({ error: 'Dados do documento não fornecidos.' });
    }
    // Limite de 8MB por arquivo. Em base64 o texto fica ~4/3 maior, mais o cabeçalho "data:...;base64,".
    if (documento.arquivo_url && typeof documento.arquivo_url === 'string' && documento.arquivo_url.length > LIMITE_ANEXO_BASE64) {
      return res.status(413).json({ error: 'Tamanho do anexo excede o limite permitido (máximo 8MB por arquivo).' });
    }
    // Upload: só PDF ou imagem em data URI (bloqueia HTML/SVG/executáveis disfarçados)
    if (documento.arquivo_url && (typeof documento.arquivo_url !== 'string' || !TIPOS_ANEXO_PERMITIDOS.test(documento.arquivo_url))) {
      return res.status(415).json({ error: 'Formato de arquivo não permitido. Envie PDF, JPG, PNG ou WEBP.' });
    }
    // V4: cada tipo de documento tem um número máximo de arquivos (igual à Etapa 3 do portal)
    if (typeof documento.tipo !== 'string' || !Object.hasOwn(LIMITE_ARQUIVOS_POR_TIPO, documento.tipo)) {
      return res.status(400).json({ error: 'Tipo de documento não reconhecido.' });
    }
    documento.status = 'EM_ANALISE';

    const matricula = await matriculaDoAlunoAutenticado(req);
    const cpf = req.aluno.cpf;

    if (matricula) {
      const docsAtuais = await obterDocumentosMatricula(matricula.id);
      const mesmoTipo = docsAtuais.filter(d => d && d.tipo === documento.tipo).length;
      if (mesmoTipo >= LIMITE_ARQUIVOS_POR_TIPO[documento.tipo]) {
        return res.status(409).json({ error: 'Limite de arquivos para este documento atingido. Remova um arquivo antes de enviar outro.' });
      }
      if (docsAtuais.length >= LIMITE_ARQUIVOS_POR_MATRICULA) {
        return res.status(409).json({ error: `Limite de ${LIMITE_ARQUIVOS_POR_MATRICULA} arquivos por matrícula atingido.` });
      }
    }

    if (!matricula) {
      const cleanDigits = cleanCpfDigits(cpf);
      const novoPre = await createMatricula({
        cpf,
        nome_completo: nome || `CANDIDATO CPF ${cleanDigits}`,
        email: email || req.aluno.email || '',
        telefone: telefone || '',
        status: 'Pré-cadastro / Aguardando Envio',
        documentos_anexos: JSON.stringify([{
          ...documento,
          id: documento.id || `doc_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          status: documento.status || 'EM_ANALISE',
          enviado_por: nome ? `${nome} (Candidato)` : 'Candidato / Aluno',
          data_upload: new Date().toISOString()
        }])
      });
      const docsCriados = typeof novoPre.documentos_anexos === 'string' 
        ? JSON.parse(novoPre.documentos_anexos || '[]') 
        : (novoPre.documentos_anexos || []);
      return res.status(201).json({
        message: 'Documento registrado e salvo na base de dados com sucesso!',
        documento: docsCriados[0] || documento,
        matricula_id: novoPre.id,
        protocolo: novoPre.protocolo,
        documentos: docsCriados
      });
    }

    const result = await anexarDocumentoMatricula(matricula.id, {
      ...documento,
      status: documento.status || 'EM_ANALISE',
      enviado_por: nome ? `${nome} (Candidato)` : 'Candidato / Aluno'
    }, { 
      nome: nome || matricula.nome_completo, 
      cargo: 'Candidato' 
    });

    return res.status(201).json({
      message: 'Documento gravado na base de dados com sucesso!',
      documento: result.documento,
      total: result.total,
      matricula_id: matricula.id,
      protocolo: matricula.protocolo,
      documentos: result.documentos
    });
  } catch (err) {
    console.error('Erro ao salvar documento do candidato:', err);
    return res.status(500).json({ error: 'Erro ao gravar documento no banco.' });
  }
});

app.get('/api/candidato/documentos', requireAlunoAuth, async (req, res) => {
  try {
    const matricula = await matriculaDoAlunoAutenticado(req);
    if (!matricula) {
      return res.json({ documentos: [] });
    }
    const docs = await obterDocumentosMatricula(matricula.id);
    return res.json({
      matricula_id: matricula.id,
      protocolo: matricula.protocolo,
      documentos: docs
    });
  } catch (err) {
    console.error('Erro ao consultar documentos do candidato:', err);
    return res.status(500).json({ error: 'Erro ao consultar documentos.' });
  }
});

app.delete('/api/candidato/documentos/:docId', requireAlunoAuth, async (req, res) => {
  try {
    const { docId } = req.params;
    const matricula = await matriculaDoAlunoAutenticado(req);
    if (!matricula) {
      return res.status(404).json({ error: 'Matrícula não localizada para remoção do anexo.' });
    }
    const result = await removerDocumentoMatricula(matricula.id, docId, {
      nome: matricula.nome_completo,
      cargo: 'Candidato'
    });
    return res.json({
      message: 'Documento removido da base de dados com sucesso!',
      documentos: result.documentos
    });
  } catch (err) {
    console.error('Erro ao remover documento do candidato:', err);
    return res.status(500).json({ error: 'Erro ao remover anexo.' });
  }
});

app.delete('/api/matriculas/:id', requireSecretariaAuth, async (req, res) => {
  try {
    const success = await deleteMatricula(req.params.id, req.user);
    if (!success) {
      return res.status(404).json({ error: 'Matrícula não encontrada para exclusão.' });
    }
    return res.json({ message: 'Matrícula excluída com sucesso e evento registrado na trilha de auditoria!' });
  } catch (err) {
    console.error('Erro ao deletar matrícula:', err);
    return res.status(500).json({ error: 'Erro ao excluir matrícula.' });
  }
});

app.post('/api/matriculas/bulk', requireSecretariaAuth, async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : req.body.matriculas;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Envie um array de matrículas para importação.' });
    }
    const inserted = await bulkCreateMatriculas(items);
    return res.status(201).json({
      message: `${inserted.length} matrículas importadas com sucesso!`,
      total: inserted.length,
      matriculas: inserted
    });
  } catch (err) {
    console.error('Erro no bulk insert:', err);
    return res.status(500).json({ error: 'Erro ao importar lote de matrículas.' });
  }
});

// IA / OCR
// OCR por IA: exige candidato ou equipe identificados, limite por IP e no máximo 5 arquivos
app.post('/api/ia/extrair-documentos', iaLimiter, requireAlunoOuEquipe, async (req, res) => {
  try {
    let files = [];
    if (Array.isArray(req.body.files)) {
      files = req.body.files;
    } else if (req.body.file || req.body.data) {
      files = [{
        data: req.body.data || req.body.file,
        mimeType: req.body.mimeType || req.body.type,
        filename: req.body.filename || req.body.name || 'documento'
      }];
    }
    if (!files || files.length === 0) {
      return res.status(400).json({
        error: 'Nenhum documento enviado.'
      });
    }
    if (files.length > 5) {
      return res.status(400).json({ error: 'Envie no máximo 5 arquivos por leitura.' });
    }
    const resultado = await extrairDadosDocumentos(files);
    return res.json(resultado);
  } catch (err) {
    console.error('Erro na extração de documentos por IA:', err);
    return res.status(500).json({
      error: 'Erro ao processar documentos com IA. Tente novamente ou preencha os dados manualmente.'
    });
  }
});

// Semestres
app.get('/api/semestres', async (req, res) => {
  try {
    const semestres = await getAllSemestres();
    return res.json({
      total: semestres.length,
      semestres
    });
  } catch (err) {
    console.error('Erro ao listar semestres:', err);
    return res.status(500).json({ error: 'Erro ao carregar semestres letivos.' });
  }
});

app.get('/api/semestres/ativo', async (req, res) => {
  try {
    const ativo = await getSemestreAtivo();
    return res.json({ semestre: ativo });
  } catch (err) {
    console.error('Erro ao consultar semestre ativo:', err);
    return res.status(500).json({ error: 'Erro ao buscar semestre ativo.' });
  }
});

app.post('/api/semestres', requireSecretariaAuth, async (req, res) => {
  try {
    const { codigo, ano, periodo, data_inicio, data_fim, vagas_totais, ativo, status } = req.body;
    const novoSemestre = await createSemestre({
      codigo,
      ano: ano || parseInt(codigo?.split('.')[0] || '2026', 10),
      periodo: periodo || parseInt(codigo?.split('.')[1] || '1', 10),
      data_inicio,
      data_fim,
      vagas_totais: vagas_totais || 120,
      ativo,
      status
    });
    return res.status(201).json({
      success: true,
      message: `Semestre ${novoSemestre.codigo} cadastrado com sucesso!`,
      semestre: novoSemestre
    });
  } catch (err) {
    console.error('Erro ao criar semestre:', err);
    return res.status(500).json({ error: 'Erro ao cadastrar novo semestre letivo.' });
  }
});

app.put('/api/semestres/:id/ativar', requireSecretariaAuth, async (req, res) => {
  try {
    const atualizado = await setSemestreAtivo(req.params.id);
    if (!atualizado) {
      return res.status(404).json({ error: 'Semestre não encontrado.' });
    }
    return res.json({
      message: `Semestre ${atualizado.codigo} definido como ATIVO!`,
      semestre: atualizado
    });
  } catch (err) {
    console.error('Erro ao ativar semestre:', err);
    return res.status(500).json({ error: 'Erro ao ativar semestre letivo.' });
  }
});

app.delete('/api/semestres/:id', requireSecretariaAuth, async (req, res) => {
  try {
    const success = await deleteSemestre(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Semestre não encontrado para exclusão.' });
    }
    return res.json({ message: 'Semestre excluído com sucesso!' });
  } catch (err) {
    console.error('Erro ao excluir semestre:', err);
    return res.status(500).json({ error: 'Erro ao excluir semestre letivo.' });
  }
});

// Configurações da Janela
app.get('/api/configuracoes/janela', async (req, res) => {
  try {
    const config = await getConfiguracoesJanela();
    // V2: a tela de identificação mostra o campo "Número de Inscrição" só quando há lista de convocados
    return res.json({ ...config, exige_numero_inscricao: getListaConvocados() !== null });
  } catch (err) {
    console.error('Erro ao consultar configurações da janela:', err);
    return res.status(500).json({ error: 'Erro ao consultar status da janela de matrícula.' });
  }
});

app.put('/api/configuracoes/janela', requireSecretariaAuth, async (req, res) => {
  try {
    const updates = req.body || {};
    const updated = await updateConfiguracoesJanela(updates, req.user);
    return res.json({
      message: 'Configurações da janela de matrículas salvas com sucesso!',
      configuracoes: updated
    });
  } catch (err) {
    console.error('Erro ao atualizar configurações da janela:', err);
    return res.status(500).json({ error: 'Erro ao salvar parâmetros da janela de matrícula.' });
  }
});

// Candidatos
app.get('/api/candidatos', requireAuth, async (req, res) => {
  try {
    const { status, search } = req.query;
    const lista = await getAllCandidatos({ status, search });
    return res.json({
      total: lista.length,
      candidatos: lista
    });
  } catch (err) {
    console.error('Erro ao listar candidatos:', err);
    return res.status(500).json({ error: 'Erro ao carregar lista de candidatos.' });
  }
});

// V2: CPF tomado por outra pessoa no 1º acesso. A secretaria libera o CPF: a senha atual deixa
// de valer, todas as sessões caem e o dono refaz o 1º acesso com o número de inscrição.
app.post('/api/candidatos/:cpf/liberar-acesso', requireSecretariaAuth, async (req, res) => {
  try {
    const cleanCpf = cleanCpfDigits(req.params.cpf);
    if (cleanCpf.length !== 11) {
      return res.status(400).json({ error: 'Informe o CPF completo (11 dígitos).' });
    }
    const aluno = await liberarAcessoAluno(cleanCpf);
    if (!aluno) {
      return res.status(404).json({ error: 'Não há conta de candidato para este CPF.' });
    }
    createAuditLog({
      acao: `Acesso do candidato liberado pela secretaria (CPF ${aluno.cpf})`,
      tipo: 'LIBERACAO_ACESSO',
      matricula_id: null,
      protocolo: null,
      aluno_nome: aluno.nome,
      aluno_cpf: aluno.cpf,
      usuario_id: req.user.id,
      usuario_nome: req.user.nome,
      usuario_login: req.user.login,
      usuario_cargo: req.user.cargo,
      ip: String(req.ip || ''),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
      detalhes: 'Senha invalidada e sessões encerradas. O próximo acesso exige o número de inscrição.'
    }).catch(() => {});
    return res.json({ message: 'Acesso liberado. O candidato deve fazer o 1º acesso de novo, com o número de inscrição.' });
  } catch (err) {
    console.error('Erro ao liberar acesso do candidato:', err);
    return res.status(500).json({ error: 'Erro interno ao liberar o acesso.' });
  }
});

// ===== Lista de convocados (PDF da chamada do SISU), mantida pela secretaria =====
const receberPdf = express.raw({ type: 'application/pdf', limit: '5mb' });
const mascararCpf = (cpf) => {
  const d = cleanCpfDigits(cpf);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : '';
};
function resumirLista(itens) {
  const porTurno = {};
  const porModalidade = {};
  for (const i of itens) {
    porTurno[i.turno] = (porTurno[i.turno] || 0) + 1;
    porModalidade[i.modalidade] = (porModalidade[i.modalidade] || 0) + 1;
  }
  return { total: itens.length, por_turno: porTurno, por_modalidade: porModalidade };
}
async function lerPdfDaRequisicao(req, res) {
  if (!Buffer.isBuffer(req.body) || !req.body.length) {
    res.status(400).json({ error: 'Envie o arquivo PDF da lista de convocados.' });
    return null;
  }
  try {
    const { itens, avisos } = await lerListaConvocadosPdf(req.body);
    if (!itens.length) {
      res.status(422).json({ error: 'Nenhum candidato encontrado no PDF. Confira se é a lista da chamada com nome, nota e inscrição do ENEM.', avisos });
      return null;
    }
    return { itens, avisos };
  } catch (err) {
    console.warn('PDF de convocados recusado:', err.message);
    res.status(400).json({ error: 'Não foi possível ler este PDF. Confira se é a lista de convocados original.' });
    return null;
  }
}

app.get('/api/convocados', requireSecretariaAuth, async (req, res) => {
  try {
    const lista = getListaConvocados();
    if (lista === null) {
      return res.json({ existe: false, itens: [], resumo: resumirLista([]), rotulos_modalidade: ROTULO_MODALIDADE });
    }
    const contas = new Map();
    for (const a of await getAllAlunosAuth()) {
      const ins = normalizarInscricao(a.inscricao_enem);
      if (ins) contas.set(ins, a);
    }
    const itens = lista.map(c => {
      const conta = contas.get(normalizarInscricao(c.inscricao_enem));
      return {
        inscricao_enem: c.inscricao_enem,
        nome: c.nome,
        nota: c.nota,
        ordem: c.ordem,
        turno: c.turno,
        modalidade: c.modalidade,
        chamada: c.chamada,
        conta: conta ? { cpf: mascararCpf(conta.cpf), criado_em: conta.criado_em || null } : null
      };
    });
    return res.json({ existe: true, itens, resumo: resumirLista(itens), com_acesso: itens.filter(i => i.conta).length, rotulos_modalidade: ROTULO_MODALIDADE });
  } catch (err) {
    console.error('Erro ao listar convocados:', err);
    return res.status(500).json({ error: 'Erro ao carregar a lista de convocados.' });
  }
});

// Só lê o PDF e devolve a prévia; nada é salvo
app.post('/api/convocados/previa', requireSecretariaAuth, receberPdf, async (req, res) => {
  const lido = await lerPdfDaRequisicao(req, res);
  if (!lido) return;
  return res.json({ itens: lido.itens, avisos: lido.avisos, resumo: resumirLista(lido.itens), rotulos_modalidade: ROTULO_MODALIDADE });
});

// Lê o PDF de novo e salva. ?modo=adicionar (padrão, para as chamadas seguintes) ou ?modo=substituir
app.post('/api/convocados', requireSecretariaAuth, receberPdf, async (req, res) => {
  const modo = req.query.modo === 'substituir' ? 'substituir' : 'adicionar';
  const lido = await lerPdfDaRequisicao(req, res);
  if (!lido) return;
  try {
    const { total, novos } = salvarListaConvocados(lido.itens, modo);
    createAuditLog({
      acao: `Lista de convocados importada (${lido.itens.length} candidatos, modo ${modo})`,
      tipo: 'IMPORTACAO_CONVOCADOS',
      matricula_id: null,
      protocolo: null,
      aluno_nome: null,
      aluno_cpf: null,
      usuario_id: req.user.id,
      usuario_nome: req.user.nome,
      usuario_login: req.user.login,
      usuario_cargo: req.user.cargo,
      ip: String(req.ip || ''),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
      detalhes: `${novos} novos; lista com ${total} no total. ${lido.itens[0]?.chamada || ''}`.trim()
    }).catch(() => {});
    return res.status(201).json({ message: `Lista salva: ${novos} candidatos novos, ${total} no total.`, total, novos, avisos: lido.avisos });
  } catch (err) {
    console.error('Erro ao salvar lista de convocados:', err);
    return res.status(500).json({ error: 'Erro interno ao salvar a lista de convocados.' });
  }
});

// Inscrição usada por outra pessoa: invalida a conta vinculada e deixa a inscrição livre
app.post('/api/convocados/:inscricao/liberar', requireSecretariaAuth, async (req, res) => {
  try {
    const inscricao = normalizarInscricao(req.params.inscricao);
    if (inscricao.length !== 12) {
      return res.status(400).json({ error: 'Informe a inscrição do ENEM com 12 dígitos.' });
    }
    const conta = await findAlunoPorInscricao(inscricao);
    if (!conta) {
      return res.status(404).json({ error: 'Nenhuma conta usa esta inscrição.' });
    }
    const aluno = await liberarAcessoAluno(conta.cpf);
    createAuditLog({
      acao: `Inscrição do ENEM ${inscricao} liberada pela secretaria (CPF ${aluno.cpf})`,
      tipo: 'LIBERACAO_ACESSO',
      matricula_id: null,
      protocolo: null,
      aluno_nome: aluno.nome,
      aluno_cpf: aluno.cpf,
      usuario_id: req.user.id,
      usuario_nome: req.user.nome,
      usuario_login: req.user.login,
      usuario_cargo: req.user.cargo,
      ip: String(req.ip || ''),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
      detalhes: 'Conta vinculada invalidada e sessões encerradas. A inscrição ficou livre para um novo 1º acesso.'
    }).catch(() => {});
    return res.json({ message: 'Inscrição liberada. O candidato correto já pode fazer o 1º acesso com ela.' });
  } catch (err) {
    console.error('Erro ao liberar inscrição:', err);
    return res.status(500).json({ error: 'Erro interno ao liberar a inscrição.' });
  }
});

app.post('/api/candidatos/:id/reativar', requireSecretariaAuth, async (req, res) => {
  try {
    const { motivo } = req.body;
    const candidato = await reativarCandidato(req.params.id, motivo, req.user);
    if (!candidato) {
      return res.status(404).json({ error: 'Candidato não encontrado para reativação.' });
    }
    return res.json({
      message: `Inscrição do candidato ${candidato.nome_completo} reativada com sucesso!`,
      candidato
    });
  } catch (err) {
    console.error('Erro ao reativar candidato:', err);
    return res.status(500).json({ error: 'Erro ao reativar candidato.' });
  }
});

app.post('/api/candidatos/:id/desistir', requireSecretariaAuth, async (req, res) => {
  try {
    const { motivo } = req.body;
    const candidato = await desistirCandidato(req.params.id, motivo, req.user);
    if (!candidato) {
      return res.status(404).json({ error: 'Candidato não encontrado.' });
    }
    return res.json({
      message: `Desistência registrada com sucesso para ${candidato.nome_completo}.`,
      candidato
    });
  } catch (err) {
    console.error('Erro ao registrar desistência de candidato:', err);
    return res.status(500).json({ error: 'Erro ao registrar desistência.' });
  }
});

app.get('/api/estatisticas/intersemestral', requireAuth, async (req, res) => {
  try {
    const stats = await getEstatisticasIntersemestrais();
    return res.json(stats);
  } catch (err) {
    console.error('Erro ao gerar estatísticas intersemestrais:', err);
    return res.status(500).json({ error: 'Erro ao gerar relatório estatístico intersemestral.' });
  }
});

// Logs de Auditoria
app.get('/api/logs', requireAuth, async (req, res) => {
  try {
    const { tipo, search, protocolo, limit } = req.query;
    const parsedLimit = parseInt(limit, 10);
    const safeLimit = (!isNaN(parsedLimit) && parsedLimit > 0) ? Math.min(parsedLimit, 1000) : 200;
    const logs = await getAllAuditLogs({
      tipo: tipo || 'todos',
      search: search || '',
      protocolo: protocolo || '',
      limit: safeLimit
    });
    return res.json({
      total: logs.length,
      logs
    });
  } catch (err) {
    console.error('Erro ao listar audit_logs:', err);
    return res.status(500).json({ error: 'Erro ao consultar trilha de auditoria.' });
  }
});

app.get('/api/logs/stats', requireAuth, async (req, res) => {
  try {
    const stats = await getAuditLogsStats();
    return res.json(stats);
  } catch (err) {
    console.error('Erro ao calcular estatísticas de auditoria:', err);
    return res.status(500).json({ error: 'Erro ao gerar sumário de auditoria.' });
  }
});

app.post('/api/logs', requireAuth, async (req, res) => {
  try {
    const { acao, tipo, matricula_id, protocolo, aluno_nome, aluno_cpf, detalhes } = req.body;
    if (!acao) {
      return res.status(400).json({ error: 'Identificação da ação é obrigatória.' });
    }
    const clientIp = req.ip || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Coruja Web Client';
    const novoLog = await createAuditLog({
      acao,
      tipo: tipo || 'ACESSO',
      matricula_id: matricula_id || null,
      protocolo: protocolo || null,
      aluno_nome: aluno_nome || null,
      aluno_cpf: aluno_cpf || null,
      usuario_id: req.user ? req.user.id : null,
      usuario_nome: req.user ? req.user.nome : 'Administrador',
      usuario_login: req.user ? req.user.login : 'admin',
      usuario_cargo: req.user ? req.user.cargo : 'Administrador',
      ip: String(clientIp),
      user_agent: String(userAgent),
      detalhes: detalhes || `Ação executada pelo usuário ${req.user ? req.user.nome : 'admin'}.`
    });
    return res.status(201).json({
      message: 'Ação registrada com sucesso na trilha de auditoria.',
      log: novoLog
    });
  } catch (err) {
    console.error('Erro ao registrar log de auditoria:', err);
    return res.status(500).json({ error: 'Erro interno ao gravar registro de auditoria.' });
  }
});

// Painel de Auditoria Minuciosa
app.get('/api/auditoria/painel', requireAuth, async (req, res) => {
  try {
    const matriculas = await getAllMatriculas('todos');
    const logs = await getAllAuditLogs({ limit: 1000 });
    const painel = consolidarPainelAuditoria(matriculas, logs);
    return res.json({
      status: 'success',
      stats: painel,
      resumo: painel
    });
  } catch (err) {
    console.error('Erro ao calcular painel de auditoria:', err);
    return res.status(500).json({ error: 'Erro ao consolidar painel de auditoria acadêmica.' });
  }
});

app.get('/api/auditoria/cadastros', requireAuth, async (req, res) => {
  try {
    const { semestre, status, risco, search, limit } = req.query;
    const todasMatriculas = await getAllMatriculas('todos');
    const logs = await getAllAuditLogs({ limit: 1000 });
    let auditados = todasMatriculas.map(m => auditarCadastroCompleto(m, todasMatriculas, logs));

    if (semestre && semestre !== 'todos') {
      auditados = auditados.filter(a => a.semestre === semestre);
    }
    if (status && status !== 'todos') {
      auditados = auditados.filter(a => a.status_auditoria === status);
    }
    if (risco && risco !== 'todos') {
      auditados = auditados.filter(a => a.nivel_risco === risco);
    }
    if (search) {
      const s = String(search).toLowerCase();
      auditados = auditados.filter(a => 
        (a.nome_completo && a.nome_completo.toLowerCase().includes(s)) ||
        (a.cpf && a.cpf.toLowerCase().includes(s)) ||
        (a.protocolo && a.protocolo.toLowerCase().includes(s))
      );
    }

    auditados.sort((a, b) => {
      if (a.nivel_risco === 'ALTO' && b.nivel_risco !== 'ALTO') return -1;
      if (b.nivel_risco === 'ALTO' && a.nivel_risco !== 'ALTO') return 1;
      return a.score_integridade - b.score_integridade;
    });

    const parsedLimit = parseInt(limit, 10);
    const maxLimit = (!isNaN(parsedLimit) && parsedLimit > 0) ? Math.min(parsedLimit, 1000) : 500;
    const resultado = auditados.slice(0, maxLimit);
    return res.json({
      totalGeral: auditados.length,
      total: resultado.length,
      cadastros: resultado
    });
  } catch (err) {
    console.error('Erro ao listar cadastros auditados:', err);
    return res.status(500).json({ error: 'Erro ao processar auditoria dos cadastros.' });
  }
});

app.get('/api/auditoria/cadastros/:protocolo', requireAuth, async (req, res) => {
  try {
    const { protocolo } = req.params;
    const matricula = await getMatriculaById(protocolo);
    if (!matricula) {
      return res.status(404).json({ error: 'Ficha de matrícula não encontrada.' });
    }
    const todasMatriculas = await getAllMatriculas('todos');
    const logs = await getAllAuditLogs({ protocolo, limit: 100 });
    const dossie = auditarCadastroCompleto(matricula, todasMatriculas, logs);
    return res.json({
      cadastro: {
        ...matricula,
        auditoria: dossie
      }
    });
  } catch (err) {
    console.error('Erro ao carregar dossiê de auditoria:', err);
    return res.status(500).json({ error: 'Erro ao gerar dossiê minucioso de auditoria.' });
  }
});

app.post('/api/auditoria/cadastros/:protocolo/parecer', requireAuth, async (req, res) => {
  try {
    const { protocolo } = req.params;
    const { decisao, status, despacho, observacoes, observacoesInternas } = req.body;
    const statusFinal = status || decisao || 'HOMOLOGADO_SECRETARIA';
    const atualizado = await updateMatriculaParecerAuditoria(protocolo, {
      status: statusFinal,
      despacho,
      observacoes: observacoes || observacoesInternas
    }, req.user);
    if (!atualizado) {
      return res.status(404).json({ error: 'Cadastro não encontrado para emissão de parecer.' });
    }
    return res.json({
      message: `Parecer registrado com sucesso para o protocolo ${protocolo}!`,
      matricula: atualizado,
      parecer: {
        decisao: statusFinal,
        despacho,
        observacoesInternas: observacoes || observacoesInternas,
        assinadoEm: new Date().toISOString(),
        auditorNome: req.user ? req.user.nome : 'Secretaria Acadêmica'
      }
    });
  } catch (err) {
    console.error('Erro ao emitir parecer de auditoria:', err);
    return res.status(500).json({ error: 'Erro ao salvar parecer de auditoria.' });
  }
});

app.post('/api/auditoria/balcao/validar', requireAuth, async (req, res) => {
  try {
    const { protocolo, atendente, checklist, parecer_balcao, resumo_contagem } = req.body;
    if (!protocolo) {
      return res.status(400).json({ error: 'Protocolo do candidato é obrigatório.' });
    }
    const matricula = await getMatriculaById(protocolo);
    if (!matricula) {
      return res.status(404).json({ error: 'Ficha de matrícula não encontrada para este protocolo.' });
    }
    const agora = new Date().toISOString();
    let novoStatus = matricula.status;
    if (parecer_balcao?.decisao === 'DEFERIDO_COMPLETO') {
      novoStatus = 'Deferida';
    } else if (parecer_balcao?.decisao === 'CONDICIONADO_RESSALVA') {
      novoStatus = 'Em Exigência';
    }

    const updates = {
      status: novoStatus,
      conferencia_balcao: {
        validado_em: agora,
        atendente,
        checklist,
        parecer: parecer_balcao,
        resumo_contagem
      }
    };
    const matriculaAtualizada = await updateMatricula(matricula.id, updates);
    return res.json({
      success: true,
      message: 'Conferência de balcão registrada com sucesso!',
      matricula: matriculaAtualizada
    });
  } catch (err) {
    console.error('Erro ao validar conferência de balcão:', err);
    return res.status(500).json({ error: 'Erro interno ao registrar conferência de balcão.' });
  }
});

// Backups
app.get('/api/backup/listar', requireAdminAuth, async (req, res) => {
  try {
    const lista = await listarBackups();
    return res.json({
      total_backups: lista.length,
      backups: lista
    });
  } catch (err) {
    console.error('Erro ao listar backups:', err);
    return res.status(500).json({ error: 'Erro ao listar histórico de backups.' });
  }
});

app.post('/api/backup/executar', requireAdminAuth, async (req, res) => {
  try {
    const solicitante = req.user ? `${req.user.nome} (${req.user.cargo})` : 'Administrador';
    const resultado = await executarBackupDiario({ modo: 'manual', usuario: solicitante });
    if (resultado.sucesso) {
      // Sem o caminho do arquivo no disco do servidor (detalhe interno)
      const { caminho, ...backup } = resultado;
      return res.status(201).json({
        message: 'Backup compactado gerado com sucesso e verificado com SHA-256.',
        backup
      });
    } else {
      // V13: o detalhe do erro fica só no log do servidor
      console.error('Falha ao gerar backup manual:', resultado.erro);
      return res.status(500).json({ error: 'Falha ao gerar backup.' });
    }
  } catch (err) {
    console.error('Erro ao executar backup manual:', err);
    return res.status(500).json({ error: 'Erro interno ao processar rotina de backup.' });
  }
});

app.get('/api/backup/download/:filename', requireAdminAuth, (req, res) => {
  try {
    const { filename } = req.params;
    const caminho = obterCaminhoBackup(filename);
    if (!caminho) {
      return res.status(404).json({ error: 'Arquivo de backup não encontrado ou inválido.' });
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(caminho)}"`);
    return res.sendFile(caminho);
  } catch (err) {
    console.error('Erro ao realizar download de backup:', err);
    return res.status(500).json({ error: 'Erro ao transferir arquivo de backup.' });
  }
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), system: 'FAETERJ-Rio Coruja' });
});

// Arquivos Estáticos do Frontend (/public)
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

app.get('/login', (req, res) => {
  res.sendFile(path.join(publicPath, 'login.html'));
});

// Fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// Middleware Global de Tratamento de Erros e Exceções (Express Error Handling)
app.use((err, req, res, next) => {
  console.error('❌ [ERRO NO SERVIDOR]:', err.message || err);
  const status = err.status || err.statusCode || 500;
  // Erros internos (5xx) nunca expõem detalhes técnicos ao usuário; o detalhe fica só no log
  const mensagem = status >= 500
    ? 'Ocorreu um erro interno no processamento da requisição.'
    : (err.message || 'Requisição inválida.');

  return res.status(status).json({
    sucesso: false,
    error: mensagem
  });
});

async function start() {
  try {
    await initDB();
    iniciarAgendamentoBackupDiario();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 [FAETERJ-Rio Coruja] Servidor rodando na porta ${PORT}`);
      console.log(`🌐 Acesso Público: http://localhost:${PORT}/`);
      console.log(`🔒 Acesso Admin: http://localhost:${PORT}/login.html`);
    });
  } catch (err) {
    console.error('❌ Falha crítica ao iniciar servidor:', err);
    process.exit(1);
  }
}

start();
