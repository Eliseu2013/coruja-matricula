/**
 * FAETERJ-Rio Coruja - Confirmação & Protocolo de Matrícula (Etapa 4)
 */

// 1. Copiar Código com feedback visual
// Turno escolhido na Etapa 1 com o horário letivo (mesmos horários da tela de modalidade)
const TURNOS = {
  MATUTINO: { nome: 'Turno Manhã', horario: '07h às 12:20h', completo: 'Turno Manhã (07h00 às 12h20)' },
  NOTURNO: { nome: 'Turno Noite', horario: '18h às 22:20h', completo: 'Turno Noite (18h00 às 22h20)' }
};
function turnoDoCandidato(turno) {
  return /MATUT|MANH/i.test(String(turno || '')) ? TURNOS.MATUTINO : TURNOS.NOTURNO;
}

// Protocolo real da matrícula atual (vem do servidor ao concluir ou editar)
function protocoloAtual() {
  return (window.__coruja_state && window.__coruja_state.protocoloGerado) || '';
}

function copyProtocol() {
  const protocol = protocoloAtual();
  if (!protocol) {
    showToast('Protocolo ainda não disponível. Conclua a matrícula primeiro.', 'error', 'error');
    return;
  }
  const btn = document.getElementById('copy-protocol-btn');
  const icon = document.getElementById('copy-icon');
  const text = document.getElementById('copy-text');

  navigator.clipboard.writeText(protocol).then(() => {
    if (icon) icon.textContent = 'check';
    if (text) text.textContent = 'Copiado!';
    if (btn) btn.classList.add('bg-emerald-100', 'text-emerald-800', 'border-emerald-300');

    showToast('Código de protocolo copiado para a área de transferência!', 'check_circle', 'success');

    setTimeout(() => {
      if (icon) icon.textContent = 'content_copy';
      if (text) text.textContent = 'Copiar Código';
      if (btn) btn.classList.remove('bg-emerald-100', 'text-emerald-800', 'border-emerald-300');
    }, 2500);
  }).catch(() => {
    showToast('Não foi possível copiar o código.', 'error', 'error');
  });
}
window.copyProtocol = copyProtocol;

// 2. Baixar Ficha de Matrícula em PDF simulado com toast de progresso
// dadosConsulta (opcional): dados vindos da consulta "Verificar Matrícula" do portal
function downloadMatriculaPDF(dadosConsulta) {
  const externo = dadosConsulta && typeof dadosConsulta === 'object' && dadosConsulta.protocolo ? dadosConsulta : null;
  // Sem protocolo real não gera comprovante (antes saía com um protocolo de exemplo)
  if (!externo && !protocoloAtual()) {
    showToast('Protocolo ainda não disponível. Conclua a matrícula primeiro.', 'error', 'error');
    return;
  }
  const btn = externo ? null : document.getElementById('download-pdf-btn');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-75', 'cursor-wait');
  }

  showToast('Gerando Ficha de Matrícula Oficial FAETERJ-Rio em PDF...', 'hourglass_top', 'info');

  setTimeout(() => {
    const cand = externo || window.__coruja_state?.candidato || {};
    const proto = externo ? String(externo.protocolo) : protocoloAtual();
    const nome = cand.nome_completo || 'Candidato';
    const cpf = cand.cpf || '000.000.000-00';
    const curso = cand.curso || 'Superior de Tecnologia em ADS (Análise e Desenvolvimento de Sistemas)';
    const turno = turnoDoCandidato(cand.turno).completo;
    const cota = cand.cota || 'Ampla Concorrência (AC)';
    const semestre = (externo && externo.semestre) || '2026.1';

    const escape = (s) => (typeof window.escapeHtml === 'function') ? window.escapeHtml(s) : String(s || '');

    // Documentos que o candidato não enviou na Etapa 3 (matrículas antigas não têm a lista)
    const temLista = Array.isArray(cand.documentos_pendentes);
    const pendentes = temLista ? cand.documentos_pendentes.filter(Boolean) : [];
    const linhaPendencias = !temLista ? '' : (pendentes.length > 0
      ? `<tr><th>Documentos Pendentes:</th><td><span style="color:#b45309; font-weight:bold;">${pendentes.length} documento${pendentes.length > 1 ? 's' : ''} não enviado${pendentes.length > 1 ? 's' : ''}:</span><ul style="margin:4px 0 0; padding-left:18px;">${pendentes.map(p => `<li>${escape(p)}</li>`).join('')}</ul><div style="margin-top:4px; color:#475569;">Entregue na Secretaria Acadêmica junto com os originais.</div></td></tr>`
      : '<tr><th>Documentos Pendentes:</th><td><span style="color:#059669; font-weight:bold;">Nenhum. Todos os documentos obrigatórios foram enviados.</span></td></tr>');
    const statusRegistro = pendentes.length > 0
      ? '<span style="color:#b45309; font-weight:bold;">Matrícula registrada com pendência documental</span>'
      : '<span style="color:#059669; font-weight:bold;">Matrícula Homologada / Documentos em Análise</span>';

    const receiptHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Comprovante Oficial de Requerimento de Matrícula - ${escape(proto)}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; margin: 30px; color: #1e293b; line-height: 1.5; }
    .header { text-align: center; border-bottom: 2px solid #0f3b7a; padding-bottom: 15px; margin-bottom: 20px; }
    .header h1 { font-size: 18px; color: #0f3b7a; margin: 0 0 5px 0; }
    .header h2 { font-size: 13px; color: #64748b; margin: 0; font-weight: normal; }
    .protocol-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; margin: 15px 0; text-align: center; }
    .protocol-box strong { font-size: 20px; color: #0f3b7a; font-family: monospace; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
    th { width: 32%; color: #475569; background: #f8fafc; font-weight: 600; }
    .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #cbd5e1; font-size: 11px; color: #64748b; text-align: center; }
    @media print {
      body { margin: 10mm; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>FAETERJ - Unidade Rio de Janeiro (Campus Quintino)</h1>
    <h2>Secretaria de Estado de Ciência, Tecnologia e Inovação &bull; FAETEC</h2>
    <p style="margin: 6px 0 0; font-size: 13px; font-weight: bold; color: #1e40af;">Comprovante Oficial de Requerimento de Matrícula</p>
  </div>
  <div class="protocol-box">
    <div style="font-size: 11px; color: #475569; margin-bottom: 2px;">NÚMERO DO PROTOCOLO REGISTRADO</div>
    <strong>${escape(proto)}</strong>
  </div>
  <table>
    <tr><th>Nome Completo:</th><td><strong>${escape(nome)}</strong></td></tr>
    <tr><th>CPF do Candidato:</th><td>${escape(cpf)}</td></tr>
    <tr><th>Curso:</th><td>${escape(curso)}</td></tr>
    <tr><th>Turno / Semestre:</th><td>${escape(turno)} &bull; ${escape(semestre)}</td></tr>
    <tr><th>Modalidade / Cota:</th><td>${escape(cota)}</td></tr>
    <tr><th>Data de Emissão:</th><td>${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })} às ${new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Horário de Brasília)</td></tr>
    <tr><th>Local de Atendimento:</th><td>Rua Fictícia, 100 — Centro, Rio de Janeiro - RJ (endereço fictício)</td></tr>
    <tr><th>Status do Registro:</th><td>${statusRegistro}</td></tr>
    ${linhaPendencias}
  </table>
  <div class="footer">
    Documento emitido eletronicamente pelo Sistema FAETERJ-Rio Coruja.<br>
    Conforme a Lei Geral de Proteção de Dados (Lei Federal nº 13.709/2018), os registros periciais e logs de auditoria foram salvaguardados.
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 250);
    };
  <\/script>
</body>
</html>`;

    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(receiptHtml);
      printWin.document.close();
    } else {
      const blob = new Blob([receiptHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Comprovante_Matricula_${proto.replace(/\s+/g, '_')}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-75', 'cursor-wait');
    }
    showToast('Ficha de matrícula pronta para impressão ou download em PDF!', 'print', 'success');
  }, 500);
}
window.downloadMatriculaPDF = downloadMatriculaPDF;

// 3. Imprimir Comprovante
function printComprovante() {
  window.print();
}
window.printComprovante = printComprovante;

// 4. Voltar ao Portal
function voltarAoPortal(e) {
  if (e) e.preventDefault();
  try {
    sessionStorage.removeItem('matricula_step');
    localStorage.removeItem('matricula_em_andamento');
  } catch (err) {}
  showToast('Redirecionando para o Portal de Matrícula Inicial...', 'arrow_back', 'info');
  setTimeout(() => {
    if (typeof window.navegarPara === 'function') {
      window.navegarPara('portal');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 600);
}
window.voltarAoPortal = voltarAoPortal;

// 5. Editar Dados da Matrícula
function editarDadosMatricula() {
  showToast('Retornando à Ficha Cadastral para edição de dados...', 'edit', 'info');
  setTimeout(() => {
    if (typeof window.navegarPara === 'function') {
      window.navegarPara('etapa2');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 500);
}
window.editarDadosMatricula = editarDadosMatricula;

// Sistema de Notificação Toast
function showToast(message, iconName = 'info', type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bgColors = {
    success: 'bg-emerald-800 text-white border-emerald-600',
    info: 'bg-primary text-white border-primary-container',
    error: 'bg-red-700 text-white border-red-800'
  };

  toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm transition-all duration-300 transform translate-y-4 opacity-0 ${bgColors[type] || bgColors.info}`;
  // textContent em vez de innerHTML: o texto e o ícone entram como texto, nunca como HTML.
  // Antes, um message ou iconName com HTML (ex.: <img onerror>) virava código (XSS de DOM).
  const icone = document.createElement('span');
  icone.className = 'material-symbols-outlined text-[20px] flex-shrink-0';
  icone.textContent = iconName;
  const texto = document.createElement('span');
  texto.className = 'font-medium';
  texto.textContent = message;
  toast.append(icone, texto);

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => {
      if (toast.parentNode) {
        container.removeChild(toast);
      }
    }, 300);
  }, 3500);
}
window.showToast = showToast;

// Atualiza dados na tela se preenchidos no fluxo
window.atualizarResumoConfirmacao = function() {
  const protEl = document.getElementById('protocol-number');
  if (protEl && protocoloAtual()) protEl.textContent = protocoloAtual();

  const cand = window.__coruja_state?.candidato;
  if (!cand) return;

  const nomeEl = document.getElementById('confirmacao-nome-candidato');
  const cpfEl = document.getElementById('confirmacao-cpf-candidato');
  const turnoEl = document.getElementById('confirmacao-turno-candidato');
  const cotaEl = document.getElementById('confirmacao-cota-candidato');

  if (nomeEl && cand.nome_completo) nomeEl.textContent = cand.nome_completo;
  if (cpfEl && cand.cpf) cpfEl.textContent = 'CPF: ' + cand.cpf;
  if (cand.turno) {
    const t = turnoDoCandidato(cand.turno);
    if (turnoEl) turnoEl.textContent = t.nome;
    // Antes o horário era fixo (sempre o da noite), mesmo para quem escolheu a manhã
    const horarioEl = document.getElementById('confirmacao-turno-horario');
    if (horarioEl) horarioEl.textContent = t.horario;
  }
  if (cotaEl && cand.cota) cotaEl.textContent = cand.cota;
};
