import crypto from 'crypto';

/**
 * MÓDULO DE AUDITORIA MINUCIOSA DE CADASTROS ACADÊMICOS
 * FAETERJ-Rio Coruja - Diretoria de Educação Superior (DESUP) / FAETEC
 */

const DOMINIOS_EMAIL_DESCARTAVEIS = [
  'tempmail.com', 'temp-mail.org', '10minutemail.com', 'mailinator.com', 
  'guerrillamail.com', 'throwawaymail.com', 'yopmail.com', 'dispostable.com',
  'sharklasers.com', 'fakemailgenerator.com', 'trashmail.com', 'mohmal.com'
];

export function validarAlgoritmoCpf(cpfRaw) {
  if (!cpfRaw) return { valido: false, motivo: 'CPF não informado' };
  const cpf = String(cpfRaw).replace(/\D/g, '');
  if (cpf.length !== 11) {
    return { valido: false, motivo: `CPF incompleto (${cpf.length}/11 dígitos)` };
  }
  if (/^(\d)\1{10}$/.test(cpf)) {
    return { valido: false, motivo: 'CPF com dígitos repetidos (inválido pela RFB)' };
  }
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(cpf.charAt(i), 10) * (10 - i);
  }
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.charAt(9), 10)) {
    return { valido: false, motivo: '1º dígito verificador de CPF não confere' };
  }
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(cpf.charAt(i), 10) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf.charAt(10), 10)) {
    return { valido: false, motivo: '2º dígito verificador de CPF não confere' };
  }
  return { valido: true, motivo: 'CPF matematicamente autêntico e válido' };
}

export function calcularIdade(dataNascimentoRaw) {
  if (!dataNascimentoRaw) return { idade: null, valida: false, motivo: 'Data de nascimento ausente' };
  let dataNasc;
  if (dataNascimentoRaw.includes('/')) {
    const parts = dataNascimentoRaw.split('/');
    if (parts.length === 3) {
      dataNasc = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
    }
  } else {
    dataNasc = new Date(dataNascimentoRaw);
  }
  if (!dataNasc || isNaN(dataNasc.getTime())) {
    return { idade: null, valida: false, motivo: 'Formato de data de nascimento inválido' };
  }
  const hoje = new Date();
  if (dataNasc > hoje) {
    return { idade: 0, valida: false, motivo: 'Data de nascimento no futuro (inconsistência temporal)' };
  }
  let idade = hoje.getFullYear() - dataNasc.getFullYear();
  const m = hoje.getMonth() - dataNasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < dataNasc.getDate())) {
    idade--;
  }
  if (idade < 15) {
    return { idade, valida: false, motivo: `Idade calculada (${idade} anos) incompatível com ingresso em Ensino Superior` };
  }
  return { idade, valida: true, motivo: `Idade calculada: ${idade} anos` };
}

export function validarEmail(emailRaw) {
  if (!emailRaw) return { valido: false, temporario: false, motivo: 'E-mail não preenchido' };
  const email = String(emailRaw).trim().toLowerCase();
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!regex.test(email)) {
    return { valido: false, temporario: false, motivo: 'Formato de e-mail inválido' };
  }
  const dominio = email.split('@')[1];
  if (DOMINIOS_EMAIL_DESCARTAVEIS.includes(dominio)) {
    return { valido: false, temporario: true, motivo: `Domínio de e-mail temporário/descartável detectado (@${dominio})` };
  }
  return { valido: true, temporario: false, motivo: 'E-mail válido' };
}

export function validarTelefone(telRaw) {
  if (!telRaw) return { valido: false, motivo: 'Telefone de contato não preenchido' };
  const tel = String(telRaw).replace(/\D/g, '');
  if (tel.length < 10 || tel.length > 11) {
    return { valido: false, motivo: `Telefone com quantidade de dígitos incorreta (${tel.length}/10 ou 11)` };
  }
  const ddd = parseInt(tel.substring(0, 2), 10);
  if (ddd < 11 || ddd > 99) {
    return { valido: false, motivo: `DDD (${ddd}) inválido no território nacional` };
  }
  return { valido: true, motivo: 'Telefone com DDD válido' };
}

export function gerarHashIntegridade(matricula) {
  const dadosChave = [
    matricula.protocolo || '',
    matricula.cpf || '',
    matricula.nome_completo || '',
    matricula.data_nascimento || '',
    matricula.semestre || '',
    matricula.curso || '',
    matricula.sistema_concorrencia || '',
    matricula.data_envio || ''
  ].join('|');
  return crypto.createHash('sha256').update(dadosChave).digest('hex');
}

export function auditarCadastroCompleto(matricula, todasMatriculas = [], logsAudit = []) {
  if (!matricula) return null;
  let score = 100;
  const inconsistencias = [];
  const checklist = [];
  const cpfClean = String(matricula.cpf || '').replace(/\D/g, '');
  const logsDoAluno = logsAudit.filter(l => 
    (l.protocolo && l.protocolo === matricula.protocolo) || 
    (l.aluno_cpf && l.aluno_cpf.replace(/\D/g, '') === cpfClean) ||
    (l.matricula_id && String(l.matricula_id) === String(matricula.id))
  );

  // EIXO 1: IDENTIFICAÇÃO PESSOAL & VALIDAÇÃO DE CPF
  const statusCpf = validarAlgoritmoCpf(matricula.cpf);
  if (!statusCpf.valido) {
    score -= 30;
    inconsistencias.push({
      eixo: 'Identificação & CPF',
      campo: 'cpf',
      severidade: 'CRITICA',
      mensagem: `CPF Inválido: ${statusCpf.motivo}`,
      acao_recomendada: 'Solicitar apresentação presencial imediata do Cartão CPF/RG com regularização na Receita Federal.'
    });
    checklist.push({ item: 'Autenticidade Matemática de CPF', status: 'INCONSISTENTE', descricao: statusCpf.motivo });
  } else {
    checklist.push({ item: 'Autenticidade Matemática de CPF', status: 'CONFORME', descricao: 'Dígitos verificadores oficiais validados com sucesso.' });
  }

  // Verificação de Duplicidade de CPF
  const duplicatasCpf = todasMatriculas.filter(m => 
    String(m.id) !== String(matricula.id) && 
    String(m.protocolo) !== String(matricula.protocolo) &&
    String(m.cpf || '').replace(/\D/g, '') === cpfClean &&
    cpfClean.length === 11
  );
  if (duplicatasCpf.length > 0) {
    score -= 25;
    const protosDup = duplicatasCpf.map(d => d.protocolo).join(', ');
    inconsistencias.push({
      eixo: 'Identificação & CPF',
      campo: 'cpf',
      severidade: 'CRITICA',
      mensagem: `Duplicidade Detectada: O mesmo CPF foi utilizado em ${duplicatasCpf.length} outro(s) cadastro(s) (Protocolo(s): ${protosDup}).`,
      acao_recomendada: 'Auditar se houve recadastro ou tentativa de inscrição simultânea em turnos/semestres conflitantes.'
    });
    checklist.push({ item: 'Unicidade de Inscrição por CPF', status: 'INCONSISTENTE', descricao: `Duplicidade com protocolo(s) ${protosDup}` });
  } else {
    checklist.push({ item: 'Unicidade de Inscrição por CPF', status: 'CONFORME', descricao: 'Inscrição única na base de dados institucional.' });
  }

  // Nome Completo
  if (!matricula.nome_completo || matricula.nome_completo.trim().split(' ').length < 2) {
    score -= 10;
    inconsistencias.push({
      eixo: 'Identificação & CPF',
      campo: 'nome_completo',
      severidade: 'ALERTA',
      mensagem: 'Nome do candidato parece incompleto (sem sobrenome evidente).',
      acao_recomendada: 'Conferir com a Certidão de Nascimento/Casamento ou RG.'
    });
    checklist.push({ item: 'Completude de Nome Civil', status: 'ALERTA', descricao: 'Nome incompleto ou mononômio' });
  } else {
    checklist.push({ item: 'Completude de Nome Civil', status: 'CONFORME', descricao: 'Nome civil completo estruturado' });
  }

  // Filiação
  if (!matricula.nome_mae || matricula.nome_mae.trim().length < 3) {
    score -= 8;
    inconsistencias.push({
      eixo: 'Identificação & CPF',
      campo: 'nome_mae',
      severidade: 'ALERTA',
      mensagem: 'Nome da mãe não preenchido ou incompleto (exigência para cadastro acadêmico e diploma).',
      acao_recomendada: 'Coletar filiação materna na entrega documental presencial.'
    });
    checklist.push({ item: 'Registro de Filiação Materna', status: 'ALERTA', descricao: 'Filiação não informada' });
  } else {
    checklist.push({ item: 'Registro de Filiação Materna', status: 'CONFORME', descricao: 'Filiação materna registrada' });
  }

  // EIXO 2: AUDITORIA DE IDADE & TEMPORALIDADE
  const statusIdade = calcularIdade(matricula.data_nascimento);
  if (!statusIdade.valida) {
    score -= 20;
    inconsistencias.push({
      eixo: 'Idade & Temporalidade',
      campo: 'data_nascimento',
      severidade: 'CRITICA',
      mensagem: statusIdade.motivo,
      acao_recomendada: 'Conferir certidão de nascimento oficial e autorização de responsáveis se for menor de idade.'
    });
    checklist.push({ item: 'Conformidade Etária para Graduação', status: 'INCONSISTENTE', descricao: statusIdade.motivo });
  } else {
    checklist.push({ item: 'Conformidade Etária para Graduação', status: 'CONFORME', descricao: `Idade regular (${statusIdade.idade} anos)` });
  }

  // EIXO 3: AUDITORIA DE COTAS & AÇÕES AFIRMATIVAS
  const cota = matricula.sistema_concorrencia || 'Ampla Concorrência';
  const isCotista = cota !== 'Ampla Concorrência' && cota !== 'Ampla Concorrencia';
  if (isCotista) {
    if (cota.includes('Pública') || cota.includes('Publica')) {
      const tipoEscola = matricula.ensino_medio_tipo || '';
      if (tipoEscola && !tipoEscola.toLowerCase().includes('públic') && !tipoEscola.toLowerCase().includes('public')) {
        score -= 25;
        inconsistencias.push({
          eixo: 'Cotas & Ações Afirmativas',
          campo: 'sistema_concorrencia',
          severidade: 'CRITICA',
          mensagem: `Incompatibilidade de Cota de Escola Pública: O candidato declarou vaga para Rede Pública, porém informou Ensino Médio em instituição '${tipoEscola}'.`,
          acao_recomendada: 'Exigir histórico escolar integral da rede pública (Estadual, Municipal ou Federal).'
        });
        checklist.push({ item: 'Comprovação de Cota de Escola Pública', status: 'INCONSISTENTE', descricao: 'Escola declarada diverge da cota' });
      } else {
        checklist.push({ item: 'Comprovação de Cota de Escola Pública', status: 'CONFORME', descricao: 'Origem escolar compatível com reserva pública' });
      }
    }
  } else {
    checklist.push({ item: 'Critério de Concorrência Universal', status: 'CONFORME', descricao: 'Inscrito em Ampla Concorrência' });
  }

  // EIXO 4: CONFORMIDADE DOCUMENTAL & ANEXOS
  if (!matricula.foto_3x4) {
    score -= 5;
    inconsistencias.push({
      eixo: 'Documentação & Anexos',
      campo: 'foto_3x4',
      severidade: 'INFO',
      mensagem: 'Foto 3x4 digitalizada não anexada no pré-cadastro online.',
      acao_recomendada: 'Coletar 02 fotos 3x4 físicas ou realizar captura biométrica no balcão da secretaria.'
    });
    checklist.push({ item: 'Foto 3x4 Identificadora', status: 'PENDENTE', descricao: 'Foto não anexada no portal' });
  } else {
    checklist.push({ item: 'Foto 3x4 Identificadora', status: 'CONFORME', descricao: 'Foto anexada e disponível para crachá' });
  }

  if (!matricula.rg_numero) {
    score -= 10;
    inconsistencias.push({
      eixo: 'Documentação & Anexos',
      campo: 'rg_numero',
      severidade: 'ALERTA',
      mensagem: 'Número de RG ou documento de identificação civil não informado.',
      acao_recomendada: 'Exigir apresentação de RG original + cópia.'
    });
    checklist.push({ item: 'Documento de Identidade Civil (RG/CNH)', status: 'ALERTA', descricao: 'Número de RG ausente' });
  } else {
    checklist.push({ item: 'Documento de Identidade Civil (RG/CNH)', status: 'CONFORME', descricao: `RG ${matricula.rg_numero}` });
  }

  // EIXO 5: ANÁLISE GEOGRÁFICA
  const cepLimpo = String(matricula.cep || '').replace(/\D/g, '');
  if (cepLimpo.length !== 8) {
    score -= 8;
    inconsistencias.push({
      eixo: 'Análise Geográfica & Logística',
      campo: 'cep',
      severidade: 'ALERTA',
      mensagem: `CEP inválido ou incompleto (${cepLimpo.length}/8 dígitos).`,
      acao_recomendada: 'Verificar comprovante de residência com CEP atualizado dos Correios.'
    });
    checklist.push({ item: 'Validação de CEP dos Correios', status: 'ALERTA', descricao: 'CEP com formato incompleto' });
  } else {
    checklist.push({ item: 'Validação de CEP dos Correios', status: 'CONFORME', descricao: `CEP ${matricula.cep}` });
  }

  // EIXO 6: CANAIS DE CONTATO
  const statusEmail = validarEmail(matricula.email);
  if (!statusEmail.valido) {
    score -= statusEmail.temporario ? 20 : 10;
    inconsistencias.push({
      eixo: 'Segurança & Metadados Forenses',
      campo: 'email',
      severidade: statusEmail.temporario ? 'CRITICA' : 'ALERTA',
      mensagem: statusEmail.motivo,
      acao_recomendada: 'Solicitar endereço de e-mail permanente.'
    });
    checklist.push({ item: 'Conformidade de Endereço de E-mail', status: 'INCONSISTENTE', descricao: statusEmail.motivo });
  } else {
    checklist.push({ item: 'Conformidade de Endereço de E-mail', status: 'CONFORME', descricao: `E-mail verificado (${matricula.email})` });
  }

  score = Math.max(0, Math.min(100, score));

  const hasCritica = inconsistencias.some(i => i.severidade === 'CRITICA');
  const hasAlerta = inconsistencias.some(i => i.severidade === 'ALERTA');
  let nivelRisco = 'BAIXO';
  let statusAuditoria = 'CONFORME';

  if (score < 70 || hasCritica) {
    nivelRisco = 'ALTO';
    statusAuditoria = 'INCONSISTENCIA_CRITICA';
  } else if (score < 90 || hasAlerta) {
    nivelRisco = 'MEDIO';
    statusAuditoria = 'ALERTA_DOCUMENTAL';
  } else {
    nivelRisco = 'BAIXO';
    statusAuditoria = 'CONFORME';
  }

  if (matricula.parecer_auditoria && matricula.parecer_auditoria.status) {
    statusAuditoria = matricula.parecer_auditoria.status;
  }

  const hashIntegridade = gerarHashIntegridade(matricula);

  return {
    matricula_id: matricula.id,
    protocolo: matricula.protocolo,
    nome_completo: matricula.nome_completo,
    cpf: matricula.cpf,
    curso: matricula.curso,
    turno: matricula.turno,
    semestre: matricula.semestre || '2026.1',
    sistema_concorrencia: matricula.sistema_concorrencia || 'Ampla Concorrência',
    score_integridade: score,
    nivel_risco: nivelRisco,
    status_auditoria: statusAuditoria,
    total_inconsistencias: inconsistencias.length,
    total_criticas: inconsistencias.filter(i => i.severidade === 'CRITICA').length,
    total_alertas: inconsistencias.filter(i => i.severidade === 'ALERTA').length,
    inconsistencias,
    checklist,
    metadados_forenses: {
      hash_sha256: hashIntegridade,
      data_envio: matricula.data_envio || new Date().toISOString()
    },
    parecer_atual: matricula.parecer_auditoria || null,
    dados_matricula: matricula
  };
}

export function consolidarPainelAuditoria(todasMatriculas = [], logs = []) {
  const auditados = todasMatriculas.map(m => auditarCadastroCompleto(m, todasMatriculas, logs));
  const total = auditados.length;
  if (total === 0) {
    return {
      total: 0,
      score_medio: 100,
      total_conformes: 0,
      total_alertas: 0,
      total_criticos: 0,
      total_homologados: 0,
      taxa_conformidade: 100,
      top_inconsistencias: [],
      cadastros_criticos_recentes: []
    };
  }

  const somaScores = auditados.reduce((acc, a) => acc + a.score_integridade, 0);
  const scoreMedio = Math.round(somaScores / total);
  const conformes = auditados.filter(a => a.status_auditoria === 'CONFORME' || a.score_integridade >= 90).length;
  const alertas = auditados.filter(a => a.status_auditoria === 'ALERTA_DOCUMENTAL' || (a.score_integridade >= 70 && a.score_integridade < 90)).length;
  const criticos = auditados.filter(a => a.status_auditoria === 'INCONSISTENCIA_CRITICA' || a.score_integridade < 70).length;
  const homologados = auditados.filter(a => a.status_auditoria === 'HOMOLOGADO_SECRETARIA').length;

  return {
    total,
    score_medio: scoreMedio,
    total_conformes: conformes,
    total_alertas: alertas,
    total_criticos: criticos,
    total_homologados: homologados,
    taxa_conformidade: total > 0 ? Math.round((conformes / total) * 100) : 100,
    top_inconsistencias: [],
    cadastros_criticos_recentes: auditados.filter(a => a.nivel_risco === 'ALTO').slice(0, 10)
  };
}
