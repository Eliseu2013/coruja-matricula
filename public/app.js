/**
 * FAETERJ-Rio Coruja - Frontend Application Logic (Stitch Model)
 */
(function() {
  'use strict';

  const state = window.__coruja_state || {
  currentTela: 'portal',
  candidato: {
    cpf: '',
    curso: 'ANÁLISE E DESENVOLVIMENTO DE SISTEMAS',
    turno: 'NOTURNO',
    cota: 'AMPLA CONCORRÊNCIA',
    nome_completo: '',
    data_nascimento: '',
    sexo: 'M',
    cor_raca: 'Parda',
    estado_civil: 'Solteiro(a)',
    rg: '',
    rg_orgao: 'DETRAN/RJ',
    nome_mae: '',
    nome_pai: '',
    email: '',
    telefone: '',
    cep: '',
    logradouro: '',
    numero: '',
    bairro: '',
    cidade: 'Rio de Janeiro',
    uf: 'RJ',
    documentos: {}
  },
  protocoloGerado: null,
  secretariaToken: localStorage.getItem('coruja_token') || null
};

window.escapeHtml = function(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

window.navegarPara = function(telaId) {
  state.currentTela = telaId;
  const telas = ['portal', 'identificacao', 'etapa1', 'etapa2', 'etapa3', 'etapa4'];
  telas.forEach(t => {
    const el = document.getElementById(`tela-${t}`);
    if (el) {
      if (t === telaId) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  });

  if (telaId === 'etapa4') {
    if (typeof window.atualizarResumoConfirmacao === 'function') {
      window.atualizarResumoConfirmacao();
    }
    const modalSucesso = document.getElementById('modal-sucesso-matricula');
    if (modalSucesso) {
      modalSucesso.classList.remove('hidden');
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'pointer-events-auto flex items-center space-x-2.5 px-4 py-3 rounded-2xl border text-xs font-semibold shadow-xl transition-all duration-300 transform translate-y-2 opacity-0 bg-surface-container-lowest text-on-surface';
  
  let icon = 'info';
  if (type === 'success') {
    toast.classList.add('border-emerald-300');
    icon = 'check_circle';
  } else if (type === 'error') {
    toast.classList.add('border-error');
    icon = 'error';
  } else if (type === 'warning') {
    toast.classList.add('border-amber-300');
    icon = 'warning';
  } else {
    toast.classList.add('border-primary-fixed');
  }

  toast.innerHTML = `<span class="material-symbols-outlined text-[18px] text-primary">${icon}</span><span>${window.escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
window.showToast = showToast;

function maskCpf(v) {
  v = v.replace(/\D/g, '');
  if (v.length > 11) v = v.substring(0, 11);
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d)/, '$1.$2');
  v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return v;
}

function maskPhone(v) {
  v = v.replace(/\D/g, '');
  if (v.length > 11) v = v.substring(0, 11);
  if (v.length > 10) {
    v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  } else if (v.length > 5) {
    v = v.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3');
  } else if (v.length > 2) {
    v = v.replace(/^(\d{2})(\d{0,5})$/, '($1) $2');
  }
  return v;
}

function maskCep(v) {
  v = v.replace(/\D/g, '');
  if (v.length > 8) v = v.substring(0, 8);
  v = v.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
  return v;
}

document.addEventListener('DOMContentLoaded', () => {
  const cpfInput = document.getElementById('identificacaoCpfInput');
  if (cpfInput) {
    cpfInput.addEventListener('input', (e) => {
      e.target.value = maskCpf(e.target.value);
    });
  }

  const telInput = document.getElementById('etapa2Telefone');
  if (telInput) {
    telInput.addEventListener('input', (e) => {
      e.target.value = maskPhone(e.target.value);
    });
  }

  const cepInput = document.getElementById('etapa2Cep');
  if (cepInput) {
    cepInput.addEventListener('input', (e) => {
      e.target.value = maskCep(e.target.value);
    });
  }

  const consultaCpfInput = document.getElementById('consultaCpfInput');
  if (consultaCpfInput) {
    consultaCpfInput.addEventListener('input', (e) => {
      e.target.value = maskCpf(e.target.value);
    });
  }
});

window.preencherDemoCpf = function() {
  const input = document.getElementById('cpf-input') || document.getElementById('identificacaoCpfInput');
  if (input) {
    input.value = '123.456.789-00';
    const counter = document.getElementById('char-counter');
    if (counter) counter.textContent = '11/11';
    const badge = document.getElementById('badge-validacao');
    if (badge) {
      badge.classList.remove('hidden');
      badge.classList.add('inline-flex');
    }
    const btnLimpar = document.getElementById('btn-limpar');
    if (btnLimpar) btnLimpar.classList.remove('hidden');
    showToast('CPF de teste preenchido.', 'info');
  }
};

window.validarCpfEAvancar = async function() {
  const input = document.getElementById('identificacaoCpfInput');
  const erro = document.getElementById('identificacaoCpfErro');
  const cpfVal = (input?.value || '').replace(/\D/g, '');

  if (cpfVal.length !== 11) {
    if (erro) {
      erro.textContent = 'Informe um CPF válido com 11 dígitos.';
      erro.classList.remove('hidden');
    }
    showToast('Informe um CPF com 11 dígitos.', 'warning');
    return;
  }

  if (erro) erro.classList.add('hidden');
  state.candidato.cpf = maskCpf(cpfVal);

  const cpfReadOnly = document.getElementById('etapa2CpfReadOnly');
  if (cpfReadOnly) cpfReadOnly.value = state.candidato.cpf;
  const candCpfInput = document.getElementById('candidateCpf');
  if (candCpfInput) candCpfInput.value = state.candidato.cpf;

  // Consulta status da janela e busca pré-cadastro no back-end via apiClient
  try {
    if (window.apiClient) {
      try {
        const janela = await window.apiClient.config.obterJanela();
        if (janela && janela.em_periodo_valido === false) {
          showToast(janela.motivo_bloqueio || 'Aviso: O período de matrículas está encerrado pela Secretaria.', 'warning');
        }
      } catch (e) {}

      try {
        const resp = await window.apiClient.candidato.obterFicha(cpfVal);
        if (resp && resp.sucesso && resp.candidato) {
          preencherFichaCandidato(resp.candidato);
          showToast('Dados cadastrais prévios localizados e preenchidos automaticamente!', 'success');
        }
      } catch (err) {
        // Novo candidato
      }
    }
  } catch (err) {}

  window.navegarPara('etapa1');
};

// Preenche o estado e os campos da Ficha Cadastral com os dados salvos do candidato
function preencherFichaCandidato(c) {
    Object.assign(state.candidato, {
      nome_completo: c.nome_completo || state.candidato.nome_completo,
      nome_social: c.nome_social || '',
      rg: c.rg || c.rg_numero || '',
    cpf_emissao: c.cpf_emissao || '',
    cpf_validade: c.cpf_validade || '',
    certidao_termo: c.certidao_termo || '',
    certidao_livro: c.certidao_livro || '',
    certidao_folha: c.certidao_folha || '',
      rg_orgao: c.rg_orgao || '',
      rg_uf: c.rg_uf || 'RJ',
      rg_emissao: c.rg_emissao || '',
      rg_validade: c.rg_validade || '',
      data_nascimento: c.data_nascimento || '',
      email: c.email || '',
      telefone: c.telefone || '',
      cep: c.cep || '',
      logradouro: c.logradouro || '',
      numero: c.numero || '',
      bairro: c.bairro || '',
      cidade: c.cidade || 'Rio de Janeiro',
      uf: c.uf || 'RJ',
      titulo_eleitor: c.titulo_eleitor || '',
      titulo_zona: c.titulo_zona || '',
      titulo_secao: c.titulo_secao || '',
      certidao_matricula: c.certidao_matricula || '',
      escola_tipo: c.escola_tipo || 'PUBLICA',
      escola_nome: c.escola_nome || '',
      responsavel_nome: c.responsavel_nome || '',
      responsavel_cpf: c.responsavel_cpf || '',
      responsavel_rg: c.responsavel_rg || '',
      responsavel_vinculo: c.responsavel_vinculo || ''
    });

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val) el.value = val;
    };
    setVal('candidateName', c.nome_completo);
    setVal('socialName', c.nome_social);
    // ids reais da Ficha Cadastral (index.html): rg, zipCode, cpfIssueDate, birthCert*
  setVal('rg', c.rg || c.rg_numero);
  setVal('cpfIssueDate', c.cpf_emissao);
  setVal('cpfExpiryDate', c.cpf_validade);
  setVal('birthCertNumber', c.certidao_termo || c.certidao_matricula);
  setVal('birthCertBook', c.certidao_livro);
  setVal('birthCertPage', c.certidao_folha);
  setVal('zipCode', c.cep);
  if (c.estado_civil) setVal('maritalStatus', String(c.estado_civil).toUpperCase());
  if (c.sexo) {
    const sexo = /^f/i.test(String(c.sexo)) ? 'FEMININO' : 'MASCULINO';
    setVal('gender', sexo);
    if (typeof window.toggleMilitaryField === 'function') window.toggleMilitaryField(sexo);
  }
    setVal('rgIssuer', c.rg_orgao);
    setVal('rgState', c.rg_uf);
    setVal('rgIssueDate', c.rg_emissao);
    setVal('rgExpiryDate', c.rg_validade);
    setVal('birthDate', c.data_nascimento);
    setVal('cep', c.cep);
    setVal('street', c.logradouro);
    setVal('houseNumber', c.numero);
    setVal('neighborhood', c.bairro);
    setVal('city', c.cidade);
    setVal('state', c.uf);
    setVal('voterNumber', c.titulo_eleitor);
    setVal('voterId', c.titulo_eleitor);
    setVal('voterZone', c.titulo_zona);
    setVal('voterSection', c.titulo_secao);
    setVal('certidaoMatricula', c.certidao_matricula);
    setVal('schoolType', c.escola_tipo);
    setVal('schoolName', c.escola_nome);
    setVal('guardianName', c.responsavel_nome);
    setVal('guardianCpf', c.responsavel_cpf);
    setVal('guardianRg', c.responsavel_rg);
    setVal('guardianKinship', c.responsavel_vinculo);
}
window.preencherFichaCandidato = preencherFichaCandidato;

window.salvarEtapa1EAvancar = function() {
  const turnoEl = document.querySelector('input[name="etapa1Turno"]:checked');
  const cotaEl = document.querySelector('input[name="etapa1Cota"]:checked');

  state.candidato.turno = turnoEl ? turnoEl.value : 'NOTURNO';
  state.candidato.cota = cotaEl ? cotaEl.value : 'AMPLA CONCORRÊNCIA';

  window.navegarPara('etapa2');
};

window.consultarCepEtapa2 = async function(cepVal) {
  const clean = (cepVal || '').replace(/\D/g, '');
  if (clean.length !== 8) return;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    if (res.ok) {
      const data = await res.json();
      if (!data.erro) {
        const log = document.getElementById('etapa2Logradouro');
        const bai = document.getElementById('etapa2Bairro');
        const cid = document.getElementById('etapa2Cidade');
        const uf = document.getElementById('etapa2Uf');
        if (log) log.value = data.logradouro || '';
        if (bai) bai.value = data.bairro || '';
        if (cid) cid.value = data.localidade || '';
        if (uf) uf.value = (data.uf || 'RJ').toUpperCase();
        showToast('Endereço localizado via CEP.', 'success');
      }
    }
  } catch (e) {}
};

window.salvarEtapa2EAvancar = function() {
  const getV = (id) => document.getElementById(id)?.value?.trim() || '';

  const nome = getV('etapa2Nome');
  const dataNasc = getV('etapa2DataNasc');
  const rg = getV('etapa2Rg');
  const nomeMae = getV('etapa2NomeMae');
  const email = getV('etapa2Email');
  const tel = getV('etapa2Telefone');
  const cep = getV('etapa2Cep');
  const log = getV('etapa2Logradouro');
  const num = getV('etapa2Numero');
  const bai = getV('etapa2Bairro');

  if (!nome || !dataNasc || !rg || !nomeMae || !email || !tel || !cep || !log || !num || !bai) {
    showToast('Por favor, preencha todos os campos obrigatórios (*).', 'warning');
    return;
  }

  state.candidato.nome_completo = nome;
  state.candidato.data_nascimento = dataNasc;
  state.candidato.sexo = getV('etapa2Sexo') || 'M';
  state.candidato.cor_raca = getV('etapa2CorRaca') || 'Parda';
  state.candidato.estado_civil = getV('etapa2EstadoCivil') || 'Solteiro(a)';
  state.candidato.rg = rg;
  state.candidato.rg_orgao = getV('etapa2RgOrgao') || 'DETRAN/RJ';
  state.candidato.nome_mae = nomeMae;
  state.candidato.nome_pai = getV('etapa2NomePai');
  state.candidato.email = email;
  state.candidato.telefone = tel;
  state.candidato.cep = cep;
  state.candidato.logradouro = log;
  state.candidato.numero = num;
  state.candidato.bairro = bai;
  state.candidato.cidade = getV('etapa2Cidade') || 'Rio de Janeiro';
  state.candidato.uf = getV('etapa2Uf') || 'RJ';

  window.navegarPara('etapa3');
};

window.registrarArquivoAnexado = function(tipo, inputEl) {
  if (!inputEl || !inputEl.files || !inputEl.files[0]) return;
  const file = inputEl.files[0];
  const label = document.getElementById(`labelUpload${tipo}`);
  if (label) {
    label.textContent = `✓ ${file.name.substring(0, 16)}...`;
    label.parentElement.classList.add('bg-primary', 'text-on-primary');
  }
  state.candidato.documentos[tipo] = file.name;
  showToast(`Documento ${file.name} anexado com sucesso.`, 'info');
};

// Ex.: "06 de novembro de 2026 às 01:24:49 (Horário de Brasília)"
function formatarDataHoraBrasilia(data) {
  const fuso = { timeZone: 'America/Sao_Paulo' };
  const dia = data.toLocaleDateString('pt-BR', { ...fuso, day: '2-digit', month: 'long', year: 'numeric' });
  const hora = data.toLocaleTimeString('pt-BR', { ...fuso, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${dia} às ${hora} (Horário de Brasília)`;
}

window.finalizarMatriculaEAvancar = async function() {
  const btn = document.getElementById('btnFinalizarMatricula');
  try {
    if (btn) btn.disabled = true;

    const cand = {
      ...(window.__coruja_state?.candidato || {}),
      ...(state.candidato || {})
    };

    const payload = {
      ue: 'FAETERJ-Rio (Quintino)',
      curso: cand.curso || 'ANÁLISE E DESENVOLVIMENTO DE SISTEMAS',
      turno: cand.turno || 'NOTURNO',
      semestre: '2026.1',
      ano_ingresso: 2026,
      forma_ingresso_cota: cand.cota || 'AMPLA CONCORRÊNCIA',
      forma_ingresso: 'Vestibular FAETEC',
      sistema_concorrencia: cand.cota || 'Ampla Concorrência',
      nome_completo: cand.nome_completo,
      nome_social: cand.nome_social || '',
      cpf: cand.cpf,
      cpf_emissao: cand.cpf_emissao || cand.cpf_data_emissao || '',
      cpf_validade: cand.cpf_validade || '',
      data_nascimento: cand.data_nascimento,
      sexo: cand.sexo || 'M',
      estado_civil: cand.estado_civil || 'Solteiro(a)',
      cor_raca: cand.cor_raca || 'Parda',
      rg_numero: cand.rg || cand.rg_numero || '',
      rg_orgao: cand.rg_orgao || 'DETRAN/RJ',
      rg_uf: cand.rg_uf || 'RJ',
      rg_validade: cand.rg_validade || '',
      nome_mae: cand.nome_mae || 'MÃE DO CANDIDATO',
      nome_pai: cand.nome_pai || '',
      email: cand.email || 'candidato@exemplo.com',
      telefone: cand.telefone || '(21) 99999-9999',
      cep: cand.cep,
      logradouro: cand.logradouro,
      numero: cand.numero,
      bairro: cand.bairro,
      cidade: cand.cidade || 'Rio de Janeiro',
      uf: cand.uf || 'RJ',
      titulo_eleitor: cand.titulo_eleitor || '',
      titulo_zona: cand.titulo_zona || '',
      titulo_secao: cand.titulo_secao || '',
      certidao_numero: cand.certidao_numero || cand.certidao_matricula || cand.certidao_termo || '',
      responsavel_nome: cand.responsavel_nome || '',
      responsavel_cpf: cand.responsavel_cpf || '',
      responsavel_rg: cand.responsavel_rg || '',
      ensino_medio_escola: cand.escola_nome || 'Conforme Histórico Escolar Oficial',
      ensino_medio_ano: '2025',
      ensino_medio_tipo: cand.escola_tipo || 'Pública',
      // NIS do CadÚnico (obrigatório e conferido no servidor quando a vaga é de cota)
      cad_unico_nis: cand.nis || cand.cad_unico_nis || '',
      // Veio do "Editar Matrícula": o servidor atualiza a matrícula existente (mesmo protocolo)
      edicao: Boolean(state.edicao),
      // Documentos que o candidato não enviou: saem como pendência no comprovante
      documentos_pendentes: typeof window.documentosPendentes === 'function'
        ? window.documentosPendentes().map(p => p.nome)
        : []
    };
    state.candidato.documentos_pendentes = payload.documentos_pendentes;

    let data;
    if (window.apiClient) {
      data = await window.apiClient.matriculas.criar(payload);
    } else {
      const res = await fetch('/api/matriculas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar matrícula.');
    }

    // Protocolo vem sempre do servidor (antes havia um protocolo inventado como reserva)
    state.protocoloGerado = data.protocolo || (data.matricula && data.matricula.protocolo) || null;
    if (!state.protocoloGerado) throw new Error('O servidor não devolveu o número do protocolo. Tente novamente.');

    // Tela de Confirmação & Protocolo: o elemento é "protocol-number" (antes gravava num id
    // inexistente e a tela, o "Copiar Código" e o comprovante mostravam um protocolo de exemplo)
    const protEl = document.getElementById('protocol-number');
    const resumoEl = document.getElementById('etapa4ResumoAluno');
    if (protEl) protEl.textContent = state.protocoloGerado;
    if (resumoEl) {
      resumoEl.textContent = `${state.candidato.nome_completo} • ${state.candidato.curso} • ${state.candidato.turno}`;
    }

    showToast(data.editada ? 'Matrícula atualizada com sucesso!' : 'Matrícula concluída com sucesso!', 'success');
    // Data/hora real do registro (ou da edição) no horário de Brasília
    const mat = data.matricula || {};
    const quando = new Date((data.editada ? mat.data_atualizacao : (mat.data_envio || mat.data_matricula)) || Date.now());
    const rotuloData = document.getElementById('protocolo-data-rotulo');
    const valorData = document.getElementById('protocolo-data-hora');
    if (rotuloData) rotuloData.textContent = data.editada ? 'Atualizado em:' : 'Registrado em:';
    if (valorData) valorData.textContent = formatarDataHoraBrasilia(isNaN(quando) ? new Date() : quando);

    // Aviso final: na edição diz que a matrícula existente foi atualizada (mesmo protocolo)
    const tituloSucesso = document.getElementById('modalSucessoTitulo');
    const textoSucesso = document.getElementById('modalSucessoTexto');
    if (tituloSucesso) tituloSucesso.textContent = data.editada ? 'Matrícula Atualizada com Sucesso!' : 'Matrícula Realizada com Sucesso!';
    if (textoSucesso) {
      textoSucesso.textContent = data.editada
        ? `Sua matrícula ${state.protocoloGerado} foi atualizada com as novas informações. O protocolo continua o mesmo.`
        : 'Seu formulário de Matrícula foi criado com sucesso.';
    }
    state.edicao = null;
    window.navegarPara('etapa4');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.imprimirComprovanteFinal = function() {
  window.print();
};

window.abrirModalConsulta = function() {
  document.getElementById('modalConsulta')?.classList.remove('hidden');
};

window.fecharModalConsulta = function() {
  document.getElementById('modalConsulta')?.classList.add('hidden');
};

// Alterna entre a consulta (CPF + senha) e a troca de senha (CPF + data de nascimento)
window.mostrarRedefinirSenhaConsulta = function(mostrar) {
  document.getElementById('formConsultaLogin')?.classList.toggle('hidden', mostrar);
  document.getElementById('formConsultaRedefinir')?.classList.toggle('hidden', !mostrar);
  document.getElementById('resultadoConsultaBox')?.classList.add('hidden');
  if (mostrar) {
    const cpf = document.getElementById('consultaCpfInput')?.value || '';
    const redefCpf = document.getElementById('redefCpfInput');
    if (redefCpf && !redefCpf.value) redefCpf.value = cpf;
    // V3: com lista de convocados, a troca de senha também pede o número de inscrição
    window.apiClient?.config?.obterJanela?.().then(j => {
      if (j && j.exige_numero_inscricao) document.getElementById('redefInscricaoBloco')?.classList.remove('hidden');
    }).catch(() => {});
  }
};

window.executarRedefinirSenhaConsulta = async function() {
  const cpf = document.getElementById('redefCpfInput')?.value?.trim() || '';
  const nascimento = document.getElementById('redefNascimentoInput')?.value?.trim() || '';
  const senha = document.getElementById('redefSenhaInput')?.value || '';
  const senha2 = document.getElementById('redefSenha2Input')?.value || '';

  if (cpf.replace(/\D/g, '').length !== 11) return showToast('Informe o CPF completo.', 'warning');
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(nascimento)) return showToast('Informe a data de nascimento no formato DD/MM/AAAA.', 'warning');
  if (senha.length < 6) return showToast('A nova senha deve ter pelo menos 6 caracteres.', 'warning');
  if (senha !== senha2) return showToast('As duas senhas digitadas não são iguais.', 'warning');

  try {
    const res = await fetch('/api/auth/aluno/redefinir-senha-nascimento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cpf,
        data_nascimento: nascimento,
        nova_senha: senha,
        numero_inscricao: document.getElementById('redefInscricaoInput')?.value?.trim() || ''
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não foi possível alterar a senha.');
    showToast(data.message || 'Senha alterada com sucesso.', 'success');
    ['redefNascimentoInput', 'redefSenhaInput', 'redefSenha2Input', 'redefInscricaoInput'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const cpfConsulta = document.getElementById('consultaCpfInput');
    if (cpfConsulta) cpfConsulta.value = cpf;
    window.mostrarRedefinirSenhaConsulta(false);
    document.getElementById('consultaSenhaInput')?.focus();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Consulta da matrícula com o CPF e a senha criados no início da matrícula
window.executarConsultaProtocolo = async function() {
  const cpf = document.getElementById('consultaCpfInput')?.value?.trim() || '';
  const senha = document.getElementById('consultaSenhaInput')?.value || '';
  const box = document.getElementById('resultadoConsultaBox');

  if (cpf.replace(/\D/g, '').length !== 11) {
    showToast('Informe o CPF completo para consultar.', 'warning');
    return;
  }
  if (!senha) {
    showToast('Informe sua senha. Se não lembrar, use "Esqueci minha senha".', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/auth/aluno/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf, senha })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404) throw new Error('Não encontramos cadastro para este CPF.');
      if (res.status === 401) throw new Error('Senha incorreta. Se não lembrar, use "Esqueci minha senha".');
      throw new Error(data.error || 'Não foi possível consultar.');
    }

    const lista = Array.isArray(data.matriculas_anteriores) ? data.matriculas_anteriores : [];
    if (lista.length === 0) {
      if (box) {
        box.innerHTML = '<div class="text-xs text-on-surface-variant">Seu cadastro foi encontrado, mas ainda não há matrícula finalizada para este CPF.</div>';
        box.classList.remove('hidden');
      }
      return;
    }
    const dataDe = (m) => String(m.data_matricula || m.created_at || m.data_criacao || '');
    const mat = [...lista].sort((a, b) => dataDe(b).localeCompare(dataDe(a)))[0];
    window.__consultaMatriculaAtual = mat;
    // Guarda a sessão do candidato só na memória da página, para o botão "Editar Matrícula"
    consultaSessao = { token: data.token, aluno: data.aluno };
    const podeEditar = !STATUS_SEM_EDICAO.includes(String(mat.status || ''));

    if (box) {
      const esc = window.escapeHtml;
      box.innerHTML = `
        <div class="flex items-center justify-between border-b pb-2 border-surface-container-high">
          <strong class="text-primary font-mono text-xs">${esc(mat.protocolo || '-')}</strong>
          <span class="px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-100 text-emerald-800">${esc(mat.status || 'Em análise')}</span>
        </div>
        <div class="text-xs space-y-1">
          <div><span class="text-on-surface-variant font-medium">Estudante:</span> <strong>${esc(mat.nome_completo || '-')}</strong></div>
          <div><span class="text-on-surface-variant font-medium">Curso:</span> ${esc(mat.curso || '-')}</div>
          <div><span class="text-on-surface-variant font-medium">Turno:</span> ${esc(mat.turno || '-')}</div>
          <div><span class="text-on-surface-variant font-medium">Semestre:</span> ${esc(mat.semestre || '-')}</div>
        </div>
        <p class="pt-1 text-xs font-semibold text-on-surface">O que você deseja fazer?</p>
        <!-- Mesmo estilo do botão "Consultar Status" -->
        <div class="flex flex-col gap-2">
          <button type="button" onclick="editarMatriculaConsulta()" ${podeEditar ? '' : 'disabled'} class="w-full py-3 rounded-xl bg-secondary hover:bg-primary text-on-secondary font-bold text-xs uppercase tracking-wider transition shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            <span class="material-symbols-outlined text-[18px]">edit_document</span>
            <span>Editar Matrícula</span>
          </button>
          <button type="button" onclick="baixarComprovanteConsulta()" class="w-full py-3 rounded-xl bg-secondary hover:bg-primary text-on-secondary font-bold text-xs uppercase tracking-wider transition shadow-sm flex items-center justify-center gap-2 cursor-pointer">
            <span class="material-symbols-outlined text-[18px]">download</span>
            <span>Baixar Comprovante de Matrícula</span>
          </button>
        </div>
        ${podeEditar ? '' : '<p class="text-[11px] text-on-surface-variant">Sua matrícula já foi analisada pela secretaria e não pode mais ser editada pelo portal. Procure a Secretaria Acadêmica.</p>'}
      `;
      box.classList.remove('hidden');
    }
    document.getElementById('consultaSenhaInput').value = '';
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// Mesmo comprovante entregue no final da matrícula (confirmacao.js), com os dados consultados
window.baixarComprovanteConsulta = function() {
  const mat = window.__consultaMatriculaAtual;
  if (!mat || typeof window.downloadMatriculaPDF !== 'function') return;
  window.downloadMatriculaPDF({
    protocolo: mat.protocolo,
    nome_completo: mat.nome_completo,
    cpf: mat.cpf,
    curso: mat.curso,
    turno: mat.turno,
    semestre: mat.semestre,
    cota: mat.forma_ingresso_cota || mat.sistema_concorrencia,
    status: mat.status,
    documentos_pendentes: mat.documentos_pendentes
  });
};

// Mesma lista do servidor (server.js): depois do parecer da secretaria não se edita mais
const STATUS_SEM_EDICAO = ['Deferida', 'Indeferida', 'Efetivada', 'Cancelada', 'Excluída'];
let consultaSessao = null;

// Cota gravada na matrícula -> cartão da Etapa 1
function chaveDaCota(cota) {
  const c = String(cota || '').toLowerCase();
  if (c.includes('negr') || c.includes('indíg') || c.includes('indig')) return 'negro';
  if (c.includes('pública') || c.includes('publica')) return 'rede_publica';
  if (c.includes('pcd') || c.includes('deficiência') || c.includes('deficiencia') || c.includes('militar')) return 'pcd_militar';
  return 'ampla';
}

// "Editar Matrícula": entra com a sessão da consulta, carrega ficha e documentos
// e abre a Etapa 1 para o candidato refazer o que quiser. O protocolo continua o mesmo.
window.editarMatriculaConsulta = async function() {
  const mat = window.__consultaMatriculaAtual;
  if (!mat || !consultaSessao || !consultaSessao.token || !window.apiClient) {
    showToast('Consulte sua matrícula novamente para editar.', 'warning');
    return;
  }
  if (STATUS_SEM_EDICAO.includes(String(mat.status || ''))) {
    showToast('Sua matrícula já foi analisada e não pode mais ser editada pelo portal.', 'warning');
    return;
  }

  window.apiClient.setSession(consultaSessao.token, consultaSessao.aluno, 'ALUNO');
  consultaSessao = null;

  const cpfFmt = maskCpf(String(mat.cpf || ''));
  state.candidato.cpf = cpfFmt;
  state.protocoloGerado = mat.protocolo || null;
  state.edicao = { protocolo: mat.protocolo };
  ['identificacaoCpfInput', 'candidateCpf', 'etapa2CpfReadOnly'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = cpfFmt;
  });

  // Ficha cadastral salva
  try {
    const resp = await window.apiClient.candidato.obterFicha(cpfFmt.replace(/\D/g, ''));
    if (resp && resp.sucesso && resp.candidato) preencherFichaCandidato(resp.candidato);
  } catch (e) {
    // Sem ficha separada: usa os dados da própria matrícula
    preencherFichaCandidato({ ...mat, rg: mat.rg_numero || mat.rg, escola_nome: mat.ensino_medio_escola });
  }
  ['email', 'telefone', 'nome_mae', 'nome_pai', 'sexo', 'cor_raca', 'estado_civil'].forEach(k => {
    if (mat[k] && !state.candidato[k]) state.candidato[k] = mat[k];
  });

  // Turno e modalidade escolhidos na matrícula
  state.candidato.turno = mat.turno || state.candidato.turno;
  state.candidato.cota = mat.forma_ingresso_cota || mat.sistema_concorrencia || state.candidato.cota;
  const chave = chaveDaCota(state.candidato.cota);
  if (typeof window.selectShift === 'function') window.selectShift(/MATUT|MANH/i.test(String(mat.turno || '')) ? 'manha' : 'noite');
  if (typeof window.selectQuota === 'function') window.selectQuota(chave, chave !== 'ampla');
  const nis = document.getElementById('nis-number');
  if (nis && mat.cad_unico_nis) nis.value = mat.cad_unico_nis;
  state.candidato.nis = mat.cad_unico_nis || '';

  // Documentos já enviados voltam para a Etapa 3
  try {
    const docs = await window.apiClient.candidato.listarDocumentos();
    if (typeof window.carregarDocumentosSalvos === 'function') {
      window.carregarDocumentosSalvos((docs && docs.documentos) || []);
    }
  } catch (e) {
    console.warn('Não foi possível carregar os documentos enviados:', e);
  }

  window.fecharModalConsulta();
  window.navegarPara('etapa1');
  showToast(`Editando a matrícula ${mat.protocolo}. Revise as etapas e conclua em "Matricular-se".`, 'info');
};

// Botão e janela "Secretaria" removidos do portal a pedido do responsável (M039):
// o acesso da secretaria será implementado de outra forma.

window.abrirModalAjuda = function() {
  document.getElementById('modalAjuda')?.classList.remove('hidden');
};

window.abrirModalLgpd = function() {
  document.getElementById('modalLgpd')?.classList.remove('hidden');
};

window.fecharModalLgpd = function() {
  document.getElementById('modalLgpd')?.classList.add('hidden');
};

window.fecharModalAjuda = function() {
  document.getElementById('modalAjuda')?.classList.add('hidden');
};

  window.__coruja_state = state;
})();
