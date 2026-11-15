import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { 
  findUserByLogin, 
  findUserById, 
  createAuditLog,
  findAlunoByCpf,
  findAlunoByEmail,
  findAlunoById,
  findAlunoByLogin,
  createOrUpdateAluno,
  createOrUpdateUsuario,
  getCandidatoByCpf,
  getMatriculasByAlunoCpf,
  cleanCpfDigits,
  formatCpf,
  findConvocadoPorInscricao,
  findAlunoPorInscricao,
  atualizarAluno,
  incrementarVersaoSessaoAluno,
  incrementarVersaoSessaoUsuario
} from './db.js';
import { normalizarInscricao } from './convocadosPdf.js';
import {
  validarNomeCompleto,
  validarCpf
} from './validators/cadastroEscolarValidation.js';

// Segredo JWT: obrigatório em produção. Em desenvolvimento, sem .env, gera um segredo
// aleatório a cada inicialização (as sessões caem ao reiniciar, mas nunca usam um valor público).
const SEGREDO_PADRAO_INSEGURO = 'faeterj_coruja_secret_key_2026';
function resolverJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (s && s !== SEGREDO_PADRAO_INSEGURO && s.length >= 32) return s;
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ JWT_SECRET ausente, fraco (< 32 caracteres) ou igual ao valor de exemplo. Configure no .env.');
    process.exit(1);
  }
  console.warn('⚠️ JWT_SECRET não configurado (ou fraco). Usando segredo temporário apenas para desenvolvimento.');
  return crypto.randomBytes(48).toString('hex');
}
const JWT_SECRET = resolverJwtSecret();
const JWT_EXPIRES_IN = '24h';
const JWT_VERIFY_OPTS = { algorithms: ['HS256'] };

// Senhas: mínimo exigido e lista de senhas proibidas (a senha padrão antiga é pública)
export const SENHA_MIN_EQUIPE = 8;
export const SENHA_MIN_ALUNO = 6;
const SENHAS_PROIBIDAS = new Set(['faeterj2026', '12345678', '123456', 'password', 'senha123', 'admin123']);
export function senhaPermitida(senha, minimo) {
  const s = String(senha || '');
  return s.length >= minimo && s.length <= 128 && !SENHAS_PROIBIDAS.has(s.toLowerCase());
}

export function isCargoAluno(cargo) {
  const c = String(cargo || '').toLowerCase();
  return c.includes('aluno') || c.includes('candidato');
}

// Mapa em memória para tokens temporários de recuperação de senha ("Esqueci minha senha")
const passwordResetTokens = new Map();

// V12: os campos do formulário precisam chegar como texto. Um objeto ou lista no lugar
// (ex.: {"$gt":""}) quebrava o .trim() e virava erro 500; agora recebe 400.
function temCampoQueNaoETexto(body, campos) {
  const b = body || {};
  return campos.some(c => b[c] !== undefined && b[c] !== null && typeof b[c] !== 'string');
}
const ERRO_CAMPO_TEXTO = { error: 'Dados inválidos: preencha os campos como texto.' };

// V6: cada conta tem uma "versão de sessão". O token leva essa versão no campo `ver`;
// trocar a senha (ou a secretaria liberar o CPF) aumenta a versão e derruba os tokens antigos.
// Tokens emitidos antes desta mudança não têm `ver` e valem como versão 1.
function versaoDaConta(conta) {
  return Number(conta && conta.versao_sessao) || 1;
}
function sessaoAindaValida(decoded, conta) {
  return (Number(decoded && decoded.ver) || 1) === versaoDaConta(conta);
}

// V6: login do candidato vale 24h (antes 7 dias) e leva a versão de sessão da conta
const TOKEN_ALUNO_VALIDADE = '24h';
function assinarTokenAluno(payload, aluno) {
  return jwt.sign({ ...payload, ver: versaoDaConta(aluno) }, JWT_SECRET, { expiresIn: TOKEN_ALUNO_VALIDADE });
}

// V2: conferência da convocação no 1º acesso, pela inscrição do ENEM da lista da chamada (SISU).
// A lista não tem CPF: o CPF fica vinculado à inscrição no 1º acesso, e cada inscrição cria
// uma conta só. Sem data/convocados.json a conferência fica desligada e o servidor avisa no log.
const EMAIL_SECRETARIA = 'sec_acad@exemplo.com';
let avisouListaAusente = false;
async function conferirConvocacao(cleanCpf, numeroInscricao) {
  const { listaExiste, convocado } = findConvocadoPorInscricao(numeroInscricao);
  if (!listaExiste) {
    if (!avisouListaAusente) {
      console.warn('⚠️ data/convocados.json não encontrado: o 1º acesso está liberado para qualquer CPF válido. Importe a lista de convocados para ativar a conferência.');
      avisouListaAusente = true;
    }
    return { convocado: null };
  }
  const inscricao = normalizarInscricao(numeroInscricao);
  if (!inscricao) {
    return { status: 400, error: 'Informe a sua inscrição do ENEM (12 dígitos), que aparece na lista de convocados.' };
  }
  if (!convocado) {
    return { status: 403, error: `Esta inscrição do ENEM não está na lista de convocados. Confira o número. Em caso de dúvidas, envie um e-mail para a Secretaria Acadêmica: ${EMAIL_SECRETARIA}` };
  }
  const dono = await findAlunoPorInscricao(inscricao);
  if (dono && cleanCpfDigits(dono.cpf) !== cleanCpf) {
    return { status: 409, error: `Esta inscrição do ENEM já foi usada para criar o acesso de outro CPF. Se não foi você, envie um e-mail para a Secretaria Acadêmica: ${EMAIL_SECRETARIA}` };
  }
  return { convocado };
}

// Evita que dois 1º acessos simultâneos com a mesma inscrição criem duas contas
const inscricoesEmUso = new Set();

/**
 * Middleware to verify JWT Token (Admin)
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ error: 'Acesso negado. Token de autenticação não fornecido.' });
    }
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ error: 'Formato de token inválido. Use "Bearer <token>".' });
    }
    const token = parts[1];
    const decoded = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTS);
    // Token de candidato (tipo ALUNO) nunca dá acesso às rotas da equipe.
    // Sem esta checagem, o aluno de id 1 era tratado como o usuário admin de id 1.
    if (decoded.tipo !== 'ADMIN') {
      return res.status(403).json({ error: 'Acesso negado. Esta área é exclusiva da equipe da FAETERJ-Rio.' });
    }
    const user = await findUserById(decoded.id);
    if (!user || isCargoAluno(user.cargo) || user.login !== decoded.login) {
      return res.status(401).json({ error: 'Sessão inválida. Usuário não encontrado no sistema.' });
    }
    if (!sessaoAindaValida(decoded, user)) {
      return res.status(401).json({ error: 'Sua sessão foi encerrada (a senha foi alterada). Faça login novamente.' });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sua sessão expirou. Por favor faça login novamente.' });
    }
    return res.status(401).json({ error: 'Token inválido ou adulterado.' });
  }
}

/**
 * Middleware RBAC: Restringe o acesso exclusivamente para credenciais autenticadas no perfil de Gestão de Secretaria
 */
export async function requireSecretariaAuth(req, res, next) {
  requireAuth(req, res, () => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Acesso negado. Credenciais da Secretaria são necessárias.' });
    }
    const cargo = String(user.cargo || '').toLowerCase();
    const login = String(user.login || '').toLowerCase();
    const isSecretaria = 
      cargo.includes('secretaria') || 
      login === 'secretaria' || 
      cargo.includes('gestor da secretaria') || 
      cargo.includes('administrador') || 
      login === 'admin';
    if (!isSecretaria) {
      return res.status(403).json({
        error: 'Acesso negado. Esta rota e permissão são exclusivas para credenciais autenticadas no perfil de Gestão de Secretaria da FAETERJ-Rio.'
      });
    }
    next();
  });
}

/**
 * Middleware RBAC: restringe ao Super Administrador (gestão de usuários e backups)
 */
export async function requireAdminAuth(req, res, next) {
  requireAuth(req, res, () => {
    const cargo = String(req.user.cargo || '').toLowerCase();
    const login = String(req.user.login || '').toLowerCase();
    if (login !== 'admin' && !cargo.includes('super administrador')) {
      return res.status(403).json({ error: 'Acesso negado. Operação exclusiva do Super Administrador.' });
    }
    next();
  });
}

/**
 * Lê o token do candidato sem responder erro (usado por rotas aceitas tanto pela equipe quanto pelo próprio candidato)
 */
async function decodificarAluno(req) {
  const parts = String(req.headers['authorization'] || '').split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  try {
    const decoded = jwt.verify(parts[1], JWT_SECRET, JWT_VERIFY_OPTS);
    if (decoded.tipo !== 'ALUNO') return null;
    const aluno = await findAlunoById(decoded.id);
    if (!aluno || !sessaoAindaValida(decoded, aluno)) return null;
    return semHash(aluno);
  } catch (e) {
    return null;
  }
}

// A conta do candidato guarda o hash da senha: nunca deixar ele seguir para as rotas
// (antes /api/auth/aluno/minha-matricula devolvia o senha_hash na resposta)
function semHash(conta) {
  if (!conta) return conta;
  const { senha_hash, ...resto } = conta;
  return resto;
}

/**
 * Middleware: aceita o próprio candidato (req.aluno) OU um membro da equipe (req.user)
 */
export async function requireAlunoOuEquipe(req, res, next) {
  const aluno = await decodificarAluno(req);
  if (aluno) {
    req.aluno = aluno;
    return next();
  }
  return requireAuth(req, res, next);
}

/**
 * Middleware to verify Student Token (Aluno / Candidato)
 */
export async function requireAlunoAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ error: 'Identificação do candidato obrigatória para esta operação.' });
    }
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ error: 'Formato de token do candidato inválido.' });
    }
    const token = parts[1];
    const decoded = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTS);
    if (decoded.tipo !== 'ALUNO') {
      return res.status(401).json({ error: 'Token não pertence a um candidato autenticado.' });
    }
    const aluno = await findAlunoById(decoded.id);
    if (!aluno) {
      return res.status(401).json({ error: 'Cadastro do candidato não localizado.' });
    }
    if (!sessaoAindaValida(decoded, aluno)) {
      return res.status(401).json({ error: 'Sua sessão foi encerrada (a senha foi alterada). Entre novamente.' });
    }
    req.aluno = semHash(aluno);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessão do candidato expirada ou inválida.' });
  }
}

/**
 * Auth controller for Login (Suporta Administrador E Aluno Candidato)
 */
export async function handleLogin(req, res) {
  try {
    if (temCampoQueNaoETexto(req.body, ['login', 'username', 'usuario', 'user', 'email', 'cpf', 'senha', 'password'])) return res.status(400).json(ERRO_CAMPO_TEXTO);
    const rawLogin = (
      req.body.login || 
      req.body.username || 
      req.body.usuario || 
      req.body.user || 
      req.body.email || 
      req.body.cpf || 
      ''
    ).trim();
    
    const senha = String(req.body.senha || req.body.password || '').trim();
    if (!rawLogin || !senha) {
      return res.status(400).json({ error: 'Por favor, informe seu usuário/CPF e a senha.' });
    }

    const clientIp = req.ip || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Coruja Web Client';

    // 1. Verificar primeiro se é um Usuário Administrativo (Admin, Secretaria, Coordenação, etc.)
    const user = await findUserByLogin(rawLogin.toLowerCase());
    const isUserAluno = user && (
      (user.cargo && (user.cargo.toLowerCase().includes('aluno') || user.cargo.toLowerCase().includes('candidato'))) ||
      user.tipo === 'ALUNO'
    );

    if (user && !isUserAluno) {
      let match = false;
      if (user.senha_hash) {
        match = await bcrypt.compare(senha, user.senha_hash);
      }

      if (!match) {
        return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
      }

      const payload = {
        id: user.id,
        login: user.login,
        nome: user.nome,
        cargo: user.cargo || 'Administrador',
        tipo: 'ADMIN'
      };

      const token = jwt.sign({ ...payload, ver: versaoDaConta(user) }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

      createAuditLog({
        acao: `Autenticação bem-sucedida do servidor ${user.nome}`,
        tipo: 'ACESSO',
        matricula_id: null,
        protocolo: null,
        aluno_nome: null,
        aluno_cpf: null,
        usuario_id: user.id,
        usuario_nome: user.nome,
        usuario_login: user.login,
        usuario_cargo: user.cargo || 'Administrador',
        ip: String(clientIp),
        user_agent: String(userAgent),
        detalhes: `Acesso autenticado ao painel administrativo (${user.cargo || 'Administrador'}).`
      }).catch(e => console.warn('Aviso: falha silenciosa ao registrar log de login:', e));

      return res.json({
        message: `Autenticação realizada com sucesso! Bem-vindo(a), ${user.nome}.`,
        token,
        tipo: 'ADMIN',
        user: payload,
        // Área da equipe: importação da lista de convocados (o painel antigo ?tab=gestor não existe mais)
        redirect: 'convocados.html'
      });
    }

    // 2. Se não for usuário administrativo (ou se for usuário com perfil de Aluno/Candidato), buscar na base de ALUNOS / CANDIDATOS
    let aluno = await findAlunoByLogin(rawLogin);
    if (!aluno && user && isUserAluno) {
      aluno = {
        id: user.id,
        nome: user.nome,
        cpf: user.cpf || user.login,
        cpf_clean: user.cpf_clean || cleanCpfDigits(user.cpf || user.login || ''),
        email: user.email,
        telefone: user.telefone || '',
        senha_hash: user.senha_hash
      };
    }

    // Login NÃO cria contas automaticamente: antes, qualquer CPF digitado virava uma conta
    // com a senha informada, permitindo "tomar" o CPF de outra pessoa.
    if (!aluno) {
      return res.status(401).json({ 
        error: 'Usuário ou CPF não encontrado no sistema. Se este é seu 1º acesso, crie sua conta na aba "Novo Candidato".',
        sugestao: 'cadastro'
      });
    }

    // Validação estrita de senha do Aluno Candidato (sem bypass ou senhas hardcoded)
    let alunoSenhaValida = false;
    if (aluno.senha_hash) {
      alunoSenhaValida = await bcrypt.compare(senha, aluno.senha_hash);
    }

    if (!alunoSenhaValida) {
      return res.status(401).json({ 
        error: 'Senha incorreta para este CPF/Usuário.' 
      });
    }

    // Gerar token de Aluno
    const payloadAluno = {
      id: aluno.id,
      cpf: aluno.cpf,
      cpf_clean: aluno.cpf_clean || cleanCpfDigits(aluno.cpf),
      email: aluno.email,
      nome: aluno.nome,
      telefone: aluno.telefone,
      tipo: 'ALUNO'
    };

    const tokenAluno = assinarTokenAluno(payloadAluno, aluno);
    const matriculas = await getMatriculasByAlunoCpf(aluno.cpf);

    createAuditLog({
      acao: `Autenticação bem-sucedida do candidato ${aluno.nome}`,
      tipo: 'ACESSO_ALUNO',
      matricula_id: null,
      protocolo: null,
      aluno_nome: aluno.nome,
      aluno_cpf: aluno.cpf,
      usuario_id: aluno.id,
      usuario_nome: aluno.nome,
      usuario_login: aluno.cpf,
      usuario_cargo: 'Candidato / Aluno',
      ip: String(clientIp),
      user_agent: String(userAgent),
      detalhes: `Candidato acessou a ficha cadastral com CPF/Login ${aluno.cpf}.`
    }).catch(e => console.warn('Aviso log aluno:', e));

    return res.json({
      message: `Bem-vindo(a), ${aluno.nome.split(' ')[0]}! Acesso liberado à sua Ficha de Matrícula.`,
      token: tokenAluno,
      tipo: 'ALUNO',
      user: {
        id: aluno.id,
        login: aluno.cpf,
        nome: aluno.nome,
        cargo: 'Candidato / Aluno',
        tipo: 'ALUNO'
      },
      aluno: payloadAluno,
      matriculas_anteriores: matriculas,
      redirect: 'index.html?tab=matricula'
    });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ error: 'Erro interno ao processar login.' });
  }
}

/**
 * Auth controller for Verify (Admin)
 */
export async function handleVerify(req, res) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ valid: false, error: 'Token não fornecido' });
    }
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ valid: false, error: 'Formato de token inválido' });
    }
    const token = parts[1];
    const decoded = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTS);
    const user = decoded.tipo === 'ADMIN' ? await findUserById(decoded.id) : null;
    if (!user || isCargoAluno(user.cargo)) {
      return res.status(401).json({ valid: false, error: 'Usuário não existe' });
    }
    if (!sessaoAindaValida(decoded, user)) {
      return res.status(401).json({ valid: false, error: 'Sessão encerrada. Faça login novamente.' });
    }
    return res.json({
      valid: true,
      user
    });
  } catch (err) {
    return res.status(401).json({ valid: false, error: 'Token inválido ou expirado' });
  }
}

/**
 * Login do Aluno com CPF/Usuário e Senha (ou E-mail)
 */
export async function handleAlunoLogin(req, res) {
  try {
    if (temCampoQueNaoETexto(req.body, ['login', 'cpf', 'username', 'email', 'senha', 'password'])) return res.status(400).json(ERRO_CAMPO_TEXTO);
    const rawLogin = (
      req.body.login || 
      req.body.cpf || 
      req.body.username || 
      req.body.email || 
      ''
    ).trim();
    const senha = String(req.body.senha || req.body.password || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!rawLogin) {
      return res.status(400).json({
        error: 'Por favor, informe seu CPF ou Usuário para acessar a ficha cadastral.'
      });
    }

    // Sem criação automática de conta nem senha padrão (ver handleLogin)
    const aluno = await findAlunoByLogin(rawLogin);

    if (!aluno) {
      return res.status(404).json({
        error: 'Cadastro do candidato não localizado com este CPF/Usuário. Por favor, utilize a aba "Novo Candidato (1º Acesso)" para cadastrar-se.',
        sugestao: 'cadastro'
      });
    }

    if (!senha) {
      return res.status(400).json({ error: 'Por favor, informe a senha de acesso.' });
    }

    let senhaOk = false;
    if (aluno.senha_hash) {
      senhaOk = await bcrypt.compare(senha, aluno.senha_hash);
    }

    if (!senhaOk) {
      return res.status(401).json({
        error: 'Senha incorreta para este CPF/Usuário.'
      });
    }

    const payload = {
      id: aluno.id,
      cpf: aluno.cpf,
      cpf_clean: aluno.cpf_clean || cleanCpfDigits(aluno.cpf),
      email: aluno.email,
      nome: aluno.nome,
      telefone: aluno.telefone,
      tipo: 'ALUNO'
    };

    const token = assinarTokenAluno(payload, aluno);
    const matriculas = await getMatriculasByAlunoCpf(aluno.cpf);

    return res.json({
      message: `Bem-vindo(a) de volta, ${aluno.nome.split(' ')[0]}!`,
      token,
      aluno: payload,
      user: {
        id: aluno.id,
        login: aluno.cpf,
        nome: aluno.nome,
        cargo: 'Candidato / Aluno',
        tipo: 'ALUNO'
      },
      matriculas_anteriores: matriculas,
      redirect: 'index.html?tab=matricula'
    });
  } catch (err) {
    console.error('Erro no login de aluno:', err);
    return res.status(500).json({ error: 'Erro interno ao autenticar candidato.' });
  }
}

/**
 * Cadastro do Aluno / Candidato
 */
export async function handleAlunoCadastro(req, res) {
  try {
    if (temCampoQueNaoETexto(req.body, ['nome', 'cpf', 'email', 'telefone', 'senha', 'numero_inscricao'])) return res.status(400).json(ERRO_CAMPO_TEXTO);
    const { nome, cpf, email, telefone, senha } = req.body;
    if (!cpf || !email) {
      return res.status(400).json({
        error: 'Para criar sua conta de acesso, informe seu CPF e E-mail válido.'
      });
    }

    const cleanCpf = cleanCpfDigits(cpf);
    if (cleanCpf.length !== 11) {
      return res.status(400).json({ error: 'CPF inválido. Certifique-se de digitar os 11 dígitos numéricos.' });
    }

    const cpfFormatado = formatCpf(cleanCpf);
    if (!validarCpf(cpfFormatado)) {
      return res.status(400).json({
        error: 'CPF inválido. O CPF fornecido falhou na verificação matemática dos dígitos verificadores (módulo 11).'
      });
    }

    if (nome && nome.trim().length > 0) {
      if (!validarNomeCompleto(nome)) {
        return res.status(400).json({
          error: "Nome inválido. O campo deve conter apenas letras e espaços (sem números ou caracteres especiais) e possuir ao menos duas palavras (nome e sobrenome)."
        });
      }
    }

    const normEmail = String(email).trim().toLowerCase();
    if (!normEmail.includes('@') || !normEmail.includes('.')) {
      return res.status(400).json({ error: 'E-mail informado possui formato inválido.' });
    }
    if (normEmail.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normEmail)) {
      return res.status(400).json({ error: 'E-mail informado possui formato inválido.' });
    }
    if (!senhaPermitida(senha, SENHA_MIN_ALUNO)) {
      return res.status(400).json({ error: `Defina uma senha com pelo menos ${SENHA_MIN_ALUNO} caracteres (senhas óbvias não são aceitas).` });
    }
    // Conta já existente não pode ser sobrescrita pelo cadastro (antes trocava a senha do dono do CPF)
    if (await findAlunoByCpf(cleanCpf)) {
      return res.status(409).json({ error: 'Já existe uma conta para este CPF. Use "Entrar" ou "Esqueci minha senha".' });
    }
    // V2: a rota de cadastro também só cria conta para quem está na lista de convocados
    const inscricao = normalizarInscricao(req.body.numero_inscricao);
    if (inscricao && inscricoesEmUso.has(inscricao)) {
      return res.status(409).json({ error: 'Esta inscrição está sendo usada agora em outro acesso. Tente de novo em instantes.' });
    }
    if (inscricao) inscricoesEmUso.add(inscricao);
    let aluno;
    try {
      const conferencia = await conferirConvocacao(cleanCpf, req.body.numero_inscricao);
      if (conferencia.error) {
        return res.status(conferencia.status).json({ error: conferencia.error });
      }
      const nomeFinal = (nome && nome.trim().length > 0)
        ? nome.trim().toUpperCase().slice(0, 150)
        : (conferencia.convocado ? conferencia.convocado.nome : `CANDIDATO ${cpfFormatado}`);

      aluno = await createOrUpdateAluno({
        nome: nomeFinal,
        cpf: cleanCpf,
        email: normEmail,
        telefone: telefone ? String(telefone).trim().slice(0, 20) : '',
        senha: String(senha)
      });
      if (conferencia.convocado) {
        aluno = await atualizarAluno(cleanCpf, { inscricao_enem: conferencia.convocado.inscricao_enem });
      }
    } finally {
      if (inscricao) inscricoesEmUso.delete(inscricao);
    }

    const payload = {
      id: aluno.id,
      cpf: aluno.cpf,
      cpf_clean: aluno.cpf_clean,
      email: aluno.email,
      nome: aluno.nome,
      telefone: aluno.telefone,
      tipo: 'ALUNO'
    };

    const token = assinarTokenAluno(payload, aluno);
    const notifProtocolo = `NOTIF-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const agoraIso = new Date().toISOString();
    const notificacaoEmail = {
      enviado: true,
      protocolo: notifProtocolo,
      destinatario: normEmail,
      assunto: 'FAETERJ-Rio – Confirmação de Cadastro no Portal do Candidato (Semestre 2026.1)',
      data_envio: agoraIso,
      resumo: `Cadastro ativado com sucesso para o CPF ${aluno.cpf}. Acesso à ficha de matrícula desbloqueado.`
    };

    const clientIp = req.ip || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Coruja Web Client';

    createAuditLog({
      acao: `Novo cadastro de candidato realizado (${aluno.nome})`,
      tipo: 'CADASTRO_CANDIDATO',
      matricula_id: null,
      protocolo: notifProtocolo,
      aluno_nome: aluno.nome,
      aluno_cpf: aluno.cpf,
      usuario_id: null,
      usuario_nome: 'Sistema Automático / Portal do Candidato',
      usuario_login: 'portal_candidato',
      usuario_cargo: 'Candidato',
      ip: String(clientIp),
      user_agent: String(userAgent),
      detalhes: `Conta criada com CPF ${aluno.cpf} e E-mail ${normEmail}. Acesso ao sistema liberado.`
    }).catch(e => console.warn('Aviso: falha silenciosa ao registrar log de cadastro do candidato:', e));

    const matriculas = await getMatriculasByAlunoCpf(aluno.cpf);

    return res.status(201).json({
      message: `Cadastro realizado com sucesso! Você pode acessar o sistema com seu CPF e E-mail.`,
      token,
      aluno: payload,
      matriculas_anteriores: matriculas,
      notificacao_email: notificacaoEmail
    });
  } catch (err) {
    console.error('Erro no cadastro de aluno:', err);
    return res.status(500).json({ error: 'Erro interno ao cadastrar candidato.' });
  }
}

/**
 * Verificação de Sessão do Candidato
 */
export async function handleAlunoVerify(req, res) {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ valid: false, error: 'Token de candidato ausente' });
    }
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ valid: false, error: 'Formato de token inválido' });
    }
    const token = parts[1];
    const decoded = jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTS);
    if (decoded.tipo !== 'ALUNO') {
      return res.status(401).json({ valid: false, error: 'Token não é de aluno' });
    }
    // Identifica sempre pelo id assinado no token (e-mail pode ser repetido entre contas)
    const aluno = await findAlunoById(decoded.id);
    if (!aluno) {
      return res.status(401).json({ valid: false, error: 'Aluno não encontrado' });
    }
    if (!sessaoAindaValida(decoded, aluno)) {
      return res.status(401).json({ valid: false, error: 'Sessão encerrada. Entre novamente.' });
    }
    const matriculas = await getMatriculasByAlunoCpf(aluno.cpf);
    return res.json({
      valid: true,
      aluno: {
        id: aluno.id,
        cpf: aluno.cpf,
        cpf_clean: aluno.cpf_clean,
        email: aluno.email,
        nome: aluno.nome,
        telefone: aluno.telefone,
        tipo: 'ALUNO'
      },
      matriculas_anteriores: matriculas
    });
  } catch (err) {
    return res.status(401).json({ valid: false, error: 'Sessão do candidato expirada' });
  }
}

export async function handleAlunoMinhaMatricula(req, res) {
  try {
    const aluno = req.aluno;
    const matriculas = await getMatriculasByAlunoCpf(aluno.cpf);
    return res.json({
      aluno,
      total_matriculas: matriculas.length,
      matriculas
    });
  } catch (err) {
    console.error('Erro ao buscar matrícula do aluno:', err);
    return res.status(500).json({ error: 'Erro ao consultar fichas cadastradas.' });
  }
}

/**
 * Acesso do candidato na tela de Identificação (CPF + senha).
 * - CPF já cadastrado: confere a senha (bcrypt).
 * - CPF novo: cria a conta com a senha escolhida (1º acesso).
 * Devolve um token JWT do tipo ALUNO, exigido pelas rotas da ficha, documentos e matrícula.
 */
export async function handleAlunoAcesso(req, res) {
  try {
    if (temCampoQueNaoETexto(req.body, ['cpf', 'senha', 'numero_inscricao'])) return res.status(400).json(ERRO_CAMPO_TEXTO);
    const cleanCpf = cleanCpfDigits(req.body.cpf || '');
    const senha = String(req.body.senha || '');
    if (cleanCpf.length !== 11 || !validarCpf(formatCpf(cleanCpf))) {
      return res.status(400).json({ error: 'CPF inválido. Confira os 11 dígitos informados.' });
    }
    if (!senha) {
      return res.status(400).json({ error: 'Informe a senha de acesso.' });
    }

    let aluno = await findAlunoByCpf(cleanCpf);
    let primeiroAcesso = false;
    // Conta liberada pela secretaria (CPF tomado por outra pessoa) volta a ser um 1º acesso
    const refazPrimeiroAcesso = Boolean(aluno && aluno.acesso_liberado_pela_secretaria);
    if (aluno && !refazPrimeiroAcesso) {
      const ok = aluno.senha_hash ? await bcrypt.compare(senha, aluno.senha_hash) : false;
      if (!ok) {
        return res.status(401).json({ error: 'Senha incorreta para este CPF. Use "Esqueci minha senha" se necessário.' });
      }
    } else {
      // V2: antes, o primeiro que digitasse um CPF novo virava dono dele. Agora o 1º acesso
      // exige uma inscrição do ENEM da lista de convocados que ainda não tenha conta.
      if (!senhaPermitida(senha, SENHA_MIN_ALUNO)) {
        return res.status(400).json({ error: `A senha deve possuir pelo menos ${SENHA_MIN_ALUNO} caracteres.` });
      }
      const inscricao = normalizarInscricao(req.body.numero_inscricao);
      if (inscricao && inscricoesEmUso.has(inscricao)) {
        return res.status(409).json({ error: 'Esta inscrição está sendo usada agora em outro acesso. Tente de novo em instantes.' });
      }
      if (inscricao) inscricoesEmUso.add(inscricao);
      try {
        const conferencia = await conferirConvocacao(cleanCpf, req.body.numero_inscricao);
        if (conferencia.error) {
          return res.status(conferencia.status).json({ error: conferencia.error });
        }
        const convocado = conferencia.convocado;
        if (refazPrimeiroAcesso) {
          await createOrUpdateAluno({ cpf: cleanCpf, senha, nome: convocado ? convocado.nome : '' });
        } else {
          await createOrUpdateAluno({
            nome: convocado ? convocado.nome : `CANDIDATO ${formatCpf(cleanCpf)}`,
            cpf: cleanCpf,
            email: '',
            telefone: '',
            senha
          });
        }
        aluno = await atualizarAluno(cleanCpf, {
          acesso_liberado_pela_secretaria: false,
          ...(convocado ? { inscricao_enem: convocado.inscricao_enem } : {})
        });
      } finally {
        if (inscricao) inscricoesEmUso.delete(inscricao);
      }
      primeiroAcesso = true;
    }

    const payload = {
      id: aluno.id,
      cpf: aluno.cpf,
      cpf_clean: aluno.cpf_clean || cleanCpf,
      nome: aluno.nome,
      tipo: 'ALUNO'
    };
    const token = assinarTokenAluno(payload, aluno);

    createAuditLog({
      acao: primeiroAcesso ? 'Primeiro acesso do candidato (conta criada)' : `Autenticação bem-sucedida do candidato ${aluno.nome}`,
      tipo: primeiroAcesso ? 'CADASTRO_CANDIDATO' : 'ACESSO_ALUNO',
      matricula_id: null,
      protocolo: null,
      aluno_nome: aluno.nome,
      aluno_cpf: aluno.cpf,
      usuario_id: null,
      usuario_nome: aluno.nome,
      usuario_login: aluno.cpf,
      usuario_cargo: 'Candidato / Aluno',
      ip: String(req.ip || ''),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
      detalhes: 'Acesso pela tela de identificação do Portal de Matrícula.'
    }).catch(() => {});

    return res.status(primeiroAcesso ? 201 : 200).json({ token, aluno: payload, primeiro_acesso: primeiroAcesso });
  } catch (err) {
    console.error('Erro no acesso do candidato:', err);
    return res.status(500).json({ error: 'Erro interno ao identificar candidato.' });
  }
}

// V3: limite de tentativas por CPF na troca de senha por nascimento. 5 erros bloqueiam o CPF
// por 1 hora. Fica em memória (zera se o servidor reiniciar), o que basta contra adivinhação.
const MAX_FALHAS_TROCA = 5;
const BLOQUEIO_TROCA_MS = 60 * 60 * 1000;
const falhasTrocaPorCpf = new Map();
function cpfBloqueadoParaTroca(cleanCpf) {
  const reg = falhasTrocaPorCpf.get(cleanCpf);
  if (!reg || !reg.bloqueadoAte) return false;
  if (reg.bloqueadoAte > Date.now()) return true;
  falhasTrocaPorCpf.delete(cleanCpf);
  return false;
}
function registrarFalhaTroca(cleanCpf) {
  const reg = falhasTrocaPorCpf.get(cleanCpf) || { erros: 0, bloqueadoAte: 0 };
  reg.erros += 1;
  if (reg.erros >= MAX_FALHAS_TROCA) reg.bloqueadoAte = Date.now() + BLOQUEIO_TROCA_MS;
  falhasTrocaPorCpf.set(cleanCpf, reg);
}

// Data em DDMMAAAA (aceita "DD/MM/AAAA" ou "AAAA-MM-DD") para comparar datas de nascimento
function normalizarDataNascimento(valor) {
  const s = String(valor || '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}${iso[2]}${iso[1]}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[1]}${br[2]}${br[3]}`;
  return '';
}

/**
 * Troca de senha do candidato sem e-mail (M038, pedido do responsável):
 * confirma a identidade pelo CPF + data de nascimento informada na ficha/matrícula.
 * Resposta de erro igual exista ou não o CPF, para não revelar quem tem cadastro.
 * Protegida pelo authLimiter (/api/auth/).
 */
export async function handleAlunoRedefinirPorNascimento(req, res) {
  try {
    if (temCampoQueNaoETexto(req.body, ['cpf', 'data_nascimento', 'nova_senha', 'numero_inscricao'])) return res.status(400).json(ERRO_CAMPO_TEXTO);
    const cleanCpf = cleanCpfDigits(req.body.cpf || '');
    const dataInformada = normalizarDataNascimento(req.body.data_nascimento);
    const novaSenha = String(req.body.nova_senha || '');

    if (cleanCpf.length !== 11 || !dataInformada) {
      return res.status(400).json({ error: 'Informe o CPF completo e a data de nascimento no formato DD/MM/AAAA.' });
    }
    if (!senhaPermitida(novaSenha, SENHA_MIN_ALUNO)) {
      return res.status(400).json({ error: `A nova senha deve ter pelo menos ${SENHA_MIN_ALUNO} caracteres (senhas óbvias não são aceitas).` });
    }
    // V3: além do limite por IP, cada CPF tem o próprio limite (vale mesmo para quem troca de IP)
    if (cpfBloqueadoParaTroca(cleanCpf)) {
      return res.status(429).json({ error: 'Muitas tentativas para este CPF. Tente de novo em 1 hora ou procure a Secretaria Acadêmica.' });
    }

    const erroGenerico = { error: 'Não foi possível confirmar seus dados. Confira o CPF e a data de nascimento.' };
    const falhar = () => { registrarFalhaTroca(cleanCpf); return res.status(400).json(erroGenerico); };
    const aluno = await findAlunoByCpf(cleanCpf);
    if (!aluno) return falhar();

    const datasConhecidas = [];
    const cand = await getCandidatoByCpf(cleanCpf).catch(() => null);
    if (cand?.data_nascimento) datasConhecidas.push(cand.data_nascimento);
    const matriculas = await getMatriculasByAlunoCpf(aluno.cpf);
    matriculas.forEach(m => { if (m.data_nascimento) datasConhecidas.push(m.data_nascimento); });

    const confere = datasConhecidas.some(d => normalizarDataNascimento(d) === dataInformada);
    if (!confere) return falhar();

    // V3: com a lista de convocados, a troca também exige a inscrição do ENEM vinculada à conta
    const { listaExiste } = findConvocadoPorInscricao('');
    if (listaExiste) {
      const informado = normalizarInscricao(req.body.numero_inscricao);
      const esperado = normalizarInscricao(aluno.inscricao_enem);
      if (!informado || !esperado || informado !== esperado) return falhar();
    }

    falhasTrocaPorCpf.delete(cleanCpf);
    await createOrUpdateAluno({ nome: aluno.nome, cpf: cleanCpf, email: aluno.email, telefone: aluno.telefone, senha: novaSenha });
    // V6: a senha mudou, então todo login aberto com a senha antiga cai
    await incrementarVersaoSessaoAluno(cleanCpf);

    createAuditLog({
      acao: `Senha do candidato redefinida por CPF + data de nascimento (${aluno.nome})`,
      tipo: 'RECUPERACAO_SENHA',
      matricula_id: null,
      protocolo: null,
      aluno_nome: aluno.nome,
      aluno_cpf: aluno.cpf,
      usuario_id: null,
      usuario_nome: aluno.nome,
      usuario_login: aluno.cpf,
      usuario_cargo: 'Candidato / Aluno',
      ip: String(req.ip || ''),
      user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
      detalhes: 'Identidade confirmada pela data de nascimento cadastrada.'
    }).catch(() => {});

    return res.json({ message: 'Senha alterada com sucesso. Use a nova senha para consultar sua matrícula.' });
  } catch (err) {
    console.error('Erro ao redefinir senha do candidato:', err);
    return res.status(500).json({ error: 'Erro interno ao alterar a senha.' });
  }
}

export async function handleEsqueciSenha(req, res) {
  try {
    if (temCampoQueNaoETexto(req.body, ['email', 'login', 'cpf', 'identificador'])) return res.status(400).json(ERRO_CAMPO_TEXTO);
    const rawInput = String(req.body.email || req.body.login || req.body.cpf || req.body.identificador || '').trim();
    if (!rawInput) {
      return res.status(400).json({ error: 'Por favor, informe seu e-mail cadastrado ou CPF.' });
    }
    const normInput = rawInput.toLowerCase();
    const cleanDigits = cleanCpfDigits(rawInput);

    let userFound = null;
    let userTipo = 'ADMIN';

    userFound = await findUserByLogin(normInput);
    if (!userFound && (normInput === 'secretaria' || normInput === 'secretaria@exemplo.com')) {
      userFound = await findUserByLogin('secretaria');
    }
    if (!userFound && (normInput === 'admin' || normInput === 'admin@exemplo.com')) {
      userFound = await findUserByLogin('admin');
    }
    if (!userFound) {
      userFound = await findAlunoByLogin(rawInput);
      if (userFound) {
        userTipo = 'ALUNO';
      }
    }
    if (!userFound && cleanDigits.length === 11) {
      const cand = await getCandidatoByCpf(cleanDigits);
      if (cand) {
        userFound = {
          id: cand.id,
          nome: cand.nome_completo,
          email: cand.email,
          cpf: cand.cpf,
          telefone: cand.telefone
        };
        userTipo = 'CANDIDATO';
      }
    }

    // Resposta idêntica exista ou não a conta: impede descobrir quais CPFs/e-mails estão cadastrados
    const respostaGenerica = {
      message: 'Se houver um cadastro com os dados informados, um código de verificação foi enviado ao e-mail cadastrado.',
      tempo_expiracao: '30 minutos',
      instrucoes: 'Informe o código de 6 dígitos recebido por e-mail e defina sua nova senha de acesso.'
    };
    if (!userFound || (userTipo === 'ADMIN' && isCargoAluno(userFound.cargo))) {
      return res.json(respostaGenerica);
    }

    const emailDestino = userFound.email || (
      userFound.login === 'secretaria' ? 'secretaria@exemplo.com' :
      userFound.login === 'admin' ? 'admin@exemplo.com' :
      userFound.login === 'coordenacao' ? 'coordenacao@exemplo.com' :
      userFound.login === 'atendimento' ? 'atendimento@exemplo.com' :
      userFound.login === 'auditoria' ? 'auditoria@exemplo.com' :
      `${userFound.login || 'candidato'}@exemplo.com`
    );

    // Código gerado com gerador criptográfico (Math.random é previsível)
    let codigoVerificacao;
    do {
      codigoVerificacao = String(crypto.randomInt(100000, 1000000));
    } while (passwordResetTokens.has(codigoVerificacao));
    const protocoloRecuperacao = `REC-${Date.now().toString(36).toUpperCase()}-${crypto.randomInt(1000, 10000)}`;
    const expiraEm = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    // Um código ativo por conta: remove códigos anteriores do mesmo usuário
    for (const [cod, dados] of passwordResetTokens) {
      if (dados.userId === userFound.id && dados.tipo === userTipo) passwordResetTokens.delete(cod);
    }
    passwordResetTokens.set(codigoVerificacao, {
      userId: userFound.id,
      login: userFound.login || userFound.cpf,
      email: emailDestino,
      tipo: userTipo,
      expiraEm
    });

    const partesEmail = emailDestino.split('@');
    const nomeEmail = partesEmail[0];
    const dominioEmail = partesEmail[1] || 'exemplo.com';
    const emailMascarado = nomeEmail.length > 2 
      ? `${nomeEmail.slice(0, 2)}***@${dominioEmail}`
      : `${nomeEmail[0]}***@${dominioEmail}`;

    const clientIp = req.ip || '127.0.0.1';
    const userAgent = req.headers['user-agent'] || 'Coruja Web Client';

    createAuditLog({
      acao: `Disparo automático de e-mail de recuperação de senha (${userFound.nome})`,
      tipo: 'RECUPERACAO_SENHA',
      matricula_id: null,
      protocolo: protocoloRecuperacao,
      aluno_nome: userTipo !== 'ADMIN' ? userFound.nome : null,
      aluno_cpf: userTipo !== 'ADMIN' ? userFound.cpf : null,
      usuario_id: userTipo === 'ADMIN' ? userFound.id : null,
      usuario_nome: userFound.nome,
      usuario_login: userFound.login || userFound.cpf,
      usuario_cargo: userFound.cargo || (userTipo === 'ADMIN' ? 'Servidor' : 'Candidato'),
      ip: String(clientIp),
      user_agent: String(userAgent),
      detalhes: `Código de verificação gerado para o e-mail institucional/cadastrado ${emailMascarado}. Válido por 30 minutos.`
    }).catch(e => console.warn('Aviso: falha silenciosa ao registrar log de recuperação:', e));

    // O código NUNCA volta na resposta HTTP (antes qualquer pessoa redefinia a senha do admin).
    // Ainda não há serviço de e-mail: em desenvolvimento o código aparece só no console do servidor.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📧 [SIMULAÇÃO DE E-MAIL] Código de recuperação para ${emailMascarado}: ${codigoVerificacao} (válido por 30 min)`);
    }

    return res.json(respostaGenerica);
  } catch (err) {
    console.error('Erro ao processar esqueci-senha:', err);
    return res.status(500).json({ error: 'Erro interno ao processar recuperação de senha.' });
  }
}

export async function handleRedefinirSenha(req, res) {
  try {
    if (temCampoQueNaoETexto(req.body, ['codigo', 'nova_senha', 'novaSenha'])) return res.status(400).json(ERRO_CAMPO_TEXTO);
    const codigo = req.body.codigo;
    const nova_senha = req.body.nova_senha || req.body.novaSenha;
    if (!codigo || !nova_senha) {
      return res.status(400).json({ error: 'Código de verificação e nova senha são obrigatórios.' });
    }
    const tokenData = passwordResetTokens.get(String(codigo).trim());
    if (!tokenData) {
      return res.status(400).json({ error: 'Código de verificação inválido ou inexistente.' });
    }
    const minimo = tokenData.tipo === 'ADMIN' ? SENHA_MIN_EQUIPE : SENHA_MIN_ALUNO;
    if (!senhaPermitida(nova_senha, minimo)) {
      return res.status(400).json({ error: `A nova senha deve possuir no mínimo ${minimo} caracteres e não pode ser uma senha óbvia.` });
    }
    if (new Date(tokenData.expiraEm) < new Date()) {
      passwordResetTokens.delete(String(codigo).trim());
      return res.status(400).json({ error: 'O código de verificação expirou. Solicite um novo e-mail de recuperação.' });
    }
    const novoHash = await bcrypt.hash(String(nova_senha).trim(), 10);
    if (tokenData.tipo === 'ADMIN') {
      const u = await findUserById(tokenData.userId);
      if (u) {
        await createOrUpdateUsuario({
          login: u.login,
          nome: u.nome,
          senha_hash: novoHash,
          cargo: u.cargo,
          email: u.email
        });
        // V6: sessões abertas com a senha antiga caem
        await incrementarVersaoSessaoUsuario(u.id);
      }
    } else {
      await createOrUpdateAluno({
        id: tokenData.userId,
        cpf: tokenData.login,
        senha: String(nova_senha).trim()
      });
      await incrementarVersaoSessaoAluno(tokenData.login);
    }
    passwordResetTokens.delete(String(codigo).trim());

    createAuditLog({
      acao: `Senha redefinida com sucesso após recuperação`,
      tipo: 'ALTERACAO_SENHA',
      matricula_id: null,
      protocolo: null,
      aluno_nome: null,
      aluno_cpf: tokenData.tipo !== 'ADMIN' ? tokenData.login : null,
      usuario_id: tokenData.tipo === 'ADMIN' ? tokenData.userId : null,
      usuario_nome: 'Usuário Autenticado / Recuperação',
      usuario_login: tokenData.login,
      usuario_cargo: tokenData.tipo,
      ip: '127.0.0.1',
      user_agent: 'Coruja Security Agent',
      detalhes: `Senha do usuário ${tokenData.login} atualizada com sucesso via fluxo de recuperação.`
    }).catch(e => console.warn('Aviso: falha ao registrar auditoria de redefinição de senha:', e));

    return res.json({
      message: 'Senha redefinida com sucesso! Você pode realizar o login com suas novas credenciais.'
    });
  } catch (err) {
    console.error('Erro ao redefinir senha:', err);
    return res.status(500).json({ error: 'Erro interno ao redefinir senha.' });
  }
}
