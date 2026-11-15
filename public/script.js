/**
 * FAETERJ-Rio Coruja - Script da Matrícula Online
 * Controla a Identificação do Candidato (CPF/Senha) e a Etapa 1 (Modalidade & Turno)
 */

// =========================================================================
// ETAPA 1: MODALIDADE & CONCORRÊNCIA / TURNO
// =========================================================================
const quotaKeys = ['ampla', 'negro', 'rede_publica', 'pcd_militar'];
const shiftKeys = ['manha', 'noite'];

// Turno selection logic
function selectShift(shiftVal) {
  clearValidationAlert();
  shiftKeys.forEach(k => {
    const label = document.getElementById(`label-shift-${k}`);
    const indicator = document.getElementById(`radio-indicator-${k}`);
    const input = label ? label.querySelector('input[name="shift"]') : null;
    const dot = indicator ? indicator.querySelector('span') : null;

    if (k === shiftVal) {
      if (input) input.checked = true;
      if (label) {
        label.classList.remove('ring-transparent');
        label.classList.add('ring-primary');
      }
      if (indicator) {
        indicator.classList.remove('bg-surface-container');
        indicator.classList.add('bg-primary');
      }
      if (dot) {
        dot.classList.remove('opacity-0');
      }
    } else {
      if (input) input.checked = false;
      if (label) {
        label.classList.remove('ring-primary');
        label.classList.add('ring-transparent');
      }
      if (indicator) {
        indicator.classList.remove('bg-primary');
        indicator.classList.add('bg-surface-container');
      }
      if (dot) {
        dot.classList.add('opacity-0');
      }
    }
  });
}
window.selectShift = selectShift;

// Quota selection logic
function selectQuota(quotaVal, isQuotaSelected) {
  clearValidationAlert();
  quotaKeys.forEach(k => {
    const card = document.getElementById(`card-${k}`);
    const iconWrap = document.getElementById(`check-icon-${k}`);
    const icon = iconWrap ? iconWrap.querySelector('span') : null;
    const input = card ? card.querySelector('input[name="vaga_modalidade"]') : null;

    if (k === quotaVal) {
      if (input) input.checked = true;
      if (card) {
        card.classList.remove('bg-surface-container-low', 'hover:bg-surface-container', 'ring-transparent');
        card.classList.add('bg-primary/5', 'ring-primary');
      }
      if (iconWrap) {
        iconWrap.classList.remove('bg-surface-container-high');
        iconWrap.classList.add('bg-primary');
      }
      if (icon) {
        icon.classList.remove('opacity-0');
      }
    } else {
      if (input) input.checked = false;
      if (card) {
        card.classList.remove('bg-primary/5', 'ring-primary');
        card.classList.add('bg-surface-container-low', 'hover:bg-surface-container', 'ring-transparent');
      }
      if (iconWrap) {
        iconWrap.classList.remove('bg-primary');
        iconWrap.classList.add('bg-surface-container-high');
      }
      if (icon) {
        icon.classList.add('opacity-0');
      }
    }
  });

  handleQuotaChange(isQuotaSelected);
}
window.selectQuota = selectQuota;

// Dynamic handling of Quota selection vs Ampla Concorrência
function handleQuotaChange(isQuotaSelected) {
  const cadUnicoContainer = document.getElementById('cadunico-container');
  const nisInput = document.getElementById('nis-number');

  if (cadUnicoContainer) {
    if (isQuotaSelected) {
      cadUnicoContainer.classList.remove('hidden');
      cadUnicoContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const hasCadUnico = document.querySelector('input[name="has_cadunico"]:checked')?.value;
      if (hasCadUnico === 'sim' && nisInput) {
        nisInput.setAttribute('required', 'required');
      }
    } else {
      cadUnicoContainer.classList.add('hidden');
      if (nisInput) {
        nisInput.removeAttribute('required');
        nisInput.value = '';
      }
    }
  }
}
window.handleQuotaChange = handleQuotaChange;

// Toggle NIS field based on "Possui CADUNICO: Sim / Nao"
function toggleNisField(hasCadUnico) {
  const nisWrapper = document.getElementById('nis-input-wrapper');
  const warningBox = document.getElementById('cadunico-warning');
  const nisInput = document.getElementById('nis-number');

  if (hasCadUnico) {
    if (nisWrapper) nisWrapper.classList.remove('hidden');
    if (warningBox) warningBox.classList.add('hidden');
    if (nisInput) nisInput.setAttribute('required', 'required');
  } else {
    if (nisWrapper) nisWrapper.classList.add('hidden');
    if (warningBox) warningBox.classList.remove('hidden');
    if (nisInput) {
      nisInput.removeAttribute('required');
      nisInput.value = '';
    }
  }
}
window.toggleNisField = toggleNisField;

// E-mail da Secretaria Acadêmica (o mesmo da janela "Ajuda")
const EMAIL_SECRETARIA = 'sec_acad@exemplo.com';

function showValidationAlert(message, opcoes = {}) {
  const alertBox = document.getElementById('validation-error-alert');
  const alertText = document.getElementById('validation-error-text');
  if (alertText) {
    alertText.textContent = message;
    // Mensagens de cota/CadÚnico indicam onde tirar dúvidas
    if (opcoes.emailSecretaria) {
      alertText.appendChild(document.createTextNode(' Em caso de dúvidas, envie um e-mail para a Secretaria Acadêmica: '));
      const link = document.createElement('a');
      link.href = `mailto:${EMAIL_SECRETARIA}?subject=${encodeURIComponent('Dúvida sobre CadÚnico e cotas - FAETERJ-Rio')}`;
      link.className = 'underline';
      link.textContent = EMAIL_SECRETARIA;
      alertText.appendChild(link);
      alertText.appendChild(document.createTextNode('.'));
    }
  }
  if (alertBox) {
    alertBox.classList.remove('hidden');
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
window.showValidationAlert = showValidationAlert;

function clearValidationAlert() {
  const alertBox = document.getElementById('validation-error-alert');
  if (alertBox) alertBox.classList.add('hidden');
}
window.clearValidationAlert = clearValidationAlert;

// Handle Return / Voltar ao Início
function handleVoltarInicio() {
  if (typeof window.navegarPara === 'function') {
    window.navegarPara('identificacao');
  } else if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = '/';
  }
}
window.handleVoltarInicio = handleVoltarInicio;

// NIS do CadÚnico: 11 dígitos com dígito verificador (mesma regra do servidor, validarNis)
function nisValido(nis) {
  const d = String(nis || '').replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = pesos.reduce((s, p, i) => s + p * Number(d[i]), 0);
  const resto = soma % 11;
  return (resto < 2 ? 0 : 11 - resto) === Number(d[10]);
}
window.nisValido = nisValido;

// Handle Form Proceed with validation and smooth transition to Etapa 2
function handleStepOneSubmit() {
  clearValidationAlert();

  const selectedShift = document.querySelector('input[name="shift"]:checked');
  const selectedQuota = document.querySelector('input[name="vaga_modalidade"]:checked');

  if (!selectedShift || !selectedQuota) {
    showValidationAlert('Selecione o turno e a modalidade de concorrência para continuar.');
    return;
  }

  // Check CADUNICO requirement if quota is not ampla
  if (selectedQuota.value !== 'ampla') {
    const hasCadUnico = document.querySelector('input[name="has_cadunico"]:checked')?.value;
    const nisInput = document.getElementById('nis-number');
    // Cota exige CadÚnico: sem registro ativo não avança para a etapa 2
    if (hasCadUnico !== 'sim') {
      showValidationAlert('Para concorrer a uma vaga de cota é obrigatório ter registro ativo no CadÚnico. Sem o CadÚnico, selecione Ampla Concorrência.', { emailSecretaria: true });
      return;
    }
    // Confere tamanho e dígito verificador (antes qualquer 11 dígitos, até 00000000000, passava)
    if (!nisInput || !nisValido(nisInput.value)) {
      showValidationAlert('Por favor, informe um NIS válido do CadÚnico (11 dígitos). Confira o número no cartão ou no aplicativo do CadÚnico.', { emailSecretaria: true });
      if (nisInput) nisInput.focus();
      return;
    }
  }

  // Sincroniza dados com o estado global da matrícula
  if (window.__coruja_state && window.__coruja_state.candidato) {
    window.__coruja_state.candidato.turno = selectedShift.value === 'manha' ? 'MATUTINO' : 'NOTURNO';
    const cotaLabels = {
      ampla: 'AMPLA CONCORRÊNCIA',
      negro: 'Negros e Indígenas',
      rede_publica: 'Rede Pública',
      pcd_militar: 'Pessoas com Deficiência (PCD)'
    };
    window.__coruja_state.candidato.cota = cotaLabels[selectedQuota.value] || selectedQuota.value;
    const nisInput = document.getElementById('nis-number');
    // Só guarda o NIS para cota; na Ampla Concorrência não leva um NIS antigo adiante
    window.__coruja_state.candidato.nis = selectedQuota.value !== 'ampla' && nisInput
      ? nisInput.value.replace(/\D/g, '')
      : '';
  }

  // Trigger smooth loading state on button
  const btnSubmit = document.getElementById('btn-submit');
  const btnText = document.getElementById('btn-text');
  const btnIcon = document.getElementById('btn-icon');
  const btnSpinner = document.getElementById('btn-spinner');

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.classList.add('opacity-80', 'cursor-not-allowed');
  }
  if (btnText) btnText.textContent = 'Carregando Ficha Cadastral...';
  if (btnIcon) btnIcon.classList.add('hidden');
  if (btnSpinner) btnSpinner.classList.remove('hidden');

  // Toast feedback banner
  const feedbackBanner = document.createElement('div');
  feedbackBanner.className = 'fixed bottom-6 right-6 z-50 bg-primary text-on-primary px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 transition-all duration-300';
  feedbackBanner.innerHTML = `
    <span class="material-symbols-outlined text-tertiary-fixed">check_circle</span>
    <div class="flex flex-col">
      <span class="font-label-md text-label-md font-bold">Modalidade confirmada!</span>
      <span class="font-body-sm text-body-sm">Avançando para Etapa 2: Ficha Cadastral...</span>
    </div>
  `;
  document.body.appendChild(feedbackBanner);

  setTimeout(() => {
    // Advance stepper visuals
    const progressBar = document.getElementById('progress-bar-fill');
    if (progressBar) progressBar.style.width = '38%';

    const step2Col = document.getElementById('step-2-col');
    const step2Ind = document.getElementById('step-2-indicator');
    const step2Status = document.getElementById('step-2-status');
    if (step2Col) step2Col.classList.remove('opacity-70');
    if (step2Ind) {
      step2Ind.classList.remove('bg-surface-container', 'text-on-surface-variant');
      step2Ind.classList.add('bg-primary', 'text-on-primary', 'shadow-md', 'shadow-primary/25', 'ring-4', 'ring-primary-fixed');
    }
    if (step2Status) {
      step2Status.textContent = 'Etapa Atual';
      step2Status.classList.add('text-primary', 'font-medium');
    }

    window.location.hash = '#passo-2-ficha-cadastral';
    feedbackBanner.remove();

    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.classList.remove('opacity-80', 'cursor-not-allowed');
    }
    if (btnText) btnText.textContent = 'Continuar para Ficha Cadastral';
    if (btnIcon) btnIcon.classList.remove('hidden');
    if (btnSpinner) btnSpinner.classList.add('hidden');

    if (typeof window.navegarPara === 'function') {
      window.navegarPara('etapa2');
    }
  }, 900);
}
window.handleStepOneSubmit = handleStepOneSubmit;


// =========================================================================
// TELA 1: IDENTIFICAÇÃO DO CANDIDATO (CPF E SENHA)
// =========================================================================
(function initCpfView() {
  function setup() {
    const input = document.getElementById('cpf-input');
    const badge = document.getElementById('badge-validacao');
    const counter = document.getElementById('char-counter');
    const erroMsg = document.getElementById('erro-msg');
    const btnLimpar = document.getElementById('btn-limpar');
    const senhaInput = document.getElementById('senha-input');
    const confirmaSenhaInput = document.getElementById('confirma-senha-input');

    if (!input) return;

    // V2: com lista de convocados, o 1º acesso pede o número de inscrição
    const inscricaoInput = document.getElementById('inscricao-input');
    if (inscricaoInput) {
      inscricaoInput.addEventListener('input', function () {
        inscricaoInput.value = inscricaoInput.value.replace(/\D/g, '').slice(0, 12);
      });
    }
    if (window.apiClient && window.apiClient.config && typeof window.apiClient.config.obterJanela === 'function') {
      window.apiClient.config.obterJanela().then(function (janela) {
        if (janela && janela.exige_numero_inscricao) {
          const bloco = document.getElementById('inscricao-bloco');
          if (bloco) bloco.classList.remove('hidden');
        }
      }).catch(function () { /* sem a informação, o servidor ainda confere e explica o erro */ });
    }

    // Função para aplicar máscara do CPF
    function aplicarMascara(valor) {
      const digitos = valor.replace(/\D/g, '').slice(0, 11);
      let formatado = digitos;

      if (digitos.length > 9) {
        formatado = digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
      } else if (digitos.length > 6) {
        formatado = digitos.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
      } else if (digitos.length > 3) {
        formatado = digitos.replace(/(\d{3})(\d{1,3})/, '$1.$2');
      }
      return { formatado, digitos };
    }

    // Evento de input do CPF
    input.addEventListener('input', function (e) {
      const { formatado, digitos } = aplicarMascara(e.target.value);
      e.target.value = formatado;

      if (counter) counter.textContent = digitos.length + '/11';

      if (btnLimpar) {
        if (digitos.length > 0) {
          btnLimpar.classList.remove('hidden');
        } else {
          btnLimpar.classList.add('hidden');
        }
      }

      if (badge) {
        if (digitos.length === 11) {
          badge.classList.remove('hidden');
          badge.classList.add('inline-flex');
          if (erroMsg) erroMsg.classList.add('hidden');
        } else {
          badge.classList.add('hidden');
          badge.classList.remove('inline-flex');
        }
      }
    });

    // Limpar campo de CPF
    window.limparCampo = function () {
      input.value = '';
      if (counter) counter.textContent = '0/11';
      if (badge) {
        badge.classList.add('hidden');
        badge.classList.remove('inline-flex');
      }
      if (btnLimpar) btnLimpar.classList.add('hidden');
      if (erroMsg) erroMsg.classList.add('hidden');
      input.focus();
    };

    // Validar CPF
    window.validarCpf = async function () {
      const digitos = input.value.replace(/\D/g, '');
      if (digitos.length < 11) {
        if (erroMsg) {
          erroMsg.innerHTML = '<span class="material-symbols-outlined text-[18px]">error</span><span>Por favor, insira os 11 dígitos do CPF para prosseguir com a validação.</span>';
          erroMsg.classList.remove('hidden');
        }
        input.focus();
        return;
      }

      // Validação de senha: agora obrigatória, pois protege a ficha do candidato no servidor
      if (senhaInput && confirmaSenhaInput) {
        const s1 = senhaInput.value;
        const s2 = confirmaSenhaInput.value;
        if (s1.length < 6) {
          if (erroMsg) {
            erroMsg.innerHTML = '<span class="material-symbols-outlined text-[18px]">error</span><span>A senha deve possuir pelo menos 6 caracteres.</span>';
            erroMsg.classList.remove('hidden');
          }
          senhaInput.focus();
          return;
        }
        if (s1 !== s2) {
          if (erroMsg) {
            erroMsg.innerHTML = '<span class="material-symbols-outlined text-[18px]">error</span><span>As senhas digitadas não coincidem.</span>';
            erroMsg.classList.remove('hidden');
          }
          confirmaSenhaInput.focus();
          return;
        }
      }

      if (erroMsg) erroMsg.classList.add('hidden');

      // Autentica (ou cria a conta no 1º acesso) no servidor e guarda o token do candidato.
      // Sem esse token as rotas da ficha, documentos e matrícula recusam a requisição.
      if (window.apiClient && senhaInput) {
        try {
          const acesso = await window.apiClient.auth.alunoAcesso({
            cpf: digitos,
            senha: senhaInput.value,
            numero_inscricao: inscricaoInput ? inscricaoInput.value.trim() : ''
          });
          window.apiClient.setSession(acesso.token, acesso.aluno, 'ALUNO');
        } catch (errAcesso) {
          if (erroMsg) {
            erroMsg.innerHTML = '<span class="material-symbols-outlined text-[18px]">error</span><span></span>';
            erroMsg.lastElementChild.textContent = errAcesso.message || 'Não foi possível validar o acesso.';
            erroMsg.classList.remove('hidden');
          }
          // Servidor pediu o número de inscrição: garante que o campo esteja visível
          if (/inscri[çc][ãa]o/i.test(errAcesso.message || '')) {
            const bloco = document.getElementById('inscricao-bloco');
            if (bloco) bloco.classList.remove('hidden');
            if (inscricaoInput) { inscricaoInput.focus(); return; }
          }
          senhaInput.focus();
          return;
        }
      }

      // Sincroniza estado da aplicação Coruja se disponível (a senha não fica guardada no navegador)
      if (window.__coruja_state && window.__coruja_state.candidato) {
        window.__coruja_state.candidato.cpf = input.value;
      }
      const cpfReadOnly = document.getElementById('etapa2CpfReadOnly');
      if (cpfReadOnly) cpfReadOnly.value = input.value;

      abrirModal(digitos);
    };

    // Controle do Modal
    const modal = document.getElementById('modal-feedback');
    const modalIconWrap = document.getElementById('modal-icon-wrap');
    const modalIcon = document.getElementById('modal-icon');
    const modalTitle = document.getElementById('modal-title');
    const modalDesc = document.getElementById('modal-desc');

    function abrirModal(cpf) {
      if (!modal) {
        if (typeof window.navegarPara === 'function') {
          window.navegarPara('etapa1');
        }
        return;
      }

      modal.classList.remove('hidden');
      modal.classList.add('flex');

      if (modalIconWrap) modalIconWrap.className = 'w-14 h-14 rounded-full bg-surface-container text-primary flex items-center justify-center mb-4 animate-spin';
      if (modalIcon) modalIcon.textContent = 'sync';
      if (modalTitle) modalTitle.textContent = 'Consultando Convocação';
      if (modalDesc) modalDesc.textContent = 'Localizando histórico do candidato de CPF ' + input.value + ' na lista geral de aprovados...';

      setTimeout(function () {
        if (modalIconWrap) modalIconWrap.className = 'w-14 h-14 rounded-full bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center mb-4';
        if (modalIcon) modalIcon.textContent = 'how_to_reg';
        if (modalTitle) modalTitle.textContent = 'Candidato Selecionado!';
        if (modalDesc) modalDesc.innerHTML = 'Convocação confirmada para <strong>Tecnologia em Análise de Sistemas Informatizados (TASI)</strong>. Redirecionando para seleção de modalidade...';

        setTimeout(function () {
          fecharModal();
          if (typeof window.navegarPara === 'function') {
            window.navegarPara('etapa1');
          }
        }, 1800);
      }, 1200);
    }

    window.fecharModal = function () {
      if (!modal) return;
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();

// =========================================================================
// ETAPA 2: FICHA CADASTRAL & DADOS DO CANDIDATO
// =========================================================================

// Funções de Máscaras (Mask Functions)
function maskCPF(input) {
  let value = input.value.replace(/\D/g, "");
  if (value.length > 11) value = value.slice(0, 11);
  value = value.replace(/(\d{3})(\d)/, "$1.$2");
  value = value.replace(/(\d{3})(\d)/, "$1.$2");
  value = value.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  input.value = value;
}
window.maskCPF = maskCPF;

function maskDate(input) {
  let value = input.value.replace(/\D/g, "");
  if (value.length > 8) value = value.slice(0, 8);
  if (value.length > 4) {
    value = value.replace(/^(\d{2})(\d{2})(\d{0,4})/, "$1/$2/$3");
  } else if (value.length > 2) {
    value = value.replace(/^(\d{2})(\d{0,2})/, "$1/$2");
  }
  input.value = value;
}
window.maskDate = maskDate;

function maskCEP(value) {
  value = value.replace(/\D/g, "");
  if (value.length > 8) value = value.slice(0, 8);
  if (value.length > 5) {
    value = value.replace(/^(\d{5})(\d{1,3})/, "$1-$2");
  }
  return value;
}
window.maskCEP = maskCEP;

// 1. Nomes e Textos Puros: Apenas letras (com todas as acentuações da língua portuguesa) e espaços
function maskLettersOnly(input) {
  let value = input.value.replace(/[^a-zA-ZÀ-ÿ\s]/g, "");
  input.value = value.toUpperCase();
}
window.maskLettersOnly = maskLettersOnly;

// 2. Documento de Identidade (RG Tradicional OU Novo RG/CIN - CPF)
function maskRgOrCpf(input) {
  // Aceita apenas dígitos numéricos e a letra 'X' (maiúscula) para RG tradicional
  let raw = input.value.replace(/[^0-9xX]/g, "").toUpperCase();

  // Limite estrito de no máximo 11 caracteres úteis (ou 14 com máscara) - NUNCA INFINITO!
  if (raw.indexOf("X") !== -1) {
    // Se possui 'X', só pode haver um X e no final
    const semX = raw.replace(/X/g, "");
    raw = semX.slice(0, 8) + "X";
  } else {
    if (raw.length > 11) raw = raw.slice(0, 11);
  }

  let formatted = raw;
  // Regra condicional ('OU' / 'OR'):
  // Se possui 10 ou 11 dígitos numéricos puros (sem X): formata como CPF / Novo RG CIN (000.000.000-00)
  if (raw.length > 9 && !raw.includes("X")) {
    formatted = raw
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  } else {
    // Possibilidade A: RG Tradicional (00.000.000-0 ou 00.000.000-X)
    if (raw.length > 8) {
      formatted = raw.replace(/^(\d{2})(\d{3})(\d{3})([\dX])$/, "$1.$2.$3-$4");
    } else if (raw.length > 5) {
      formatted = raw.replace(/^(\d{2})(\d{3})(\d{1,3})/, "$1.$2.$3");
    } else if (raw.length > 2) {
      formatted = raw.replace(/^(\d{2})(\d{1,3})/, "$1.$2");
    }
  }

  input.value = formatted;
}
window.maskRgOrCpf = maskRgOrCpf;

// 3. Título de Eleitor: Exatamente 12 dígitos (formato 0000 0000 0000)
function maskTituloEleitor(input) {
  let value = input.value.replace(/\D/g, "");
  if (value.length > 12) value = value.slice(0, 12);
  if (value.length > 8) {
    value = value.replace(/^(\d{4})(\d{4})(\d{1,4})/, "$1 $2 $3");
  } else if (value.length > 4) {
    value = value.replace(/^(\d{4})(\d{1,4})/, "$1 $2");
  }
  input.value = value;
}
window.maskTituloEleitor = maskTituloEleitor;

// 4. Certidão de Nascimento / Casamento: Número do Termo (somente números, sem quantidade fixa)
function maskCertidaoMatricula(input) {
  // Proibição de letras ou símbolos: estritamente dígitos numéricos
  input.value = input.value.replace(/\D/g, "");
}
window.maskCertidaoMatricula = maskCertidaoMatricula;

// 5. Livro e Folha da Certidão
function maskLivroCertidao(input) {
  let value = input.value.replace(/[^a-zA-Z0-9\-]/g, "").toUpperCase();
  if (value.length > 8) value = value.slice(0, 8);
  input.value = value;
}
window.maskLivroCertidao = maskLivroCertidao;

function maskFolhaCertidao(input) {
  let value = input.value.replace(/[^a-zA-Z0-9\-]/g, "").toUpperCase();
  if (value.length > 6) value = value.slice(0, 6);
  input.value = value;
}
window.maskFolhaCertidao = maskFolhaCertidao;

// 6. Logradouro / Nome da Rua: Rejeição de números (número é em campo separado)
function maskNomeRua(input) {
  // Remove imediatamente dígitos numéricos
  let value = input.value.replace(/[0-9]/g, "");
  // Permite apenas letras, acentos e pontuação habitual de logradouros
  value = value.replace(/[^a-zA-ZÀ-ÿ\s\.\'\,\-]/g, "");
  input.value = value.toUpperCase();
}
window.maskNomeRua = maskNomeRua;

// 7. Número da Casa: Limite de até 8 caracteres (nunca infinito)
function maskNumeroCasa(input) {
  let value = input.value.toUpperCase();
  if (value.length > 8) value = value.slice(0, 8);
  input.value = value;
}
window.maskNumeroCasa = maskNumeroCasa;

// 8. Nome da Escola, Autocomplete com Nome Completo Oficial & Validação no Google Maps
let escolaMapsTimeout = null;
let escolaSugestoesTimeout = null;
let activeSchoolSuggestions = [];
let selectedSuggestionIndex = -1;

function hideSchoolSuggestions() {
  const container = document.getElementById("schoolSuggestionsContainer");
  const spinner = document.getElementById("schoolSearchSpinner");
  if (container) container.classList.add("hidden");
  if (spinner) spinner.classList.add("hidden");
  selectedSuggestionIndex = -1;
}
window.hideSchoolSuggestions = hideSchoolSuggestions;

// Sugestões e validação no Google Maps foram desativadas a pedido do responsável (M036):
// o candidato digita o nome da escola livremente.
function handleSchoolNameFocus() {}
window.handleSchoolNameFocus = handleSchoolNameFocus;

function handleSchoolNameInput(input) {
  // Permite letras e números
  input.value = input.value.replace(/[^a-zA-Z0-9À-ÿ\s\.\'\,\-\–\/]/g, "").toUpperCase();
}
window.handleSchoolNameInput = handleSchoolNameInput;

let searchSeqId = 0;

async function buscarESugerirEscolas(termo) {
  const container = document.getElementById("schoolSuggestionsContainer");
  const spinner = document.getElementById("schoolSearchSpinner");
  if (!container) return;

  const currentSeq = ++searchSeqId;

  try {
    let data;
    if (window.apiClient) {
      data = await window.apiClient.escolas.sugestoes(termo);
    } else {
      const res = await fetch(`/api/escolas/sugestoes?q=${encodeURIComponent(termo)}`);
      data = await res.json();
    }

    // Se uma nova busca foi disparada enquanto aguardávamos a resposta, descarta o resultado antigo
    if (currentSeq !== searchSeqId) return;

    if (spinner) spinner.classList.add("hidden");

    if (data.sucesso && Array.isArray(data.sugestoes) && data.sugestoes.length > 0) {
      activeSchoolSuggestions = data.sugestoes;
      selectedSuggestionIndex = -1;
      renderizarSugestoesEscola(data.sugestoes, termo);
      container.classList.remove("hidden");
    } else {
      activeSchoolSuggestions = [];
      container.innerHTML = `
        <div class="p-3 text-xs text-on-surface-variant flex items-center gap-2">
          <span class="material-symbols-outlined text-[18px] text-outline">search_off</span>
          <span>Nenhuma instituição pré-cadastrada com "${escapeHtml(termo)}". Você pode continuar digitando o nome completo ou conferir no Google Maps.</span>
        </div>
      `;
      container.classList.remove("hidden");
    }
  } catch (err) {
    if (spinner) spinner.classList.add("hidden");
  }
}

function renderizarSugestoesEscola(sugestoes, termo) {
  const container = document.getElementById("schoolSuggestionsContainer");
  if (!container) return;

  const termoUpper = termo.toUpperCase();
  const itemsHtml = sugestoes.map((sug, idx) => {
    // Destaca o termo digitado no nome oficial
    const nomeCompleto = sug.nomeCompleto;
    let nomeFormatado = escapeHtml(nomeCompleto);
    const pos = nomeCompleto.indexOf(termoUpper);
    if (pos >= 0) {
      nomeFormatado = 
        escapeHtml(nomeCompleto.substring(0, pos)) +
        `<strong class="text-primary font-bold bg-primary/10 px-0.5 rounded">${escapeHtml(nomeCompleto.substring(pos, pos + termoUpper.length))}</strong>` +
        escapeHtml(nomeCompleto.substring(pos + termoUpper.length));
    }

    const badgeColor = sug.tipoDescricao?.includes('FAETEC') 
      ? 'bg-blue-100 text-blue-800 border-blue-200'
      : sug.tipoDescricao?.includes('FEDERAL') 
        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
        : sug.tipoDescricao?.includes('ESTADUAL')
          ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
          : 'bg-purple-100 text-purple-800 border-purple-200';

    return `
      <div 
        class="school-suggestion-item p-3 hover:bg-surface-container-high/60 cursor-pointer transition-colors flex items-start gap-3 text-left ${idx === selectedSuggestionIndex ? 'bg-surface-container-high' : ''}" 
        data-index="${idx}"
        onmousedown="selectSchoolSuggestionByIndex(${idx})"
      >
        <div class="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0 mt-0.5">
          <span class="material-symbols-outlined text-[18px]">school</span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="text-xs font-bold text-on-surface leading-tight">${nomeFormatado}</span>
            <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeColor}">
              ${escapeHtml(sug.tipoDescricao || 'OFICIAL')}
            </span>
          </div>
          <p class="text-[11px] text-on-surface-variant flex items-center gap-1 truncate">
            <span class="material-symbols-outlined text-[13px] text-outline">location_on</span>
            <span>${escapeHtml(sug.localidade || 'Rio de Janeiro - RJ')}</span>
          </p>
        </div>
        <span class="text-[11px] text-primary font-semibold shrink-0 flex items-center gap-0.5 hover:underline mt-1">
          <span>Escolher</span>
          <span class="material-symbols-outlined text-[14px]">arrow_forward</span>
        </span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="p-2 bg-surface-container-low/50 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider flex items-center justify-between border-b border-surface-container-high/40">
      <span>Instituições Sugeridas (Nome Completo Oficial)</span>
      <span class="text-[10px] text-primary font-normal">Clique para escolher</span>
    </div>
    <div class="divide-y divide-surface-container-high/40">
      ${itemsHtml}
    </div>
  `;
}

function atualizarItemSugeridoAtivo() {
  const container = document.getElementById("schoolSuggestionsContainer");
  if (!container) return;
  const items = container.querySelectorAll(".school-suggestion-item");
  items.forEach((item, idx) => {
    if (idx === selectedSuggestionIndex) {
      item.classList.add("bg-surface-container-high");
      item.classList.add("border-l-4");
      item.classList.add("border-primary");
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove("bg-surface-container-high");
      item.classList.remove("border-l-4");
      item.classList.remove("border-primary");
    }
  });
}

function selectSchoolSuggestionByIndex(index) {
  if (activeSchoolSuggestions && activeSchoolSuggestions[index]) {
    selectSchoolSuggestion(activeSchoolSuggestions[index]);
  }
}
window.selectSchoolSuggestionByIndex = selectSchoolSuggestionByIndex;

function selectSchoolSuggestion(suggestion) {
  const input = document.getElementById("schoolName");
  const schoolTypeSelect = document.getElementById("schoolType");

  if (input) {
    input.value = suggestion.nomeCompleto;
  }

  // Preenche automaticamente o Tipo de Rede se aplicável
  if (schoolTypeSelect && suggestion.tipoRede) {
    schoolTypeSelect.value = suggestion.tipoRede;
  }

  hideSchoolSuggestions();

  // Aciona validação imediata no Google Maps com o nome completo oficial
  validarEscolaGoogleMaps(suggestion.nomeCompleto, suggestion);
}
window.selectSchoolSuggestion = selectSchoolSuggestion;

async function validarEscolaGoogleMaps(nomeEscola, sugestaoObj = null) {
  const statusContainer = document.getElementById("schoolMapsStatusContainer");
  const badge = document.getElementById("schoolMapsBadge");
  const linkBtn = document.getElementById("schoolMapsLinkBtn");
  const details = document.getElementById("schoolMapsDetails");

  if (!nomeEscola) {
    if (statusContainer) statusContainer.classList.add("hidden");
    return;
  }

  if (statusContainer) statusContainer.classList.remove("hidden");
  if (badge) {
    badge.innerHTML = `<span class="material-symbols-outlined text-[16px] animate-spin text-primary">progress_activity</span> <span class="text-xs text-primary font-medium">Validando existência no Google Maps...</span>`;
  }

  try {
    const cidade = document.getElementById("city")?.value || "Rio de Janeiro";
    const uf = document.getElementById("state")?.value || "RJ";
    let data;
    if (window.apiClient) {
      data = await window.apiClient.escolas.validarMaps(nomeEscola, cidade, uf);
    } else {
      const res = await fetch("/api/escolas/validar-maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomeEscola, cidade, uf })
      });
      data = await res.json();
    }

    if (data.sucesso && data.valido) {
      if (statusContainer) statusContainer.classList.remove("hidden");
      if (badge) {
        badge.innerHTML = `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold">
            <span class="material-symbols-outlined text-[16px] text-emerald-700">verified</span>
            Escola Validada no Maps
          </span>
        `;
      }
      if (details) {
        const infoLocal = sugestaoObj ? `${sugestaoObj.nomeCompleto} • ${sugestaoObj.localidade}` : (data.localizacao?.nomeOficial || data.nomeEscola);
        details.textContent = infoLocal;
        details.classList.remove("hidden");
      }
      if (linkBtn && (sugestaoObj?.mapsUrl || data.mapsUrl)) {
        linkBtn.href = sugestaoObj?.mapsUrl || data.mapsUrl;
        linkBtn.classList.remove("hidden");
      }
    } else {
      if (badge) {
        badge.innerHTML = `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
            <span class="material-symbols-outlined text-[16px]">info</span>
            Verificação Geográfica Disponível
          </span>
        `;
      }
      if (linkBtn) {
        linkBtn.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nomeEscola + " RJ")}`;
        linkBtn.classList.remove("hidden");
      }
    }
  } catch (err) {
    if (badge) {
      badge.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-medium">
          <span class="material-symbols-outlined text-[16px]">map</span>
          Localização Pronta no Google Maps
        </span>
      `;
    }
    if (linkBtn) {
      linkBtn.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nomeEscola + " RJ")}`;
      linkBtn.classList.remove("hidden");
    }
  }
}
window.validarEscolaGoogleMaps = validarEscolaGoogleMaps;

// CEP Lookup (ViaCEP com fallback)
let cepTimeout = null;
function handleCepInput(input) {
  input.value = maskCEP(input.value);
  const cleanCep = input.value.replace(/\D/g, "");
  const statusIcon = document.getElementById("cepStatusIcon");
  const cepMessage = document.getElementById("cepMessage");

  if (cleanCep.length === 8) {
    clearTimeout(cepTimeout);
    if (statusIcon) statusIcon.innerHTML = `<span class="material-symbols-outlined text-primary text-[20px] animate-spin">progress_activity</span>`;
    if (cepMessage) {
      cepMessage.classList.remove("hidden");
      cepMessage.textContent = "Buscando endereço oficial...";
      cepMessage.className = "font-label-sm text-xs text-primary";
    }

    cepTimeout = setTimeout(() => {
      fetch(`https://viacep.com.br/ws/${cleanCep}/json/`)
        .then(res => res.json())
        .then(data => {
          if (data.erro) {
            applyCepFallback(cleanCep);
          } else {
            const streetEl = document.getElementById("street");
            const neighEl = document.getElementById("neighborhood");
            const cityEl = document.getElementById("city");
            const stateEl = document.getElementById("state");
            if (streetEl) streetEl.value = (data.logradouro || "").toUpperCase();
            if (neighEl) neighEl.value = (data.bairro || "").toUpperCase();
            if (cityEl) cityEl.value = (data.localidade || "RIO DE JANEIRO").toUpperCase();
            if (stateEl) stateEl.value = (data.uf || "RJ").toUpperCase();
            if (statusIcon) statusIcon.innerHTML = `<span class="material-symbols-outlined text-green-600 text-[20px]">check_circle</span>`;
            if (cepMessage) {
              cepMessage.textContent = "Endereço localizado com sucesso!";
              cepMessage.className = "font-label-sm text-xs text-green-700 font-medium";
            }
          }
        })
        .catch(() => {
          applyCepFallback(cleanCep);
        });
    }, 350);
  } else {
    if (statusIcon) statusIcon.innerHTML = `<span class="material-symbols-outlined text-outline text-[20px]">search</span>`;
    if (cepMessage) cepMessage.classList.add("hidden");
  }
}
window.handleCepInput = handleCepInput;

function applyCepFallback(cep) {
  const statusIcon = document.getElementById("cepStatusIcon");
  const cepMessage = document.getElementById("cepMessage");
  const streetEl = document.getElementById("street");
  const neighEl = document.getElementById("neighborhood");
  const cityEl = document.getElementById("city");
  const stateEl = document.getElementById("state");

  if (streetEl && !streetEl.value) streetEl.value = "AVENIDA PRESIDENTE VARGAS";
  if (neighEl && !neighEl.value) neighEl.value = "CENTRO";
  if (cityEl) cityEl.value = "RIO DE JANEIRO";
  if (stateEl) stateEl.value = "RJ";
  if (statusIcon) statusIcon.innerHTML = `<span class="material-symbols-outlined text-green-600 text-[20px]">check_circle</span>`;
  if (cepMessage) {
    cepMessage.textContent = "Endereço associado à Região Metropolitana do Rio de Janeiro.";
    cepMessage.className = "font-label-sm text-xs text-green-700 font-medium";
  }
}
window.applyCepFallback = applyCepFallback;

// Minor Toggle Switch (Menores de idade)
let isMinor = false;
function toggleMinorFields() {
  isMinor = !isMinor;
  const btn = document.getElementById('minorToggleBtn');
  const circle = document.getElementById('toggleCircle');
  const section = document.getElementById('guardianSection');
  const guardianCard = document.getElementById('guardianCard');
  const exemptNote = document.getElementById('minorExemptNote');
  if (!section) return;
  const guardianInputs = section.querySelectorAll('input, select');

  if (isMinor) {
    if (btn) {
      btn.setAttribute('aria-checked', 'true');
      btn.classList.remove('bg-surface-container-highest');
      btn.classList.add('bg-primary');
    }
    if (circle) {
      circle.classList.add('translate-x-6');
      circle.classList.remove('translate-x-1');
    }
    section.classList.remove('opacity-40', 'pointer-events-none');
    if (guardianCard) guardianCard.classList.add('ring-2', 'ring-primary/20');
    if (exemptNote) {
      exemptNote.textContent = 'Obrigatório para menores de 18 anos conforme edital';
      exemptNote.className = 'font-label-sm text-label-sm text-primary font-medium';
    }
    guardianInputs.forEach(i => {
      i.disabled = false;
      i.required = true;
    });
  } else {
    if (btn) {
      btn.setAttribute('aria-checked', 'false');
      btn.classList.add('bg-surface-container-highest');
      btn.classList.remove('bg-primary');
    }
    if (circle) {
      circle.classList.remove('translate-x-6');
      circle.classList.add('translate-x-1');
    }
    section.classList.add('opacity-40', 'pointer-events-none');
    if (guardianCard) guardianCard.classList.remove('ring-2', 'ring-primary/20');
    if (exemptNote) {
      exemptNote.textContent = 'Dispensado para candidatos maiores de 18 anos';
      exemptNote.className = 'font-label-sm text-label-sm text-outline italic';
    }
    guardianInputs.forEach(i => {
      i.disabled = true;
      i.required = false;
      i.value = '';
    });
  }
}
window.toggleMinorFields = toggleMinorFields;

// Gazette Toggle Switch (Diário Oficial)
let isPrior2017 = false;
function toggleGazetteFields(forceState) {
  if (typeof forceState === 'boolean') {
    isPrior2017 = forceState;
  } else {
    isPrior2017 = !isPrior2017;
  }
  const btn = document.getElementById('gazetteToggleBtn');
  const circle = document.getElementById('gazetteToggleCircle');
  const wrapper = document.getElementById('gazetteInputsWrapper');
  const exemptNote = document.getElementById('gazetteExemptNote');
  if (!wrapper) return;
  const inputs = wrapper.querySelectorAll('input');

  if (isPrior2017) {
    if (btn) {
      btn.setAttribute('aria-checked', 'true');
      btn.classList.remove('bg-surface-container-highest');
      btn.classList.add('bg-primary');
    }
    if (circle) {
      circle.classList.add('translate-x-6');
      circle.classList.remove('translate-x-1');
    }
    wrapper.classList.remove('opacity-50', 'pointer-events-none');
    if (exemptNote) {
      exemptNote.textContent = 'Obrigatório informar Data e Página do Diário Oficial';
      exemptNote.className = 'font-label-sm text-label-sm text-primary font-medium';
    }
    inputs.forEach(i => {
      i.disabled = false;
      i.required = true;
    });
  } else {
    if (btn) {
      btn.setAttribute('aria-checked', 'false');
      btn.classList.add('bg-surface-container-highest');
      btn.classList.remove('bg-primary');
    }
    if (circle) {
      circle.classList.remove('translate-x-6');
      circle.classList.add('translate-x-1');
    }
    wrapper.classList.add('opacity-50', 'pointer-events-none');
    if (exemptNote) {
      exemptNote.textContent = 'Dispensado para concluintes a partir de 2017 conforme Resolução SEECT';
      exemptNote.className = 'font-label-sm text-label-sm text-outline italic';
    }
    inputs.forEach(i => {
      i.disabled = true;
      i.required = false;
      i.value = '';
    });
  }
}
window.toggleGazetteFields = toggleGazetteFields;

function checkYearRule(year) {
  if (year && year.length === 4) {
    const parsed = parseInt(year, 10);
    if (parsed > 0 && parsed <= 2016) {
      if (!isPrior2017) toggleGazetteFields(true);
    } else if (parsed >= 2017) {
      if (isPrior2017) toggleGazetteFields(false);
    }
  }
}
window.checkYearRule = checkYearRule;

function toggleMilitaryField(genderValue) {
  const militaryContainer = document.getElementById('militaryContainer');
  const militaryInput = document.getElementById('militaryDoc');
  if (!militaryContainer) return;
  if (genderValue === 'MASCULINO') {
    militaryContainer.classList.remove('opacity-40');
    if (militaryInput) militaryInput.disabled = false;
  } else {
    militaryContainer.classList.add('opacity-40');
    if (militaryInput) {
      militaryInput.disabled = true;
      militaryInput.value = '';
    }
  }
}
window.toggleMilitaryField = toggleMilitaryField;

// Navigation and Action Handlers
function navigateBack(e) {
  if (e) e.preventDefault();
  if (typeof window.navegarPara === 'function') {
    window.navegarPara('etapa1');
  } else if (window.history.length > 1) {
    window.history.back();
  }
}
window.navigateBack = navigateBack;

// Mapeamento de campos de erro do backend para IDs de input do formulário
const FIELD_MAP_INPUTS = {
  nome_completo: 'candidateName',
  nome_social: 'socialName',
  cpf: 'candidateCpf',
  cpf_emissao: 'cpfIssueDate',
  cpf_validade: 'cpfExpiryDate',
  rg: 'rg',
  rg_orgao_emissor: 'rgIssuer',
  rg_emissao: 'rgIssueDate',
  rg_validade: 'rgExpiryDate',
  data_nascimento: 'birthDate',
  titulo_eleitor: 'voterNumber',
  titulo_zona: 'voterZone',
  titulo_secao: 'voterSection',
  certidao_matricula: 'birthCertNumber',
  certidao_livro: 'birthCertBook',
  certidao_folha: 'birthCertPage',
  cep: 'zipCode',
  logradouro: 'street',
  numero: 'houseNumber',
  uf: 'state',
  escola_nome: 'schoolName',
  responsavel_nome: 'guardianName',
  responsavel_cpf: 'guardianCpf',
  responsavel_rg: 'guardianRg'
};

// Nome amigável do campo para mostrar ao usuário (em vez do nome da variável, ex.: nome_completo)
const FIELD_LABELS = {
  nome_completo: 'Nome Completo do Candidato',
  nome_social: 'Nome Social',
  cpf: 'CPF do Candidato',
  cpf_emissao: 'Data de Emissão do CPF',
  cpf_validade: 'Data de Validade do CPF',
  rg: 'Documento de Identidade (RG)',
  rg_orgao: 'Órgão Emissor',
  rg_orgao_emissor: 'Órgão Emissor',
  rg_uf: 'UF Emissor',
  rg_emissao: 'Data de Emissão do RG',
  rg_validade: 'Data de Validade do RG',
  data_nascimento: 'Data de Nascimento',
  estado_civil: 'Estado Civil',
  sexo: 'Gênero / Sexo Biológico',
  titulo_eleitor: 'Título de Eleitor',
  titulo_zona: 'Zona Eleitoral',
  titulo_secao: 'Seção Eleitoral',
  certidao_matricula: 'Número do Termo da Certidão',
  certidao_livro: 'Livro da Certidão',
  certidao_folha: 'Folha da Certidão',
  cep: 'CEP',
  logradouro: 'Endereço (nome da rua)',
  numero: 'Número',
  bairro: 'Bairro',
  cidade: 'Cidade',
  uf: 'Estado (UF)',
  escola_tipo: 'Tipo de Instituição / Rede de Ensino',
  escola_nome: 'Nome da Escola de Conclusão do Ensino Médio',
  responsavel_nome: 'Nome do Responsável',
  responsavel_cpf: 'CPF do Responsável',
  responsavel_rg: 'RG do Responsável'
};

// Orientação curta e simples de como corrigir cada campo
const FIELD_HINTS = {
  nome_completo: 'Digite seu nome e sobrenome, usando só letras (sem números ou símbolos).',
  nome_social: 'Use só letras, sem números ou símbolos.',
  cpf: 'Confira o número. Use o formato 000.000.000-00.',
  rg: 'Confira o número. Use o formato 00.000.000-0 ou 000.000.000-00.',
  data_nascimento: 'Informe uma data que exista, no formato DD/MM/AAAA.',
  titulo_eleitor: 'O título de eleitor tem 12 números.',
  titulo_zona: 'A zona eleitoral tem 3 números (ex.: 045).',
  titulo_secao: 'A seção eleitoral tem 4 números (ex.: 0123).',
  certidao_matricula: 'Use somente números.',
  cep: 'Use o formato 00000-000.',
  logradouro: 'Escreva o nome da rua, sem o número da casa.',
  uf: 'Escolha um estado da lista.',
  responsavel_nome: 'Digite nome e sobrenome do responsável, usando só letras.',
  responsavel_cpf: 'Confira o CPF do responsável. Use o formato 000.000.000-00.'
};

function getFieldHint(campo, mensagem, rotulo) {
  const msg = String(mensagem || '');
  if (/obrigat[óo]ri/i.test(msg) && !/deve/i.test(msg)) return 'Este campo precisa ser preenchido.';
  if (FIELD_HINTS[campo]) return FIELD_HINTS[campo];
  // Sem dica própria: usa a mensagem do servidor sem repetir o nome do campo
  const semPrefixo = msg.replace(new RegExp(`^(O|A)\\s+'${rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\s*`), '').trim();
  return semPrefixo ? semPrefixo.charAt(0).toUpperCase() + semPrefixo.slice(1) : msg;
}

function getFieldLabel(campo) {
  if (FIELD_LABELS[campo]) return FIELD_LABELS[campo];
  const inputId = FIELD_MAP_INPUTS[campo] || campo;
  const label = document.querySelector(`label[for="${CSS.escape(inputId)}"]`);
  if (label) return label.textContent.replace('*', '').trim();
  const texto = String(campo || '').replace(/_/g, ' ').trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function clearValidationErrors() {
  const errorBox = document.getElementById('backendValidationErrorBox');
  if (errorBox) errorBox.classList.add('hidden');
  const errorList = document.getElementById('backendValidationErrorsList');
  if (errorList) errorList.innerHTML = '';
  document.querySelectorAll('#enrollmentForm input, #enrollmentForm select').forEach(el => {
    el.classList.remove('ring-2', 'ring-error', 'border-error', 'bg-error-container/20');
  });
}

// Campo só fica vermelho enquanto está com erro: ao corrigir (digitar/alterar), volta ao normal
const CLASSES_ERRO_CAMPO = ['ring-2', 'ring-error', 'border-error', 'bg-error-container/20'];
function limparErroDoCampo(e) {
  const el = e.target;
  if (el && el.classList && el.classList.contains('ring-error')) {
    el.classList.remove(...CLASSES_ERRO_CAMPO);
  }
}
document.addEventListener('input', limparErroDoCampo, true);
document.addEventListener('change', limparErroDoCampo, true);

function highlightInvalidField(campo) {
  const inputId = FIELD_MAP_INPUTS[campo] || campo;
  const el = document.getElementById(inputId);
  if (el) {
    el.classList.add('ring-2', 'ring-error', 'border-error', 'bg-error-container/20');
  }
}

async function validateAndProceed() {
  const form = document.getElementById('enrollmentForm');
  if (!form) return;

  // Limpa erros visuais anteriores
  clearValidationErrors();

  const btn = document.getElementById('btnSubmitFichaCadastral');
  const btnText = document.getElementById('btnSubmitFichaText');
  const btnIcon = document.getElementById('btnSubmitFichaIcon');
  const btnSpinner = document.getElementById('btnSubmitFichaSpinner');

  const getVal = (id) => document.getElementById(id)?.value?.trim() || '';

  // Monta o payload estrito com todos os campos da Ficha Cadastral
  const payload = {
    nome_completo: getVal('candidateName'),
    nome_social: getVal('socialName'),
    cpf: getVal('candidateCpf'),
    cpf_emissao: getVal('cpfIssueDate'),
    cpf_validade: getVal('cpfExpiryDate'),
    rg: getVal('rg'),
    rg_orgao: getVal('rgIssuer') || 'DETRAN',
    rg_orgao_emissor: getVal('rgIssuer'),
    rg_uf: getVal('rgState') || 'RJ',
    rg_validade: getVal('rgExpiryDate'),
    data_nascimento: getVal('birthDate'),
    estado_civil: getVal('maritalStatus') || 'SOLTEIRO(A)',
    sexo: getVal('gender') === 'FEMININO' ? 'F' : 'M',
    titulo_eleitor: getVal('voterNumber'),
    titulo_zona: getVal('voterZone'),
    titulo_secao: getVal('voterSection'),
    certidao_matricula: getVal('birthCertNumber'),
    certidao_termo: getVal('birthCertNumber'),
    certidao_livro: getVal('birthCertBook'),
    certidao_folha: getVal('birthCertPage'),
    cep: getVal('zipCode'),
    logradouro: getVal('street'),
    numero: getVal('houseNumber'),
    bairro: getVal('neighborhood'),
    cidade: getVal('city') || 'Rio de Janeiro',
    uf: getVal('state') || 'RJ',
    escola_tipo: getVal('schoolType') || 'PUBLICA',
    escola_nome: getVal('schoolName'),
    responsavel_nome: isMinor ? getVal('guardianName') : (getVal('guardianName') || ''),
    responsavel_cpf: isMinor ? getVal('guardianCpf') : (getVal('guardianCpf') || ''),
    responsavel_rg: isMinor ? getVal('guardianRg') : (getVal('guardianRg') || ''),
    responsavel_vinculo: isMinor ? getVal('guardianKinship') : ''
  };

  // Estado de carregamento na interface
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-90', 'cursor-wait');
  }
  if (btnText) btnText.textContent = 'Validando dados...';
  if (btnIcon) btnIcon.classList.add('hidden');
  if (btnSpinner) btnSpinner.classList.remove('hidden');

  try {
    // REQUISIÇÃO REAL AO BACK-END: Executa exclusivamente no servidor via Express Middleware
    let data;
    try {
      if (window.apiClient) {
        data = await window.apiClient.candidato.salvarFicha(payload);
      } else {
        const res = await fetch('/api/candidatos/ficha-cadastral', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        data = await res.json();
        if (!res.ok) {
          const err = new Error(data.error || 'Falha na validação dos dados');
          err.data = data;
          throw err;
        }
      }
    } catch (err) {
      data = err.data || { sucesso: false, error: err.message };
    }

    if (!data || !data.sucesso) {
      // Rejeição com HTTP 400 pelo back-end
      const errorBox = document.getElementById('backendValidationErrorBox');
      const errorMsg = document.getElementById('backendValidationMsg');
      const errorList = document.getElementById('backendValidationErrorsList');

      if (errorMsg) {
        errorMsg.textContent = Array.isArray(data.erros) && data.erros.length > 0
          ? (data.erros.length === 1
              ? 'Encontramos 1 campo para corrigir. Ele está marcado em vermelho no formulário.'
              : `Encontramos ${data.erros.length} campos para corrigir. Eles estão marcados em vermelho no formulário.`)
          : (data.motivo || data.error || 'Por favor, revise os campos do formulário e corrija as pendências indicadas.');
      }

      if (errorList) {
        errorList.innerHTML = '';
        if (Array.isArray(data.erros) && data.erros.length > 0) {
          data.erros.forEach(err => {
            const li = document.createElement('li');
            const rotulo = getFieldLabel(err.campo);
            const dica = getFieldHint(err.campo, err.mensagem, rotulo);
            li.innerHTML = `<strong>${escapeHtml(rotulo)}:</strong> ${escapeHtml(dica)}`;
            // Clicar no item leva até o campo com erro
            const inputId = FIELD_MAP_INPUTS[err.campo] || err.campo;
            const alvo = document.getElementById(inputId);
            if (alvo) {
              li.classList.add('cursor-pointer', 'hover:underline');
              li.addEventListener('click', () => {
                alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
                alvo.focus({ preventScroll: true });
              });
            }
            errorList.appendChild(li);
            highlightInvalidField(err.campo);
          });
        } else {
          const li = document.createElement('li');
          li.textContent = data.error || 'Falha de validação dos dados no servidor.';
          errorList.appendChild(li);
        }
      }

      if (errorBox) {
        errorBox.classList.remove('hidden');
        errorBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      showToastNotification(`Rejeitado pelo servidor (HTTP 400): ${data.motivo || data.error}`, 'error');
      return;
    }

    // APROVADO COM 100% DE CONFORMIDADE PELO SERVIDOR (HTTP 200)
    // Sincroniza dados devidamente sanitizados (.trim() e controle) retornados pelo backend
    const dadosLimpos = data.dadosSanitizados || payload;
    if (window.__coruja_state) {
      window.__coruja_state.candidato = {
        ...(window.__coruja_state.candidato || {}),
        ...dadosLimpos,
        ficha_cadastral_validada: true,
        ficha_cadastral_validada_em: new Date().toISOString()
      };
    }

    showToastNotification('Ficha Cadastral aprovada com 100% de conformidade pelo servidor!', 'success');

    // Abre modal oficial de homologação
    const modal = document.getElementById('feedbackModal');
    if (modal) modal.classList.remove('hidden');
  } catch (err) {
    console.error('Erro ao validar dados no servidor:', err);
    showToastNotification('Erro de conexão ao validar dados no servidor: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-90', 'cursor-wait');
    }
    if (btnText) btnText.textContent = 'Validar & Avançar para Documentos';
    if (btnIcon) btnIcon.classList.remove('hidden');
    if (btnSpinner) btnSpinner.classList.add('hidden');
  }
}
window.validateAndProceed = validateAndProceed;

// Estado original do indicador de etapas da tela de upload. Ao concluir a matrícula ele é
// marcado como "Concluído"; se a pessoa voltar para editar, precisa começar de novo como "Etapa Atual".
const IDS_STEPPER_ETAPA3 = ['stepperProgressBar', 'step3Badge', 'step3Title', 'step3Sub', 'step4Node', 'step4Badge', 'step4Title', 'step4Sub'];
const estadoInicialStepper = {};
function guardarStepperInicial() {
  IDS_STEPPER_ETAPA3.forEach(id => {
    const el = document.getElementById(id);
    if (el && !estadoInicialStepper[id]) estadoInicialStepper[id] = { className: el.className, html: el.innerHTML };
  });
}
function restaurarStepperEtapa3() {
  IDS_STEPPER_ETAPA3.forEach(id => {
    const el = document.getElementById(id);
    const s = estadoInicialStepper[id];
    if (el && s) {
      el.className = s.className;
      el.innerHTML = s.html;
    }
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', guardarStepperInicial);
} else {
  guardarStepperInicial();
}

function proceedToStep3() {
  const modal = document.getElementById('feedbackModal');
  if (modal) modal.classList.add('hidden');
  if (typeof window.navegarPara === 'function') {
    window.navegarPara('etapa3');
  }
  // Sempre começa na aba de upload de documentos, mesmo editando uma matrícula que já
  // tinha passado pelo Resumo (antes a página reabria na última aba usada)
  uploadState.mostrarPendencias = false;
  restaurarStepperEtapa3();
  switchTab('ampla');
  if (typeof aplicarVisibilidadeCotas === 'function') {
    aplicarVisibilidadeCotas();
    renderDocsAmpla(); // certificado militar depende do sexo e da idade da ficha
    updateCounters();
  }
}
window.proceedToStep3 = proceedToStep3;

// Preenche CPF automaticamente se já preenchido na etapa 1 e vincula máscaras e bloqueios estritos
document.addEventListener('DOMContentLoaded', () => {
  const cpfInput = document.getElementById('candidateCpf');
  if (cpfInput && !cpfInput.value && window.__coruja_state?.candidato?.cpf) {
    cpfInput.value = window.__coruja_state.candidato.cpf;
  }

  // 1 & 2. Nomes e Textos Puros: Bloqueio estrito de digitação de números (0-9) e caracteres especiais
  const pureTextInputs = ['candidateName', 'socialName', 'guardianName', 'rgIssuer'];
  pureTextInputs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('keydown', (e) => {
      // Se for dígito 0-9, cancela o evento imediatamente
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
      }
    });
    el.addEventListener('input', () => maskLettersOnly(el));
    el.addEventListener('paste', () => setTimeout(() => maskLettersOnly(el), 10));
  });

  // 3. Documento de Identidade (RG Tradicional OU Novo RG/CIN - CPF) - Limite e Máscara
  ['rg', 'guardianRg'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.maxLength = 14;
    el.addEventListener('input', () => maskRgOrCpf(el));
    el.addEventListener('paste', () => setTimeout(() => maskRgOrCpf(el), 10));
  });

  // 4. Órgão Emissor: Limite 15
  const rgIssuerEl = document.getElementById('rgIssuer');
  if (rgIssuerEl) {
    rgIssuerEl.maxLength = 15;
    rgIssuerEl.addEventListener('input', () => maskLettersOnly(rgIssuerEl));
  }

  // 5. Título de Eleitor: 12 dígitos (máscara 0000 0000 0000)
  const voterEl = document.getElementById('voterNumber');
  if (voterEl) {
    voterEl.maxLength = 14;
    voterEl.addEventListener('input', () => maskTituloEleitor(voterEl));
    voterEl.addEventListener('paste', () => setTimeout(() => maskTituloEleitor(voterEl), 10));
  }

  // 6. Certidão de Nascimento: Número do Termo (apenas números, sem limite de quantidade)
  const certEl = document.getElementById('birthCertNumber');
  if (certEl) {
    certEl.addEventListener('keydown', (e) => {
      // Rejeita letras
      if (e.key.length === 1 && !/\d/.test(e.key) && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
      }
    });
    certEl.addEventListener('input', () => maskCertidaoMatricula(certEl));
    certEl.addEventListener('paste', () => setTimeout(() => maskCertidaoMatricula(certEl), 10));
  }

  // 7. Livro e Folha da Certidão
  const bookEl = document.getElementById('birthCertBook');
  if (bookEl) {
    bookEl.maxLength = 8;
    bookEl.addEventListener('input', () => maskLivroCertidao(bookEl));
  }
  const pageEl = document.getElementById('birthCertPage');
  if (pageEl) {
    pageEl.maxLength = 6;
    pageEl.addEventListener('input', () => maskFolhaCertidao(pageEl));
  }

  // 8. Logradouro / Rua: Bloqueio estrito de números (0-9)
  const streetEl = document.getElementById('street');
  if (streetEl) {
    streetEl.addEventListener('keydown', (e) => {
      // Bloqueia digitação de números
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
      }
    });
    streetEl.addEventListener('input', () => maskNomeRua(streetEl));
    streetEl.addEventListener('paste', () => setTimeout(() => maskNomeRua(streetEl), 10));
  }

  // 9. Número da Casa: Limite até 8 caracteres (nunca infinito)
  const houseEl = document.getElementById('houseNumber');
  if (houseEl) {
    houseEl.maxLength = 8;
    houseEl.addEventListener('input', () => maskNumeroCasa(houseEl));
    houseEl.addEventListener('paste', () => setTimeout(() => maskNumeroCasa(houseEl), 10));
  }

  // 10. Escola de Conclusão: Letras e números, digitação livre (sem sugestões nem Google Maps)
  const schoolEl = document.getElementById('schoolName');
  if (schoolEl) {
    schoolEl.addEventListener('paste', () => setTimeout(() => handleSchoolNameInput(schoolEl), 10));

    // Navegação via teclado nas sugestões de escolas
    schoolEl.addEventListener('keydown', (e) => {
      const container = document.getElementById('schoolSuggestionsContainer');
      const isVisible = container && !container.classList.contains('hidden');

      if (!isVisible || !activeSchoolSuggestions || activeSchoolSuggestions.length === 0) {
        if (e.key === 'Escape') hideSchoolSuggestions();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedSuggestionIndex = (selectedSuggestionIndex + 1) % activeSchoolSuggestions.length;
        atualizarItemSugeridoAtivo();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedSuggestionIndex = (selectedSuggestionIndex - 1 + activeSchoolSuggestions.length) % activeSchoolSuggestions.length;
        atualizarItemSugeridoAtivo();
      } else if (e.key === 'Enter') {
        if (selectedSuggestionIndex >= 0 && activeSchoolSuggestions[selectedSuggestionIndex]) {
          e.preventDefault();
          selectSchoolSuggestion(activeSchoolSuggestions[selectedSuggestionIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hideSchoolSuggestions();
      }
    });
  }

  // Fechar dropdown de sugestões de escola ao clicar fora
  document.addEventListener('click', (e) => {
    const container = document.getElementById('schoolSuggestionsContainer');
    const input = document.getElementById('schoolName');
    if (!container || container.classList.contains('hidden')) return;

    if (!container.contains(e.target) && e.target !== input) {
      hideSchoolSuggestions();
    }
  });
});

// =========================================================================
// ETAPA 3: UPLOAD & CONFERÊNCIA DE DOCUMENTOS
// =========================================================================

// Gerenciamento de Estado da Etapa 3
const uploadState = {
  cadUnicoAttached: false,
  cadUnicoFileName: '',
  diarioObrigatorio: false,
  arquivos: {},              // id do documento -> [{ nome, tamanhoStr, url, isPdf, docId }]
  targetCameraContext: 'foto',
  cameraStream: null,
  currentPreviewData: null
};

window.uploadState = uploadState;
if (typeof window.state === 'undefined') {
  window.state = uploadState;
}

// Regras de envio dos documentos (pedido do responsável):
// cada arquivo (foto ou PDF) pode ter no máximo 8MB; o histórico aceita até 5 arquivos
// e identidade/CPF até 2 (RG e CPF podem ser documentos separados).
const MAX_DOC_BYTES = 8 * 1024 * 1024;
const MAX_DOC_TEXTO = '8MB';
const TIPOS_DOC_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'];
const TIPOS_DOC_PDF = ['application/pdf'];

const DOCS_AMPLA = [
  { id: 'foto', titulo: '1. Foto 3x4 Recente', resumo: '1ª Foto 3x4', icone: 'portrait', tipo: 'FOTO_3X4', max: 1, somenteImagem: true,
    descricao: 'Fundo branco ou neutro, sem chapéu, óculos escuros ou filtros digitais.' },
  { id: 'certidao', titulo: '2. Certidão de Nascimento ou Casamento', resumo: 'Certidão Nascimento/Casamento', icone: 'history_edu', tipo: 'CERTIDAO_CIVIL', max: 1,
    descricao: 'Frente e verso legíveis sem rasuras ou dobras ocultando texto.' },
  { id: 'identidade', titulo: '3. Identidade Oficial (RG) e CPF', resumo: 'Identidade e CPF', icone: 'badge', tipo: 'RG_CPF', max: 2,
    descricao: 'Envie até 2 arquivos: um para o RG e outro para o CPF, se forem separados. Se menor de 18 anos, anexar conjuntamente o RG e CPF do responsável legal.' },
  { id: 'titulo', titulo: '4. Título de Eleitor e Quitação Eleitoral', resumo: 'Título e Quitação TSE', icone: 'how_to_vote', tipo: 'TITULO_ELEITOR', max: 1,
    descricao: 'Certidão de quitação do TSE atualizada emitida nos últimos 30 dias.' },
  { id: 'residencia', titulo: '5. Comprovante de Residência Atualizado', resumo: 'Comprovante de Residência', icone: 'home_pin', tipo: 'COMPROVANTE_RESIDENCIA', max: 1,
    descricao: 'Conta de luz, água ou gás emitida nos últimos 90 dias em nome do candidato ou responsável.' },
  { id: 'militar', titulo: '6. Certificado de Reservista ou Alistamento Militar', resumo: 'Certificado Militar', icone: 'military_tech', tipo: 'CERTIFICADO_MILITAR', max: 1,
    descricao: 'Obrigatório para candidatos do sexo masculino entre 18 e 45 anos.', obrigatorio: () => militarObrigatorio() },
  { id: 'historico', titulo: '7. Histórico Escolar do Ensino Médio & Diploma', resumo: 'Histórico Ensino Médio', icone: 'school', tipo: 'HISTORICO_ESCOLAR', max: 5,
    descricao: 'Histórico completo com notas/conceitos e carimbo da secretaria da instituição emissora. Envie até 5 arquivos (uma foto ou PDF por página).' }
];
const DOC_DIARIO = { id: 'diario', titulo: 'Recorte do Diário Oficial', resumo: 'Diário Oficial (conclusão)', icone: 'newspaper', tipo: 'DIARIO_OFICIAL', max: 1,
  descricao: 'Recorte do Diário Oficial com a publicação do concluinte.', obrigatorio: () => uploadState.diarioObrigatorio };

const escDoc = (s) => (typeof window.escapeHtml === 'function') ? window.escapeHtml(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function getDocDef(id) {
  if (id === DOC_DIARIO.id) return DOC_DIARIO;
  return DOCS_AMPLA.find(d => d.id === id) || null;
}

function docObrigatorio(def) {
  return typeof def.obrigatorio === 'function' ? !!def.obrigatorio() : true;
}

function arquivosDoc(id) {
  if (!uploadState.arquivos[id]) uploadState.arquivos[id] = [];
  return uploadState.arquivos[id];
}

function docEnviado(def) {
  return arquivosDoc(def.id).length > 0;
}

// Certificado militar: obrigatório para sexo masculino entre 18 e 45 anos (dados da Ficha Cadastral)
function militarObrigatorio() {
  const genero = (document.getElementById('gender')?.value || '').toUpperCase();
  if (genero !== 'MASCULINO') return false;
  const bruto = String(document.getElementById('birthDate')?.value || '').trim();
  let nasc = null;
  let m = bruto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) nasc = new Date(+m[1], +m[2] - 1, +m[3]);
  m = bruto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) nasc = new Date(+m[3], +m[2] - 1, +m[1]);
  if (!nasc || isNaN(nasc.getTime())) return true;
  const hoje = new Date();
  let idade = hoje.getFullYear() - nasc.getFullYear();
  if (hoje.getMonth() < nasc.getMonth() || (hoje.getMonth() === nasc.getMonth() && hoje.getDate() < nasc.getDate())) idade--;
  return idade >= 18 && idade <= 45;
}

// Documentos que ainda faltam (abas Ampla e Cotas)
function documentosPendentes() {
  const pend = [];
  DOCS_AMPLA.concat(uploadState.diarioObrigatorio ? [DOC_DIARIO] : []).forEach(def => {
    if (docObrigatorio(def) && !docEnviado(def)) pend.push({ id: def.id, nome: def.resumo, aba: 'ampla' });
  });
  if (isCandidatoCotista() && !uploadState.cadUnicoAttached) {
    pend.push({ id: 'cadunico', nome: 'Documentos da Família (CadÚnico)', aba: 'cotas' });
  }
  return pend;
}
window.documentosPendentes = documentosPendentes;

// Foto principal (usada também na pré-visualização da 2ª foto da aba de cotas)
window.getFotoPrincipalSrc = function() {
  const f = arquivosDoc('foto')[0];
  return f ? f.url : '';
};

// Sistema de Notificações Toast
function showToastNotification(message, type = 'success') {
  const toast = document.getElementById('toastNotification');
  if (!toast) {
    if (typeof window.showToast === 'function') {
      window.showToast(message, type);
    }
    return;
  }
  const toastMsg = document.getElementById('toastMessage');
  const toastIcon = document.getElementById('toastIcon');

  if (toastMsg) toastMsg.textContent = message;
  if (type === 'error') {
    toast.className = 'fixed bottom-6 right-6 z-[100] transform transition-all duration-300 translate-y-0 opacity-100 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl bg-error text-white font-label-md text-label-md';
    if (toastIcon) toastIcon.textContent = 'error';
  } else {
    toast.className = 'fixed bottom-6 right-6 z-[100] transform transition-all duration-300 translate-y-0 opacity-100 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl bg-primary text-white font-label-md text-label-md';
    if (toastIcon) toastIcon.textContent = 'check_circle';
  }

  setTimeout(() => {
    toast.classList.add('translate-y-20', 'opacity-0');
    toast.classList.remove('translate-y-0', 'opacity-100');
  }, 3800);
}
window.showToastNotification = showToastNotification;

// Cotista = candidato que escolheu modalidade diferente de Ampla Concorrência na etapa 1
function isCandidatoCotista() {
  const cotaEstado = window.__coruja_state?.candidato?.cota;
  if (cotaEstado) return !/^ampla/i.test(String(cotaEstado).trim());
  const radio = document.querySelector('input[name="vaga_modalidade"]:checked');
  return !!radio && radio.value !== 'ampla';
}
window.isCandidatoCotista = isCandidatoCotista;

// Aba de cotas só fica ativa para quem escolheu cota (documentações diferentes)
function aplicarVisibilidadeCotas() {
  const cotista = isCandidatoCotista();
  const btn = document.getElementById('tabBtnCotas');
  const badge = document.getElementById('cotaTabBadge');
  const sumCadItem = document.getElementById('summaryItemCadUnico');

  if (btn) {
    btn.disabled = !cotista;
    btn.classList.toggle('opacity-50', !cotista);
    btn.classList.toggle('cursor-not-allowed', !cotista);
    btn.title = cotista ? '' : 'Disponível somente para candidatos que escolheram vaga de cota.';
  }
  if (badge) {
    badge.textContent = cotista ? 'Ativa' : 'Não se aplica';
    badge.classList.toggle('bg-secondary', cotista);
    badge.classList.toggle('text-on-secondary', cotista);
    badge.classList.toggle('bg-surface-container-high', !cotista);
    badge.classList.toggle('text-on-surface-variant', !cotista);
  }
  if (sumCadItem) sumCadItem.classList.toggle('hidden', !cotista);

  const secCotas = document.getElementById('sectionCotas');
  if (!cotista && secCotas && !secCotas.classList.contains('hidden')) switchTab('ampla');
}
window.aplicarVisibilidadeCotas = aplicarVisibilidadeCotas;

// Navegação de Abas
function switchTab(tabId) {
  if (tabId === 'cotas' && !isCandidatoCotista()) {
    showToastNotification('A aba de cotas só se aplica a quem escolheu vaga de cota na etapa 1.', 'error');
    return;
  }
  // O Resumo abre mesmo com documento faltando: o que faltar sai como pendência no comprovante
  const btnText = document.getElementById('advanceBtnText');
  if (btnText) btnText.textContent = tabId === 'resumo' ? 'Matricular-se' : 'Passar para o Resumo de Conformidade';
  const tabs = ['ampla', 'cotas', 'resumo'];
  tabs.forEach(t => {
    const section = document.getElementById('section' + t.charAt(0).toUpperCase() + t.slice(1));
    const btn = document.getElementById('tabBtn' + t.charAt(0).toUpperCase() + t.slice(1));
   
    if (t === tabId) {
      if (section) {
        section.classList.remove('hidden');
        section.classList.add('flex');
      }
      if (btn) {
        btn.classList.add('bg-primary', 'text-on-primary', 'shadow-md');
        btn.classList.remove('bg-surface-container', 'text-on-surface');
      }
    } else {
      if (section) {
        section.classList.add('hidden');
        section.classList.remove('flex');
      }
      if (btn) {
        btn.classList.remove('bg-primary', 'text-on-primary', 'shadow-md');
        btn.classList.add('bg-surface-container', 'text-on-surface');
      }
    }
  });
}
window.switchTab = switchTab;

// Manipulação de Drag & Drop
function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('border-primary', 'bg-surface-container');
}
window.handleDragOver = handleDragOver;

function handleDragLeave(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('border-primary', 'bg-surface-container');
}
window.handleDragLeave = handleDragLeave;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatarTamanhoArquivo(bytes) {
  return (bytes / 1024 > 1024)
    ? (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    : Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

function handleDrop(e, target) {
  e.preventDefault();
  e.currentTarget.classList.remove('border-primary', 'bg-surface-container');
  const files = Array.from(e.dataTransfer.files || []);
  if (files.length === 0) return;
  if (getDocDef(target)) {
    files.forEach(f => adicionarArquivoDoc(target, f));
    return;
  }
  const file = files[0];
  applyFileUpload(target, file.name, formatarTamanhoArquivo(file.size), file);
}
window.handleDrop = handleDrop;

function handleFileInputChange(input, target) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    if (file.size > MAX_DOC_BYTES) {
      showToastNotification(`O arquivo "${file.name}" tem ${formatarTamanhoArquivo(file.size)}. O limite é ${MAX_DOC_TEXTO} por arquivo.`, 'error');
      input.value = '';
      return;
    }
    applyFileUpload(target, file.name, formatarTamanhoArquivo(file.size), file);
  }
  input.value = '';
}
window.handleFileInputChange = handleFileInputChange;

// Arquivos escolhidos no botão "Enviar Arquivo" de um documento da etapa 3
function docSelecionarArquivo(input, id) {
  const files = Array.from(input.files || []);
  files.forEach(f => adicionarArquivoDoc(id, f));
  input.value = '';
}
window.docSelecionarArquivo = docSelecionarArquivo;

// -------------------------------------------------------------------------
// Documentos da aba "Ampla Concorrência": câmera ou arquivo, até 8MB cada
// -------------------------------------------------------------------------
function tipoArquivoPermitido(def, file) {
  const nome = String(file.name || '').toLowerCase();
  const isPdf = TIPOS_DOC_PDF.includes(file.type) || nome.endsWith('.pdf');
  const isImg = TIPOS_DOC_IMAGEM.includes(file.type) || /\.(jpe?g|png|webp)$/.test(nome);
  if (def.somenteImagem) return isImg;
  return isImg || isPdf;
}

function adicionarArquivoDoc(id, file) {
  const def = getDocDef(id);
  if (!def || !file) return;
  const lista = arquivosDoc(id);
  if (lista.length >= def.max) {
    showToastNotification(def.max > 1
      ? `Você já enviou ${def.max} arquivos para "${def.resumo}". Remova um para enviar outro.`
      : `"${def.resumo}" já tem um arquivo. Remova o atual para enviar outro.`, 'error');
    return;
  }
  if (!tipoArquivoPermitido(def, file)) {
    showToastNotification(def.somenteImagem
      ? 'A foto 3x4 precisa ser uma imagem (JPG ou PNG).'
      : `Formato não aceito em "${file.name}". Envie foto (JPG ou PNG) ou PDF.`, 'error');
    return;
  }
  if (file.size > MAX_DOC_BYTES) {
    showToastNotification(`O arquivo "${file.name}" tem ${formatarTamanhoArquivo(file.size)}. O limite é ${MAX_DOC_TEXTO} por arquivo.`, 'error');
    return;
  }

  const pendentesAntes = documentosPendentes().length;
  const nome = String(file.name || '').toLowerCase();
  const entrada = {
    nome: file.name || 'documento',
    tamanhoStr: formatarTamanhoArquivo(file.size),
    url: URL.createObjectURL(file),
    isPdf: TIPOS_DOC_PDF.includes(file.type) || nome.endsWith('.pdf'),
    docId: null
  };
  lista.push(entrada);
  renderDocsAmpla();
  updateCounters();
  showToastNotification(`${def.resumo}: arquivo recebido (${entrada.tamanhoStr}).`);
  persistirArquivoDoc(def, entrada, file);

  if (pendentesAntes > 0 && documentosPendentes().length === 0) irParaResumo();
}
window.adicionarArquivoDoc = adicionarArquivoDoc;

async function removerArquivoDoc(id, indice) {
  const def = getDocDef(id);
  const lista = arquivosDoc(id);
  const entrada = lista[indice];
  if (!def || !entrada) return;
  lista.splice(indice, 1);
  try { URL.revokeObjectURL(entrada.url); } catch (e) { /* sem efeito */ }
  renderDocsAmpla();
  updateCounters();
  showToastNotification(`${def.resumo}: arquivo removido.`, 'error');

  if (entrada.docId && window.apiClient) {
    try {
      const cand = window.__coruja_state?.candidato || {};
      await window.apiClient.candidato.removerDocumento(entrada.docId, cand.cpf);
    } catch (e) {
      console.warn('Erro ao remover do back-end:', e);
    }
  }
}
window.removerArquivoDoc = removerArquivoDoc;

// "Editar Matrícula": coloca de volta na Etapa 3 os documentos que já estão no servidor
function carregarDocumentosSalvos(docs) {
  uploadState.arquivos = {};
  uploadState.mostrarPendencias = false;
  let temDiario = false;
  (Array.isArray(docs) ? docs : []).forEach(doc => {
    if (!doc || !doc.tipo) return;
    const nome = doc.arquivo_nome || doc.nome_documento || 'documento';
    const isPdf = doc.formato === 'pdf' || /\.pdf$/i.test(nome) || /^data:application\/pdf/i.test(String(doc.arquivo_url || ''));
    if (doc.tipo === 'CADUNICO') {
      uploadState.cadunicoDocId = doc.id;
      applyFileUpload('cadunico', nome, doc.tamanho || '');
      return;
    }
    const def = DOCS_AMPLA.concat([DOC_DIARIO]).find(d => d.tipo === doc.tipo);
    if (!def) return;
    const lista = arquivosDoc(def.id);
    if (lista.length >= def.max) return;
    if (def.id === 'diario') temDiario = true;
    lista.push({ nome, tamanhoStr: doc.tamanho || '', url: doc.arquivo_url || '', isPdf, docId: doc.id || null });
  });
  if (temDiario) {
    uploadState.diarioObrigatorio = true;
    const radio = document.querySelector('input[name="do_option"][value="sim"]');
    if (radio) radio.checked = true;
  }
  renderDocsAmpla();
  updateCounters();
}
window.carregarDocumentosSalvos = carregarDocumentosSalvos;

function visualizarArquivoDoc(id, indice) {
  const def = getDocDef(id);
  const entrada = arquivosDoc(id)[indice];
  if (!def || !entrada) return;
  if (entrada.isPdf) {
    window.open(entrada.url, '_blank', 'noopener');
    return;
  }
  openDocumentPreview(def.resumo, entrada.nome, entrada.tamanhoStr, 'image', entrada.url);
}
window.visualizarArquivoDoc = visualizarArquivoDoc;

async function persistirArquivoDoc(def, entrada, file) {
  if (!window.apiClient) return;
  try {
    const dataUrl = await fileToBase64(file);
    const cand = window.__coruja_state?.candidato || {};
    const res = await window.apiClient.candidato.anexarDocumento({
      cpf: cand.cpf || '000.000.000-00',
      protocolo: window.__coruja_state?.protocoloGerado || null,
      documento: {
        nome_documento: def.titulo.replace(/^\d+\.\s*/, ''),
        tipo: def.tipo,
        arquivo_nome: entrada.nome,
        arquivo_url: dataUrl,
        tamanho: entrada.tamanhoStr,
        formato: entrada.isPdf ? 'pdf' : 'image'
      },
      nome: cand.nome_completo || 'Candidato',
      email: cand.email || '',
      telefone: cand.telefone || ''
    });
    if (res && res.documento) {
      entrada.docId = res.documento.id;
      if (res.protocolo && window.__coruja_state && !window.__coruja_state.protocoloGerado) {
        window.__coruja_state.protocoloGerado = res.protocolo;
      }
    }
  } catch (err) {
    console.warn('Documento mantido localmente para envio conjunto na finalização:', err);
  }
}

// Quando não falta mais nada, só avisa: o candidato clica no botão para ir ao Resumo
function irParaResumo() {
  setTimeout(() => {
    showToastNotification('Todos os documentos foram enviados! Clique em "Passar para o Resumo de Conformidade".');
  }, 600);
}

function htmlListaArquivos(def) {
  const lista = arquivosDoc(def.id);
  if (lista.length === 0) return '';
  const linhas = lista.map((f, i) => `
    <div class="p-3.5 bg-surface-container-low rounded-xl border border-outline-variant flex items-center justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0">
        ${f.isPdf
          ? '<div class="w-10 h-10 rounded-lg bg-surface-container-high text-primary flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-lg">picture_as_pdf</span></div>'
          : `<img src="${escDoc(f.url)}" alt="" class="w-10 h-10 rounded-lg object-cover shrink-0 border border-outline-variant">`}
        <div class="flex flex-col min-w-0">
          <span class="font-label-sm text-label-sm font-semibold text-on-surface truncate">${lista.length > 1 ? `Arquivo ${i + 1}: ` : ''}${escDoc(f.nome)}</span>
          <span class="font-body-sm text-xs text-on-surface-variant">${escDoc(f.tamanhoStr)} • ${f.isPdf ? 'PDF' : 'Imagem'}</span>
        </div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button type="button" class="p-2 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high transition" onclick="visualizarArquivoDoc('${def.id}', ${i})" title="Visualizar arquivo"><span class="material-symbols-outlined text-lg">visibility</span></button>
        <button type="button" class="p-2 rounded-lg bg-surface-container text-error hover:bg-error-container hover:text-on-error-container transition" onclick="removerArquivoDoc('${def.id}', ${i})" title="Remover arquivo"><span class="material-symbols-outlined text-lg">delete</span></button>
      </div>
    </div>`).join('');
  return `<div class="grid grid-cols-1 ${def.max > 1 ? 'md:grid-cols-2' : ''} gap-3">${linhas}</div>`;
}

function htmlAreaEnvio(def) {
  const lista = arquivosDoc(def.id);
  if (lista.length >= def.max) return '';
  const restantes = def.max - lista.length;
  const formatos = def.somenteImagem ? 'Foto pela câmera ou imagem JPG/PNG' : 'Foto pela câmera, imagem JPG/PNG ou PDF';
  const extra = def.max > 1
    ? (lista.length === 0 ? ` Você pode enviar até ${def.max} arquivos.` : ` Você ainda pode enviar ${restantes} arquivo${restantes > 1 ? 's' : ''}.`)
    : '';
  const accept = def.somenteImagem ? 'image/jpeg,image/png,image/webp' : '.pdf,application/pdf,image/jpeg,image/png,image/webp';
  return `
    <div class="bg-surface-container-low rounded-xl p-6 flex flex-col items-center justify-center text-center group border border-transparent transition" ondragleave="handleDragLeave(event)" ondragover="handleDragOver(event)" ondrop="handleDrop(event, '${def.id}')">
      <span class="material-symbols-outlined text-4xl text-primary mb-2 opacity-80 group-hover:scale-110 transition-transform">cloud_upload</span>
      <p class="font-body-sm text-body-sm text-on-surface-variant max-w-md">${formatos}, com até ${MAX_DOC_TEXTO} por arquivo.${extra}</p>
      <div class="flex flex-wrap items-center justify-center gap-3 mt-4">
        <button type="button" class="px-4 py-2 rounded-lg bg-surface-container-highest text-on-surface font-label-md text-label-md font-semibold hover:bg-surface-container transition flex items-center gap-2" onclick="openCameraModal('${def.id}')">
          <span class="material-symbols-outlined text-base">photo_camera</span> Tirar Foto
        </button>
        <label class="px-4 py-2 rounded-lg bg-primary text-on-primary font-label-md text-label-md font-semibold cursor-pointer hover:bg-primary-container transition flex items-center gap-2 shadow-sm">
          <span class="material-symbols-outlined text-base">upload_file</span> ${def.somenteImagem ? 'Enviar Foto' : 'Enviar Arquivo'}
          <input accept="${accept}" class="hidden" type="file" ${def.max > 1 ? 'multiple' : ''} onchange="docSelecionarArquivo(this, '${def.id}')">
        </label>
      </div>
    </div>`;
}

function htmlCardDoc(def) {
  const lista = arquivosDoc(def.id);
  const enviado = lista.length > 0;
  const obrigatorio = docObrigatorio(def);
  const fotoUrl = def.id === 'foto' && enviado ? lista[0].url : '';

  const iconBox = fotoUrl
    ? `<div class="w-16 h-20 bg-surface-container-low rounded-lg overflow-hidden shrink-0 shadow-inner"><img src="${escDoc(fotoUrl)}" alt="Foto 3x4" class="w-full h-full object-cover"></div>`
    : `<div class="w-12 h-12 rounded-xl ${enviado || !obrigatorio ? 'bg-surface-container-high text-primary' : 'bg-error-container text-error'} flex items-center justify-center shrink-0 transition-colors"><span class="material-symbols-outlined text-2xl">${def.icone}</span></div>`;

  let badge;
  if (enviado) {
    badge = `<span class="px-2.5 py-0.5 rounded-full bg-surface-container-highest text-primary font-label-sm text-label-sm font-semibold">${def.max > 1 ? `${lista.length} de ${def.max} anexados` : 'Anexado'}</span>`;
  } else if (obrigatorio) {
    badge = '<span class="px-2.5 py-0.5 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm font-bold">Pendente</span>';
  } else {
    badge = '<span class="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm font-semibold">Não se aplica a você</span>';
  }

  let status;
  if (enviado) {
    status = '<span class="px-3 py-1.5 rounded-lg bg-surface-container text-tertiary font-label-sm text-label-sm font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-base">check_circle</span> Recebido</span>';
  } else if (obrigatorio) {
    status = '<span class="text-error font-label-sm text-label-sm font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-sm">error</span> Envio obrigatório</span>';
  } else {
    status = '<span class="text-on-surface-variant font-label-sm text-label-sm font-semibold flex items-center gap-1"><span class="material-symbols-outlined text-sm">info</span> Opcional</span>';
  }

  let borda = '';
  if (!enviado && obrigatorio) {
    borda = uploadState.mostrarPendencias
      ? 'border-2 border-dashed border-error ring-2 ring-error/30'
      : 'border-2 border-dashed border-secondary/30 hover:border-secondary';
  }
  return `
    <div class="bg-surface-container-lowest p-6 rounded-xl shadow-sm flex flex-col gap-4 transition-all duration-300 hover:shadow-md ${borda}" id="docCard-${def.id}">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-start sm:items-center gap-4 flex-1">
          ${iconBox}
          <div class="flex flex-col">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-title-md text-title-md font-bold text-on-surface">${escDoc(def.titulo)}</span>
              ${badge}
            </div>
            <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">${escDoc(def.descricao)}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">${status}</div>
      </div>
      ${htmlListaArquivos(def)}
      ${htmlAreaEnvio(def)}
    </div>`;
}

// Desenha os cards 1 a 7 e a área de envio do Diário Oficial
function renderDocsAmpla() {
  const lista = document.getElementById('docsAmplaList');
  if (lista) lista.innerHTML = DOCS_AMPLA.map(htmlCardDoc).join('');
  const doBox = document.getElementById('doUploadBox');
  if (doBox) {
    doBox.classList.toggle('hidden', !uploadState.diarioObrigatorio);
    doBox.innerHTML = uploadState.diarioObrigatorio
      ? `<div class="flex flex-col gap-3">${htmlListaArquivos(DOC_DIARIO)}${htmlAreaEnvio(DOC_DIARIO)}</div>`
      : '';
  }
}
window.renderDocsAmpla = renderDocsAmpla;

// -------------------------------------------------------------------------
// CadÚnico (aba de cotas)
// -------------------------------------------------------------------------
async function applyFileUpload(target, fileName, sizeStr, fileObj = null) {
  if (target !== 'cadunico') return;
  const pendentesAntes = documentosPendentes().length;
  uploadState.cadUnicoAttached = true;
  uploadState.cadUnicoFileName = fileName;

  const card = document.getElementById('cardCadUnico');
  if (card) card.classList.remove('border-dashed', 'border-secondary/30');

  const iconBox = document.getElementById('cadUnicoIconBox');
  if (iconBox) iconBox.className = 'w-12 h-12 rounded-xl bg-surface-container text-primary flex items-center justify-center shrink-0 transition-colors';

  const badge = document.getElementById('cadUnicoBadge');
  if (badge) {
    badge.className = 'px-2.5 py-0.5 rounded-full bg-surface-container-highest text-primary font-label-sm text-label-sm font-semibold';
    badge.textContent = 'Anexado';
  }

  const badge1 = document.getElementById('cadUnicoBadge1');
  if (badge1) {
    badge1.className = 'px-2 py-0.5 rounded-full bg-surface-container-highest text-primary font-label-sm text-[11px] font-bold shrink-0';
    badge1.textContent = 'Anexado';
  }
  const fileText1 = document.getElementById('cadUnicoFileText1');
  if (fileText1) fileText1.textContent = fileName + ' (' + sizeStr + ')';

  showToastNotification('Documentos dos familiares (CAD Único) anexados!');
  updateCounters();
  if (pendentesAntes > 0 && documentosPendentes().length === 0) irParaResumo();

  // Persistência assíncrona no Back-End via apiClient
  if (fileObj && window.apiClient) {
    try {
      const dataUrl = await fileToBase64(fileObj);
      const cand = window.__coruja_state?.candidato || {};
      const resDoc = await window.apiClient.candidato.anexarDocumento({
        cpf: cand.cpf || '000.000.000-00',
        protocolo: window.__coruja_state?.protocoloGerado || null,
        documento: {
          nome_documento: 'Documentos Familiares (CadÚnico)',
          tipo: 'CADUNICO',
          arquivo_nome: fileName,
          arquivo_url: dataUrl,
          tamanho: sizeStr,
          formato: fileName.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image'
        },
        nome: cand.nome_completo || 'Candidato',
        email: cand.email || '',
        telefone: cand.telefone || ''
      });

      if (resDoc && resDoc.documento) {
        uploadState.cadunicoDocId = resDoc.documento.id;
        if (resDoc.protocolo && window.__coruja_state && !window.__coruja_state.protocoloGerado) {
          window.__coruja_state.protocoloGerado = resDoc.protocolo;
        }
      }
    } catch (persistErr) {
      console.warn('Documento mantido localmente para envio conjunto na finalização:', persistErr);
    }
  }
}
window.applyFileUpload = applyFileUpload;

async function removeUploadedFile(target) {
  if (target !== 'cadunico') return;
  const cand = window.__coruja_state?.candidato || {};
  const docId = uploadState.cadunicoDocId;

  uploadState.cadUnicoAttached = false;
  uploadState.cadUnicoFileName = '';

  const card = document.getElementById('cardCadUnico');
  if (card) card.classList.add('border-dashed', 'border-secondary/30');

  const badge = document.getElementById('cadUnicoBadge');
  if (badge) {
    badge.className = 'px-2.5 py-0.5 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm font-bold';
    badge.textContent = 'Pendente';
  }

  const fileText1 = document.getElementById('cadUnicoFileText1');
  if (fileText1) fileText1.textContent = 'Nenhum arquivo anexado';

  showToastNotification('Documento do CadÚnico removido.', 'error');
  updateCounters();

  if (docId && window.apiClient) {
    try {
      await window.apiClient.candidato.removerDocumento(docId, cand.cpf);
      delete uploadState.cadunicoDocId;
    } catch (e) {
      console.warn('Erro ao remover do back-end:', e);
    }
  }
}
window.removeUploadedFile = removeUploadedFile;

function htmlItemResumo(nome, ok, textoOk = 'Enviado') {
  return ok
    ? `<div class="p-4 rounded-xl bg-surface-container-low flex items-center justify-between transition-colors">
        <div class="flex items-center gap-3"><span class="material-symbols-outlined text-tertiary">check_circle</span><span class="font-label-md text-label-md font-medium text-on-surface">${escDoc(nome)}</span></div>
        <span class="font-label-sm text-label-sm text-tertiary font-bold">${textoOk}</span>
      </div>`
    : `<div class="p-4 rounded-xl bg-error-container/40 flex items-center justify-between transition-colors">
        <div class="flex items-center gap-3"><span class="material-symbols-outlined text-error">cancel</span><span class="font-label-md text-label-md font-semibold text-error">${escDoc(nome)}</span></div>
        <span class="font-label-sm text-label-sm text-error font-bold">Aguardando Envio</span>
      </div>`;
}

function updateCounters() {
  const cotista = isCandidatoCotista();
  const defs = DOCS_AMPLA.concat(uploadState.diarioObrigatorio ? [DOC_DIARIO] : []);
  const obrigatorios = defs.filter(docObrigatorio);
  const enviadosAmpla = obrigatorios.filter(docEnviado).length;

  const amplaCounter = document.getElementById('amplaCounterText');
  if (amplaCounter) amplaCounter.textContent = `${enviadosAmpla} de ${obrigatorios.length} enviados`;
  const amplaTab = document.getElementById('amplaTabCount');
  if (amplaTab) amplaTab.textContent = `${obrigatorios.length} itens`;

  const cotaBadge = document.getElementById('cotaCounterBadge');
  if (cotaBadge) cotaBadge.textContent = uploadState.cadUnicoAttached ? 'Todos os 5 itens validados' : '1 de 5 itens pendentes';

  const total = obrigatorios.length + (cotista ? 1 : 0);
  const enviados = enviadosAmpla + (cotista && uploadState.cadUnicoAttached ? 1 : 0);
  const sumTotal = document.getElementById('summaryTotalCounter');
  if (sumTotal) sumTotal.textContent = `${enviados}/${total}`;

  // Resumo: obrigatórios + opcionais que o candidato enviou + CadÚnico (só cotista)
  const grid = document.getElementById('summaryDocsGrid');
  if (grid) {
    let html = defs
      .filter(d => docObrigatorio(d) || docEnviado(d))
      .map(d => htmlItemResumo(d.max > 1 && docEnviado(d) ? `${d.resumo} (${arquivosDoc(d.id).length} arquivo${arquivosDoc(d.id).length > 1 ? 's' : ''})` : d.resumo, docEnviado(d)))
      .join('');
    if (cotista) html += htmlItemResumo('Docs Família (CAD Único)', uploadState.cadUnicoAttached);
    grid.innerHTML = html;
  }

  const alertText = document.getElementById('summaryAlertText');
  const pendentes = documentosPendentes();
  if (alertText) {
    if (pendentes.length === 0) {
      alertText.innerHTML = '<span class="text-tertiary font-bold">Tudo pronto!</span> Todos os documentos obrigatórios foram enviados. Confira a lista acima e clique em <strong>Matricular-se</strong> para concluir sua inscrição.';
    } else {
      alertText.innerHTML = `Ainda falta${pendentes.length > 1 ? 'm' : ''} <strong>${pendentes.length} documento${pendentes.length > 1 ? 's' : ''}</strong>: ${pendentes.map(p => escDoc(p.nome)).join(', ')}. Você pode enviar agora nas abas correspondentes ou clicar em <strong>Matricular-se</strong> assim mesmo: eles ficarão como <strong>pendência</strong> no comprovante e devem ser entregues na Secretaria.`;
    }
  }
  atualizarCaixaPendencias(pendentes);
  aplicarVisibilidadeCotas();
}
window.updateCounters = updateCounters;

// O que dizer para cada documento faltando na caixa de pendências
const DICAS_PENDENCIA = {
  foto: 'Tire uma foto pela câmera ou envie uma imagem (JPG ou PNG).',
  identidade: 'Envie 1 arquivo (RG com CPF) ou 2 arquivos (RG e CPF separados), foto ou PDF.',
  historico: 'Envie de 1 a 5 arquivos (foto ou PDF), um por página.',
  diario: 'Envie o recorte ou marque "Conclusão posterior a 2016".',
  cadunico: 'Envie na aba "Documentação de Cotas".'
};

function irParaPendencia(p) {
  switchTab(p.aba);
  const alvo = document.getElementById(p.aba === 'cotas' ? 'cardCadUnico' : (p.id === 'diario' ? 'doUploadBox' : 'docCard-' + p.id));
  if (alvo) alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Caixa "Quase lá! Faltam alguns documentos": só aparece depois de clicar em Matricular-se
// e se atualiza sozinha a cada envio; some quando não falta mais nada.
function atualizarCaixaPendencias(pendentes = documentosPendentes()) {
  const caixa = document.getElementById('docsPendentesBox');
  const lista = document.getElementById('docsPendentesList');
  const msg = document.getElementById('docsPendentesMsg');
  if (!caixa || !lista) return;
  if (!uploadState.mostrarPendencias || pendentes.length === 0) {
    caixa.classList.add('hidden');
    lista.innerHTML = '';
    if (pendentes.length === 0) uploadState.mostrarPendencias = false;
    return;
  }
  if (msg) {
    msg.textContent = pendentes.length === 1
      ? 'Falta 1 documento. Ele está marcado em vermelho abaixo.'
      : `Faltam ${pendentes.length} documentos. Eles estão marcados em vermelho abaixo.`;
  }
  lista.innerHTML = '';
  pendentes.forEach(p => {
    const li = document.createElement('li');
    li.className = 'cursor-pointer hover:underline';
    li.innerHTML = `<strong>${escDoc(p.nome)}:</strong> ${escDoc(DICAS_PENDENCIA[p.id] || 'Tire uma foto ou envie o arquivo (JPG, PNG ou PDF).')}`;
    li.addEventListener('click', () => irParaPendencia(p));
    lista.appendChild(li);
  });
  caixa.classList.remove('hidden');
}

function fecharCaixaPendencias() {
  uploadState.mostrarPendencias = false;
  renderDocsAmpla();
  updateCounters();
}
window.fecharCaixaPendencias = fecharCaixaPendencias;

// -------------------------------------------------------------------------
// Câmera: pede permissão ao navegador e captura a foto do documento
// -------------------------------------------------------------------------
function pararCamera() {
  if (uploadState.cameraStream) {
    uploadState.cameraStream.getTracks().forEach(t => t.stop());
    uploadState.cameraStream = null;
  }
  const video = document.getElementById('webcamVideo');
  if (video) {
    video.srcObject = null;
    video.classList.add('hidden');
  }
}

function mostrarGuiaCamera(icone, titulo, sub, mostrarMoldura) {
  const fallback = document.getElementById('cameraFallbackSim');
  if (fallback) fallback.classList.remove('hidden');
  const frame = document.getElementById('cameraGuideFrame');
  if (frame) frame.classList.toggle('hidden', !mostrarMoldura);
  const ic = document.getElementById('cameraGuideIcon');
  if (ic) ic.textContent = icone;
  const t = document.getElementById('cameraGuideTitle');
  if (t) t.textContent = titulo;
  const s = document.getElementById('cameraGuideSub');
  if (s) s.textContent = sub;
}

async function openCameraModal(context = 'foto') {
  const def = getDocDef(context);
  if (!def) return;
  uploadState.targetCameraContext = context;
  const ehRosto = context === 'foto';

  const titulo = document.getElementById('cameraModalTitle');
  if (titulo) titulo.textContent = ehRosto ? 'Foto 3x4 pela Câmera' : `Fotografar: ${def.resumo}`;
  const snap = document.getElementById('cameraSnapBtn');
  if (snap) snap.disabled = true;

  mostrarGuiaCamera(ehRosto ? 'face' : 'description',
    'Aguardando permissão da câmera...',
    'Clique em "Permitir" no aviso do navegador.', true);

  const modal = document.getElementById('cameraModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
    mostrarGuiaCamera('no_photography', 'Câmera indisponível neste navegador.',
      'Feche esta janela e use o botão "Enviar Arquivo".', false);
    return;
  }

  try {
    pararCamera();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: ehRosto ? 'user' : 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    });
    // Janela fechada enquanto o navegador pedia permissão
    if (!modal || modal.classList.contains('hidden')) {
      stream.getTracks().forEach(t => t.stop());
      return;
    }
    uploadState.cameraStream = stream;
    const video = document.getElementById('webcamVideo');
    if (video) {
      video.srcObject = stream;
      video.classList.remove('hidden');
      try { await video.play(); } catch (e) { /* autoplay já ativo */ }
    }
    const fallback = document.getElementById('cameraFallbackSim');
    if (fallback) fallback.classList.add('hidden');
    if (snap) snap.disabled = false;
  } catch (err) {
    const negado = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    mostrarGuiaCamera('no_photography',
      negado ? 'Permissão da câmera negada.' : 'Não foi possível abrir a câmera.',
      negado ? 'Libere a câmera nas configurações do navegador ou use "Enviar Arquivo".' : 'Verifique se outra aplicação está usando a câmera ou use "Enviar Arquivo".',
      false);
  }
}
window.openCameraModal = openCameraModal;

function closeCameraModal() {
  pararCamera();
  const modal = document.getElementById('cameraModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}
window.closeCameraModal = closeCameraModal;

function triggerSnapPhoto() {
  const video = document.getElementById('webcamVideo');
  if (!uploadState.cameraStream || !video || !video.videoWidth) {
    showToastNotification('A câmera ainda não está pronta. Permita o acesso ou use "Enviar Arquivo".', 'error');
    return;
  }
  const flash = document.getElementById('cameraFlash');
  if (flash) {
    flash.classList.remove('opacity-0');
    flash.classList.add('opacity-80');
    setTimeout(() => {
      flash.classList.remove('opacity-80');
      flash.classList.add('opacity-0');
    }, 150);
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const contexto = uploadState.targetCameraContext;
  canvas.toBlob((blob) => {
    if (!blob) {
      showToastNotification('Não foi possível capturar a foto. Tente novamente.', 'error');
      return;
    }
    const carimbo = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    const arquivo = new File([blob], `${contexto}_camera_${carimbo}.jpg`, { type: 'image/jpeg' });
    closeCameraModal();
    adicionarArquivoDoc(contexto, arquivo);
  }, 'image/jpeg', 0.9);
}
window.triggerSnapPhoto = triggerSnapPhoto;

// Modal de Pré-visualização
function openDocumentPreview(title, filename, size, type = 'pdf', customSrc = null) {
  uploadState.currentPreviewData = { title, filename, size, type, customSrc };
  const titleEl = document.getElementById('previewModalTitle');
  const fnEl = document.getElementById('previewModalFilename');
  const sizeEl = document.getElementById('previewModalFilesize');
  if (titleEl) titleEl.textContent = title;
  if (fnEl) fnEl.textContent = filename;
  if (sizeEl) sizeEl.textContent = size;

  const imgWrapper = document.getElementById('previewImageWrapper');
  const docWrapper = document.getElementById('previewDocWrapper');
  const icon = document.getElementById('previewModalIcon');

  if (type === 'image' && customSrc) {
    if (imgWrapper) {
      imgWrapper.classList.remove('hidden');
      imgWrapper.classList.add('flex');
    }
    if (docWrapper) docWrapper.classList.add('hidden');
    const imgContent = document.getElementById('previewImageContent');
    if (imgContent) imgContent.src = customSrc;
    if (icon) icon.textContent = 'image';
  } else {
    if (imgWrapper) imgWrapper.classList.add('hidden');
    if (docWrapper) {
      docWrapper.classList.remove('hidden');
      docWrapper.classList.add('flex');
    }
    const docType = document.getElementById('previewDocType');
    if (docType) docType.textContent = title;
    if (icon) icon.textContent = 'picture_as_pdf';
  }

  const modal = document.getElementById('previewModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}
window.openDocumentPreview = openDocumentPreview;

function closePreviewModal() {
  const modal = document.getElementById('previewModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}
window.closePreviewModal = closePreviewModal;

function downloadCurrentMockFile() {
  if (uploadState.currentPreviewData) {
    showToastNotification(`Iniciando download de: ${uploadState.currentPreviewData.filename}`);
  }
}
window.downloadCurrentMockFile = downloadCurrentMockFile;

// Campo Condicional Diário Oficial
function toggleDiarioOficial(required) {
  uploadState.diarioObrigatorio = !!required;
  renderDocsAmpla();
  updateCounters();
}
window.toggleDiarioOficial = toggleDiarioOficial;

// Avançar Etapa (Upload & Conferência -> Confirmação & Protocolo)
async function handleAdvanceSubmission() {
  // Primeiro mostra o Resumo de Conformidade para o candidato conferir.
  // Documento faltando não impede: ele sai como pendência no comprovante de matrícula.
  const secResumo = document.getElementById('sectionResumo');
  if (secResumo && secResumo.classList.contains('hidden')) {
    switchTab('resumo');
    const aba = document.getElementById('tabBtnResumo');
    if (aba) aba.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const faltam = documentosPendentes().length;
    showToastNotification(faltam > 0
      ? `Faltam ${faltam} documento${faltam > 1 ? 's' : ''}. Você pode se matricular assim mesmo: eles ficarão como pendência no comprovante.`
      : 'Confira o resumo dos documentos e clique em "Matricular-se" para concluir.');
    return;
  }

  const btn = document.getElementById('advanceButton');
  const btnText = document.getElementById('advanceBtnText');
  const btnIcon = document.getElementById('advanceBtnIcon');
  const btnSpinner = document.getElementById('advanceBtnSpinner');

  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-90', 'cursor-wait');
  }
  if (btnText) btnText.textContent = 'Enviando sua matrícula...';
  if (btnIcon) btnIcon.classList.add('hidden');
  if (btnSpinner) btnSpinner.classList.remove('hidden');

  try {
    // Validação estrita no servidor antes de avançar para a etapa final
    const cand = window.__coruja_state?.candidato || {};
    let data;
    try {
      if (window.apiClient) {
        data = await window.apiClient.candidato.conferirDados(cand);
      } else {
        const res = await fetch('/api/candidatos/conferencia-dados', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cand)
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro na conferência');
      }
    } catch (err) {
      data = err.data || { sucesso: false, error: err.message };
    }

    if (!data || !data.sucesso) {
      showToastNotification(`Falha de conformidade cadastral (HTTP 400): ${data.motivo || data.error}`, 'error');
      alert(`Atenção: O servidor rejeitou o avanço devido a inconsistências cadastrais:\n\n${data.motivo || data.error}\n\nPor favor, retorne à Etapa 2 (Ficha Cadastral) para corrigir os dados.`);
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-90', 'cursor-wait');
      }
      if (btnText) btnText.textContent = 'Matricular-se';
      if (btnIcon) btnIcon.classList.remove('hidden');
      if (btnSpinner) btnSpinner.classList.add('hidden');
      return;
    }

    const progressBar = document.getElementById('stepperProgressBar');
    if (progressBar) {
      progressBar.classList.remove('w-2/3');
      progressBar.classList.add('w-full');
    }

    const step3Badge = document.getElementById('step3Badge');
    if (step3Badge) {
      step3Badge.innerHTML = '<span class="material-symbols-outlined text-lg">check</span>';
      step3Badge.classList.remove('ring-4', 'ring-primary/20');
    }
    const step3Title = document.getElementById('step3Title');
    if (step3Title) step3Title.className = 'font-label-md text-label-md font-semibold text-on-surface';
    const step3Sub = document.getElementById('step3Sub');
    if (step3Sub) {
      step3Sub.className = 'font-label-sm text-label-sm text-on-surface-variant font-medium';
      step3Sub.textContent = 'Concluído';
    }

    const step4Node = document.getElementById('step4Node');
    if (step4Node) step4Node.classList.remove('opacity-70');
    const step4Badge = document.getElementById('step4Badge');
    if (step4Badge) {
      step4Badge.className = 'w-10 h-10 rounded-full bg-primary text-on-primary ring-4 ring-primary/20 flex items-center justify-center font-bold text-sm shadow-md shrink-0';
    }
    const step4Title = document.getElementById('step4Title');
    if (step4Title) step4Title.className = 'font-label-md text-label-md font-bold text-primary';
    const step4Sub = document.getElementById('step4Sub');
    if (step4Sub) {
      step4Sub.className = 'font-label-sm text-label-sm text-primary font-semibold';
      step4Sub.textContent = 'Etapa Atual';
    }

    setTimeout(() => {
      if (typeof window.finalizarMatriculaEAvancar === 'function') {
        window.finalizarMatriculaEAvancar();
      } else if (typeof window.navegarPara === 'function') {
        window.navegarPara('etapa4');
      }
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-90', 'cursor-wait');
      }
      if (btnText) btnText.textContent = 'Matricular-se';
      if (btnIcon) btnIcon.classList.remove('hidden');
      if (btnSpinner) btnSpinner.classList.add('hidden');
    }, 1000);
  } catch (err) {
    console.error('Erro na validação do servidor:', err);
    showToastNotification('Erro ao conectar ao servidor de validação: ' + err.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-90', 'cursor-wait');
    }
    if (btnText) btnText.textContent = 'Matricular-se';
    if (btnIcon) btnIcon.classList.remove('hidden');
    if (btnSpinner) btnSpinner.classList.add('hidden');
  }
}
window.handleAdvanceSubmission = handleAdvanceSubmission;

// Etapa Anterior
function handlePreviousStep(e) {
  if (e) e.preventDefault();
  // Sem confirm(): a caixa de confirmação pode ser bloqueada pelo navegador e o botão não fazia nada.
  // Os uploads já ficam salvos, então volta direto.
  if (typeof window.navegarPara === 'function') {
    window.navegarPara('etapa2');
  }
  showToastNotification('Você voltou para a Ficha Cadastral. Seus arquivos enviados foram mantidos.');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.handlePreviousStep = handlePreviousStep;

// Desenha os cards da etapa 3 assim que a página carrega
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { renderDocsAmpla(); updateCounters(); });
} else {
  renderDocsAmpla();
  updateCounters();
}

// Tecla ESC para fechar modais
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closePreviewModal();
    closeCameraModal();
  }
});
