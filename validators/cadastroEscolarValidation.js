/**
 * ============================================================================
 * ESQUEMA DE VALIDAÇÃO E SANITIZAÇÃO DE DADOS CADASTRAIS ESCOLARES (BACK-END)
 * FAETERJ-Rio - Sistema Coruja de Gestão Acadêmica
 * ============================================================================
 * 
 * Regra de Ouro (Segurança):
 * - Esta validação roda EXCLUSIVAMENTE no back-end.
 * - Todos os dados de entrada são considerados não-confiáveis.
 * - Qualquer dado que viole os critérios estritos de integridade, formato
 *   ou calendário é rejeitado IMEDIATAMENTE com HTTP 400 (Bad Request).
 * - O banco de dados só recebe informações que passaram 100% por todos os filtros.
 */

// Lista oficial das 27 Unidades Federativas do Brasil
export const UFS_BRASIL = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]);

/**
 * Sanitização básica de strings:
 * - Aplica .trim()
 * - Remove caracteres invisíveis de controle perigosos
 */
export function sanitizarTexto(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

/**
 * 1. Nomes e Textos Puros:
 * - Apenas letras (incluindo todas as acentuações da língua portuguesa) e espaços.
 * - Proibição Absoluta de números (0-9) e caracteres especiais (@, !, #, $, etc.).
 */
export const REGEX_TEXTO_PURO = /^[a-zA-ZÀ-ÿ\s]+$/;

export function validarTextoPuro(valor) {
  const limpo = sanitizarTexto(valor);
  if (!limpo) return false;
  return REGEX_TEXTO_PURO.test(limpo);
}

/**
 * Nome Completo (Candidato e Responsável Legal):
 * - Regra de Texto Puro (apenas letras e acentuações da língua portuguesa e espaços)
 * - Exige no mínimo 2 palavras (nome e sobrenome) separadas por espaço
 */
export function validarNomeCompleto(valor) {
  const limpo = sanitizarTexto(valor);
  if (!validarTextoPuro(limpo)) return false;

  const palavras = limpo.split(/\s+/).filter(Boolean);
  if (palavras.length < 2) return false;

  // Cada palavra deve ter ao menos uma letra válida
  for (const p of palavras) {
    if (!REGEX_TEXTO_PURO.test(p)) return false;
  }
  return true;
}

/**
 * Nome Social (Opcional):
 * - Se fornecido, deve seguir a regra estrita de texto puro
 */
export function validarNomeSocial(valor) {
  const limpo = sanitizarTexto(valor);
  if (!limpo) return true; // campo opcional
  return validarTextoPuro(limpo);
}

/**
 * 2. Documentos Pessoais:
 * CPF do Candidato e do Responsável:
 * - Formato estrito: 000.000.000-00
 * - Validação matemática do dígito verificador (módulo 11)
 */
export const REGEX_CPF_FORMATO = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;

export function validarCpf(cpf) {
  const limpo = sanitizarTexto(cpf);
  if (!REGEX_CPF_FORMATO.test(limpo)) {
    return false;
  }

  const digitos = limpo.replace(/\D/g, '');
  if (digitos.length !== 11) return false;

  // Rejeita sequências de dígitos iguais conhecidas (000.000.000-00, 111.111.111-11, etc.)
  if (/^(\d)\1{10}$/.test(digitos)) return false;

  // Primeiro dígito verificador
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(digitos.charAt(i), 10) * (10 - i);
  }
  let resto = (soma * 10) % 11;
  let digito1 = (resto === 10 || resto === 11) ? 0 : resto;
  if (digito1 !== parseInt(digitos.charAt(9), 10)) return false;

  // Segundo dígito verificador
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(digitos.charAt(i), 10) * (11 - i);
  }
  resto = (soma * 10) % 11;
  let digito2 = (resto === 10 || resto === 11) ? 0 : resto;
  if (digito2 !== parseInt(digitos.charAt(10), 10)) return false;

  return true;
}

/**
 * Documento de Identidade (RG) do Candidato e do Responsável:
 * Regra condicional ('OU' / 'OR') aceitando apenas duas possibilidades:
 * - Possibilidade A (RG Tradicional):
 *     Padrão numérico/alfanumérico com dígito verificador:
 *     ex: 00.000.000-0 ou 00.000.000-X (aceitando com pontos/hífen ou padrão estadual formatado com dígito)
 * - Possibilidade B (Novo RG/CIN):
 *     Formato exato idêntico ao de um CPF (000.000.000-00)
 */
export const REGEX_RG_TRADICIONAL = /^(\d{1,2}\.\d{3}\.\d{3}-[\dXx]|\d{1,2}\d{3}\d{3}-[\dXx]|\d{7,9}-[\dXx])$/;
export const REGEX_RG_CIN = REGEX_CPF_FORMATO;

export function validarRg(rg) {
  const limpo = sanitizarTexto(rg);
  if (!limpo) return false;

  // Possibilidade B: Novo RG / Carteira de Identidade Nacional (formato idêntico ao CPF)
  if (REGEX_RG_CIN.test(limpo)) {
    return true;
  }

  // Possibilidade A: RG Tradicional com dígito verificador numérico ou X
  if (REGEX_RG_TRADICIONAL.test(limpo)) {
    return true;
  }

  return false;
}

/**
 * Número do Título de Eleitor:
 * - Deve validar exatamente 12 dígitos (formato 0000 0000 0000 ou apenas números 000000000000)
 */
export const REGEX_TITULO_ELEITOR = /^(\d{4}\s\d{4}\s\d{4}|\d{12})$/;

export function validarTituloEleitor(titulo) {
  const limpo = sanitizarTexto(titulo);
  if (!limpo) return false;
  return REGEX_TITULO_ELEITOR.test(limpo);
}

/**
 * Certidão de Nascimento/Casamento (Número do Termo):
 * - Aceita somente números, sem quantidade fixa de dígitos
 */
export function validarCertidaoMatricula(certidao) {
  const limpo = sanitizarTexto(certidao);
  if (!limpo) return false;

  return /^\d+$/.test(limpo);
}

/**
 * 3. Datas (Nascimento, Emissão e Validade):
 * - Valida o formato estrito DD/MM/AAAA
 * - Bloqueia dias inexistentes no calendário (ex: 30/02/2026, 31/04/2026, 29/02/2025)
 */
export const REGEX_DATA_FORMATO = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function isAnoBissexto(ano) {
  return (ano % 4 === 0 && ano % 100 !== 0) || (ano % 400 === 0);
}

export function validarDataCalendario(dataStr) {
  const limpo = sanitizarTexto(dataStr);
  if (!limpo) return false;

  const match = REGEX_DATA_FORMATO.exec(limpo);
  if (!match) return false;

  const dia = parseInt(match[1], 10);
  const mes = parseInt(match[2], 10);
  const ano = parseInt(match[3], 10);

  if (mes < 1 || mes > 12) return false;
  if (ano < 1900 || ano > 2100) return false;

  const diasNoMes = [
    31,
    isAnoBissexto(ano) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];

  const maxDia = diasNoMes[mes - 1];
  if (dia < 1 || dia > maxDia) {
    return false;
  }

  // Dupla checagem com o construtor Date do JavaScript
  const dataObj = new Date(ano, mes - 1, dia);
  return (
    dataObj.getFullYear() === ano &&
    dataObj.getMonth() === mes - 1 &&
    dataObj.getDate() === dia
  );
}

/**
 * 4. Endereço e Dados Complementares:
 * - CEP: Formato estrito 00000-000
 * - UF (Estado): Apenas 2 letras maiúsculas válidas (RJ, SP, etc.)
 * - Zona Eleitoral: Formato estritamente numérico com 3 dígitos (ex: 045)
 * - Seção Eleitoral: Formato estritamente numérico com 4 dígitos (ex: 0123)
 */
export const REGEX_CEP = /^\d{5}-\d{3}$/;
export const REGEX_UF = /^[A-Z]{2}$/;
export const REGEX_ZONA_ELEITORAL = /^\d{3}$/;
export const REGEX_SECAO_ELEITORAL = /^\d{4}$/;

export function validarCep(cep) {
  const limpo = sanitizarTexto(cep);
  return REGEX_CEP.test(limpo);
}

export function validarUf(uf) {
  const limpo = sanitizarTexto(uf);
  if (!REGEX_UF.test(limpo)) return false;
  return UFS_BRASIL.has(limpo);
}

/**
 * NIS (PIS/PASEP/NIT, número do CadÚnico): 11 dígitos, sendo o último o dígito verificador.
 * Pesos 3,2,9,8,7,6,5,4,3,2 nos 10 primeiros; resto = soma % 11; DV = resto < 2 ? 0 : 11 - resto.
 * Recusa sequências repetidas (00000000000, 11111111111...), que passariam numa checagem só de tamanho.
 */
export function validarNis(nis) {
  const d = String(nis || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0);
  const resto = soma % 11;
  const dv = resto < 2 ? 0 : 11 - resto;
  return dv === Number(d[10]);
}

// Modalidade de cota (qualquer uma que não seja Ampla Concorrência) exige NIS do CadÚnico
export function ehModalidadeCota(cota) {
  const c = String(cota || '').trim();
  return c !== '' && !/^ampla/i.test(c);
}

export function validarZonaEleitoral(zona) {
  const limpo = sanitizarTexto(zona);
  return REGEX_ZONA_ELEITORAL.test(limpo);
}

export function validarSecaoEleitoral(secao) {
  const limpo = sanitizarTexto(secao);
  return REGEX_SECAO_ELEITORAL.test(limpo);
}

/**
 * Órgão Emissor (ex: DETRAN, IFP, SSP):
 * - Somente letras (incluindo acentos) e espaços
 * - Rejeita números e caracteres especiais
 */
export const REGEX_ORGAO_EMISSOR = /^[a-zA-ZÀ-ÿ\s]+$/;

export function validarOrgaoEmissor(orgao) {
  const limpo = sanitizarTexto(orgao);
  if (!limpo) return false;
  return REGEX_ORGAO_EMISSOR.test(limpo);
}

/**
 * Logradouro / Nome da Rua:
 * - O nome da rua NÃO deve conter números (o número da casa possui campo próprio)
 * - Aceita apenas letras, acentos, espaços e pontuações textuais (ex: RUA SILVA JARDIM, AV. DAS AMÉRICAS)
 */
export function validarLogradouro(rua) {
  const limpo = sanitizarTexto(rua);
  if (!limpo) return false;
  // Rejeição estrita de dígitos numéricos
  if (/\d/.test(limpo)) return false;
  // Apenas letras, espaços e pontuações permitidas
  return /^[a-zA-ZÀ-ÿ\s\.\'\,\-]+$/.test(limpo);
}

/**
 * Número da Residência:
 * - Limite de até 8 caracteres (evita valores infinitos)
 * - Aceita números, complementos curtos (ex: 123, 45-B, S/N)
 */
export function validarNumeroCasa(numero) {
  const limpo = sanitizarTexto(numero);
  if (!limpo) return false;
  return limpo.length <= 8;
}

/**
 * Livro e Folha da Certidão:
 * - Livro: alfanumérico limpo até 8 caracteres (ex: A-123, 123-A)
 * - Folha: até 6 caracteres (ex: 045, 123-V)
 */
export function validarLivroCertidao(livro) {
  const limpo = sanitizarTexto(livro);
  if (!limpo) return true; // opcional se não informado
  return /^[a-zA-Z0-9\-\s]{1,8}$/.test(limpo);
}

export function validarFolhaCertidao(folha) {
  const limpo = sanitizarTexto(folha);
  if (!limpo) return true; // opcional se não informado
  return /^[a-zA-Z0-9\-\s]{1,6}$/.test(limpo);
}

/**
 * Nome da Escola:
 * - Permite letras e números (ex: COLÉGIO ESTADUAL PRESIDENTE COSTA E SILVA, E.M. 01)
 * - Mínimo de 3 caracteres
 */
export function validarNomeEscola(nome) {
  const limpo = sanitizarTexto(nome);
  if (!limpo || limpo.length < 3) return false;
  // Deve conter ao menos uma letra e pode conter números e pontuação
  return /[a-zA-ZÀ-ÿ]/.test(limpo) && /^[a-zA-Z0-9À-ÿ\s\.\'\,\-\–\/]+$/.test(limpo);
}

/**
 * Calcula se a data de nascimento indica candidato menor de 18 anos
 */
export function isCandidatoMenorDeIdade(dataNascimentoStr) {
  if (!validarDataCalendario(dataNascimentoStr)) return false;
  const [d, m, y] = dataNascimentoStr.split('/').map(Number);
  const hoje = new Date();
  const dataNasc = new Date(y, m - 1, d);
  let idade = hoje.getFullYear() - dataNasc.getFullYear();
  const mDiff = hoje.getMonth() - dataNasc.getMonth();
  if (mDiff < 0 || (mDiff === 0 && hoje.getDate() < dataNasc.getDate())) {
    idade--;
  }
  return idade < 18;
}

/**
 * ============================================================================
 * EXECUTOR COMPLETO DE VALIDAÇÃO E SANITIZAÇÃO DE DADOS CADASTRAIS
 * ============================================================================
 * 
 * Sanitiza todos os campos de texto (.trim()) e avalia 100% dos filtros.
 * Se houver qualquer incoerência, retorna { valido: false, erros: [...] }.
 */
export function sanitizarEValidarCadastroEscolar(dadosBrutos = {}, opcoes = {}) {
  const erros = [];
  const sanitizado = {};

  // 1. Sanitizar todos os campos de texto com .trim()
  for (const [chave, valor] of Object.entries(dadosBrutos)) {
    if (typeof valor === 'string') {
      sanitizado[chave] = sanitizarTexto(valor);
    } else {
      sanitizado[chave] = valor;
    }
  }

  // Extrair campos usando chaves primárias e alternativas toleradas do formulário
  const nomeCandidato = sanitizado.nome_completo || sanitizado.candidato_nome || sanitizado.candidateName || '';
  const nomeSocial = sanitizado.nome_social || sanitizado.socialName || '';
  const cpfCandidato = sanitizado.cpf || sanitizado.candidateCpf || '';
  const rgCandidato = sanitizado.rg_numero || sanitizado.rg || sanitizado.candidateRg || '';
  const dataNasc = sanitizado.data_nascimento || sanitizado.birthDate || '';

  const responsavelNome = sanitizado.responsavel_nome || sanitizado.guardianName || sanitizado.nome_responsavel || '';
  const responsavelCpf = sanitizado.responsavel_cpf || sanitizado.guardianCpf || '';
  const responsavelRg = sanitizado.responsavel_rg || sanitizado.guardianRg || '';

  const tituloEleitor = sanitizado.titulo_eleitor || sanitizado.voterNumber || '';
  const zonaEleitoral = sanitizado.titulo_zona || sanitizado.voterZone || '';
  const secaoEleitoral = sanitizado.titulo_secao || sanitizado.voterSection || '';

  const certidao = sanitizado.certidao_numero || sanitizado.certidao_matricula || sanitizado.certidao_nascimento || sanitizado.birthCertNumber || '';
  const certidaoLivro = sanitizado.certidao_livro || sanitizado.birthCertBook || '';
  const certidaoFolha = sanitizado.certidao_folha || sanitizado.birthCertPage || '';

  const cep = sanitizado.cep || sanitizado.zipCode || '';
  const rua = sanitizado.logradouro || sanitizado.street || sanitizado.rua || '';
  const numeroCasa = sanitizado.numero || sanitizado.houseNumber || sanitizado.numero_casa || '';
  const uf = (sanitizado.uf || sanitizado.state || '').toUpperCase();

  const orgaoEmissor = sanitizado.rg_orgao || sanitizado.rg_orgao_emissor || sanitizado.rgIssuer || sanitizado.orgao_emissor || '';
  const nomeEscola = sanitizado.escola_nome || sanitizado.schoolName || sanitizado.escola || '';

  // Datas opcionais/complementares de documentos
  const cpfEmissao = sanitizado.cpf_emissao || sanitizado.cpf_data_emissao || sanitizado.cpfIssueDate || '';
  const cpfValidade = sanitizado.cpf_validade || sanitizado.cpfExpiryDate || '';
  const rgEmissao = sanitizado.rg_emissao || sanitizado.rg_data_emissao || sanitizado.rgIssueDate || '';
  const rgValidade = sanitizado.rg_validade || sanitizado.rgExpiryDate || '';

  // --------------------------------------------------------------------------
  // 1. VALIDAÇÃO DE NOMES E TEXTOS PUROS
  // --------------------------------------------------------------------------
  // Nome Completo do Candidato (Obrigatório)
  if (!nomeCandidato) {
    erros.push({
      campo: 'nome_completo',
      mensagem: "O 'Nome Completo do Candidato' é obrigatório."
    });
  } else if (!validarNomeCompleto(nomeCandidato)) {
    erros.push({
      campo: 'nome_completo',
      mensagem: "O 'Nome Completo do Candidato' deve conter apenas letras e espaços (sem números ou caracteres especiais) e conter ao menos duas palavras (nome e sobrenome)."
    });
  }

  // Nome Social (Opcional, mas estrito se fornecido)
  if (nomeSocial && !validarNomeSocial(nomeSocial)) {
    erros.push({
      campo: 'nome_social',
      mensagem: "O 'Nome Social' deve conter exclusivamente letras e espaços, sem números ou caracteres especiais."
    });
  }

  // Responsável Legal (Obrigatório se candidato for menor ou se o campo for fornecido)
  const eMenor = dataNasc ? isCandidatoMenorDeIdade(dataNasc) : false;
  const requerResponsavel = eMenor || Boolean(responsavelNome || responsavelCpf || responsavelRg);

  if (requerResponsavel) {
    if (!responsavelNome) {
      erros.push({
        campo: 'responsavel_nome',
        mensagem: "O 'Nome Completo do Responsável' é obrigatório para candidatos menores de idade ou quando os dados do responsável forem indicados."
      });
    } else if (!validarNomeCompleto(responsavelNome)) {
      erros.push({
        campo: 'responsavel_nome',
        mensagem: "O 'Nome Completo do Responsável' deve conter apenas letras e espaços (sem números ou caracteres especiais) e conter ao menos duas palavras (nome e sobrenome)."
      });
    }

    if (responsavelCpf && !validarCpf(responsavelCpf)) {
      erros.push({
        campo: 'responsavel_cpf',
        mensagem: "O 'CPF do Responsável' deve seguir estritamente o formato 000.000.000-00 e possuir dígitos verificadores válidos."
      });
    }

    if (responsavelRg && !validarRg(responsavelRg)) {
      erros.push({
        campo: 'responsavel_rg',
        mensagem: "O 'RG do Responsável' deve seguir a regra condicional (Possibilidade A: RG tradicional com dígito '00.000.000-0' / '00.000.000-X' OU Possibilidade B: Novo RG/CIN '000.000.000-00')."
      });
    }
  }

  // --------------------------------------------------------------------------
  // 2. DOCUMENTOS PESSOAIS
  // --------------------------------------------------------------------------
  // CPF do Candidato (Obrigatório)
  if (!cpfCandidato) {
    erros.push({
      campo: 'cpf',
      mensagem: "O 'CPF do Candidato' é obrigatório."
    });
  } else if (!validarCpf(cpfCandidato)) {
    erros.push({
      campo: 'cpf',
      mensagem: "O 'CPF do Candidato' deve seguir estritamente o formato 000.000.000-00 e possuir dígitos verificadores matematicamente válidos."
    });
  }

  // RG do Candidato
  if (rgCandidato && !validarRg(rgCandidato)) {
    erros.push({
      campo: 'rg',
      mensagem: "O 'Documento de Identidade (RG) do Candidato' deve seguir a regra condicional: Possibilidade A (RG Tradicional com dígito, ex: 00.000.000-0 ou 00.000.000-X) OU Possibilidade B (Novo RG/CIN no formato 000.000.000-00)."
    });
  }

  // Órgão Emissor do RG (Somente letras)
  if (orgaoEmissor && !validarOrgaoEmissor(orgaoEmissor)) {
    erros.push({
      campo: 'rg_orgao_emissor',
      mensagem: "O 'Órgão Emissor' deve conter exclusivamente letras e espaços (ex: DETRAN, IFP, SSP). Números e caracteres especiais não são permitidos."
    });
  }

  // Título de Eleitor (Se fornecido)
  if (tituloEleitor && !validarTituloEleitor(tituloEleitor)) {
    erros.push({
      campo: 'titulo_eleitor',
      mensagem: "O 'Número do Título de Eleitor' deve conter exatamente 12 dígitos (no formato '0000 0000 0000' ou apenas números '000000000000')."
    });
  }

  // Certidão de Nascimento / Casamento (Se fornecido)
  if (certidao && !validarCertidaoMatricula(certidao)) {
    erros.push({
      campo: 'certidao_matricula',
      mensagem: "O 'Número do Termo da Certidão' deve conter somente números."
    });
  }

  // Livro e Folha da Certidão
  if (certidaoLivro && !validarLivroCertidao(certidaoLivro)) {
    erros.push({
      campo: 'certidao_livro',
      mensagem: "O 'Livro da Certidão' deve conter até 8 caracteres alfanuméricos (ex: A-123)."
    });
  }

  if (certidaoFolha && !validarFolhaCertidao(certidaoFolha)) {
    erros.push({
      campo: 'certidao_folha',
      mensagem: "A 'Folha da Certidão' deve conter até 6 caracteres alfanuméricos (ex: 045)."
    });
  }

  // --------------------------------------------------------------------------
  // 3. DATAS (NASCIMENTO, EMISSÃO E VALIDADE)
  // --------------------------------------------------------------------------
  // Data de Nascimento
  if (dataNasc) {
    if (!validarDataCalendario(dataNasc)) {
      erros.push({
        campo: 'data_nascimento',
        mensagem: "A 'Data de Nascimento' deve estar no formato DD/MM/AAAA e representar um dia real existente no calendário (dias inexistentes como 30/02 ou 31/04 são rejeitados)."
      });
    }
  }

  // Datas opcionais de emissão e validade
  if (cpfEmissao && !validarDataCalendario(cpfEmissao)) {
    erros.push({
      campo: 'cpf_emissao',
      mensagem: "A 'Data de Emissão do CPF' deve estar no formato DD/MM/AAAA e ser uma data real no calendário."
    });
  }

  if (cpfValidade && !validarDataCalendario(cpfValidade)) {
    erros.push({
      campo: 'cpf_validade',
      mensagem: "A 'Data de Validade do CPF' deve estar no formato DD/MM/AAAA e ser uma data real no calendário."
    });
  }

  if (rgEmissao && !validarDataCalendario(rgEmissao)) {
    erros.push({
      campo: 'rg_emissao',
      mensagem: "A 'Data de Emissão do RG' deve estar no formato DD/MM/AAAA e ser uma data real no calendário."
    });
  }

  if (rgValidade && !validarDataCalendario(rgValidade)) {
    erros.push({
      campo: 'rg_validade',
      mensagem: "A 'Data de Validade do RG' deve estar no formato DD/MM/AAAA e ser uma data real no calendário."
    });
  }

  // --------------------------------------------------------------------------
  // 4. ENDEREÇO E DADOS COMPLEMENTARES
  // --------------------------------------------------------------------------
  // Logradouro / Rua (Não pode conter números)
  if (rua && !validarLogradouro(rua)) {
    erros.push({
      campo: 'logradouro',
      mensagem: "O 'Logradouro (Rua)' não deve conter números (o número da residência deve ser informado no campo específico 'Número')."
    });
  }

  // Número da Residência (Limite de até 8 caracteres)
  if (numeroCasa && !validarNumeroCasa(numeroCasa)) {
    erros.push({
      campo: 'numero',
      mensagem: "O 'Número' da residência deve ter no máximo 8 caracteres (ex: 123, 45-B, S/N)."
    });
  }

  // Nome da Escola de Conclusão (Letras e números permitidos)
  if (nomeEscola && !validarNomeEscola(nomeEscola)) {
    erros.push({
      campo: 'escola_nome',
      mensagem: "O 'Nome da Escola de Conclusão' deve conter letras e números válidos com no mínimo 3 caracteres."
    });
  }

  // CEP (Se fornecido)
  if (cep && !validarCep(cep)) {
    erros.push({
      campo: 'cep',
      mensagem: "O 'CEP' deve estar estritamente no formato 00000-000."
    });
  }

  // UF (Se fornecida)
  if (uf && !validarUf(uf)) {
    erros.push({
      campo: 'uf',
      mensagem: "A 'UF (Estado)' deve aceitar apenas 2 letras maiúsculas correspondentes a um estado brasileiro válido (ex: RJ, SP)."
    });
  }

  // Zona Eleitoral (Se fornecida)
  if (zonaEleitoral && !validarZonaEleitoral(zonaEleitoral)) {
    erros.push({
      campo: 'titulo_zona',
      mensagem: "A 'Zona Eleitoral' deve ser estritamente numérica com 3 dígitos (ex: 045)."
    });
  }

  // Seção Eleitoral (Se fornecida)
  if (secaoEleitoral && !validarSecaoEleitoral(secaoEleitoral)) {
    erros.push({
      campo: 'titulo_secao',
      mensagem: "A 'Seção Eleitoral' deve ser estritamente numérica com 4 dígitos (ex: 0123)."
    });
  }

  // Retorno final
  return {
    valido: erros.length === 0,
    erros,
    dadosSanitizados: sanitizado
  };
}

/**
 * ============================================================================
 * MIDDLEWARE EXPRESS DE SEGURANÇA E VALIDAÇÃO BACK-END (HTTP 400)
 * ============================================================================
 */
export function validarCadastroEscolarMiddleware(req, res, next) {
  // Se for GET, OPTIONS ou DELETE em rotas normais, prossegue
  if (req.method === 'GET' || req.method === 'OPTIONS') {
    return next();
  }

  const resultado = sanitizarEValidarCadastroEscolar(req.body);

  if (!resultado.valido) {
    // Rejeição imediata com HTTP 400
    return res.status(400).json({
      sucesso: false,
      error: 'Falha de validação dos dados de cadastro escolar. A requisição foi rejeitada pelas diretrizes de segurança do servidor.',
      motivo: 'Dados cadastrais em desconformidade com os padrões oficiais.',
      total_erros: resultado.erros.length,
      erros: resultado.erros
    });
  }

  // Substitui req.body pelos dados devidamente sanitizados (.trim() e controle)
  req.body = resultado.dadosSanitizados;
  return next();
}
