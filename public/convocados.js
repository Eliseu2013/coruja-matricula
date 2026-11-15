// Tela da secretaria: importa o PDF da chamada (SISU) e acompanha quem já criou acesso.
// Todo texto vindo do servidor ou do PDF entra com textContent (sem innerHTML).
(function () {
  'use strict';

  const api = window.apiClient;
  const $ = (id) => document.getElementById(id);
  let rotulos = {};
  let listaAtual = [];
  let arquivoSelecionado = null;

  const TURNO = { MATUTINO: 'Matutino', VESPERTINO: 'Vespertino', NOTURNO: 'Noturno', INTEGRAL: 'Integral' };

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto !== undefined && texto !== null) e.textContent = String(texto);
    return e;
  }

  function alerta(msg, tipo) {
    const box = $('alertBox');
    box.className = 'p-4 rounded-xl text-sm border flex items-start space-x-3 ' +
      (tipo === 'ok' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-red-50 border-red-300 text-red-800');
    $('alertIcon').className = tipo === 'ok'
      ? 'fa-solid fa-circle-check mt-0.5 text-base text-emerald-600'
      : 'fa-solid fa-circle-exclamation mt-0.5 text-base text-red-600';
    $('alertMessage').textContent = msg;
    box.scrollIntoView({ block: 'nearest' });
  }
  function limparAlerta() { $('alertBox').className = 'hidden'; }

  function chip(texto, forte) {
    return el('span', 'px-2.5 py-1 rounded-full text-[11px] font-bold border ' +
      (forte ? 'bg-[#0f3b7a] text-white border-[#0f3b7a]' : 'bg-slate-50 text-slate-700 border-slate-200'), texto);
  }

  function tratarErroSessao(err) {
    if (err && err.status === 401) {
      window.location.href = 'login.html';
      return true;
    }
    if (err && err.status === 403) {
      alerta('Esta área é exclusiva da Secretaria Acadêmica. Entre com um usuário da secretaria.');
      return true;
    }
    return false;
  }

  // ===== Lista atual =====
  async function carregarLista() {
    try {
      const dados = await api.request('/api/convocados');
      rotulos = dados.rotulos_modalidade || {};
      listaAtual = dados.itens || [];
      const status = $('statusLista');
      status.textContent = '';
      if (!dados.existe) {
        status.className = 'mt-4 p-3.5 rounded-xl border text-sm bg-amber-50 border-amber-200 text-amber-900';
        status.appendChild(el('strong', '', 'Nenhuma lista importada. '));
        status.appendChild(document.createTextNode('Enquanto isso, o 1º acesso no portal está liberado para qualquer CPF válido.'));
      } else {
        status.className = 'mt-4 p-3.5 rounded-xl border text-sm bg-emerald-50 border-emerald-200 text-emerald-900';
        status.appendChild(el('strong', '', `Conferência ligada: ${dados.resumo.total} convocados. `));
        status.appendChild(document.createTextNode(`${dados.com_acesso} já criaram acesso; ${dados.resumo.total - dados.com_acesso} aguardando o 1º acesso.`));
      }
      desenharLista();
    } catch (err) {
      if (!tratarErroSessao(err)) alerta(err.message || 'Erro ao carregar a lista.');
    }
  }

  function desenharLista() {
    const busca = $('busca').value.trim().toUpperCase();
    const buscaDigitos = busca.replace(/\D/g, '');
    const turno = $('filtroTurno').value;
    const acesso = $('filtroAcesso').value;
    const tbody = $('listaTabela');
    tbody.textContent = '';
    const filtrados = listaAtual.filter(i =>
      (!turno || i.turno === turno) &&
      (!acesso || (acesso === 'com' ? i.conta : !i.conta)) &&
      (!busca || String(i.nome).includes(busca) || (buscaDigitos && String(i.inscricao_enem).includes(buscaDigitos)))
    );
    for (const i of filtrados) {
      const tr = el('tr', 'hover:bg-slate-50');
      tr.appendChild(el('td', 'px-3 py-2 font-semibold', TURNO[i.turno] || i.turno));
      tr.appendChild(el('td', 'px-3 py-2 text-slate-600', rotulos[i.modalidade] || i.modalidade));
      tr.appendChild(el('td', 'px-3 py-2 font-bold text-slate-900', i.nome));
      tr.appendChild(el('td', 'px-3 py-2 font-mono', i.inscricao_enem));
      const tdAcesso = el('td', 'px-3 py-2');
      if (i.conta) {
        const linha = el('div', 'flex items-center gap-2 flex-wrap');
        linha.appendChild(el('span', 'px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[11px]', 'Criado · CPF ' + i.conta.cpf));
        const btn = el('button', 'px-2 py-0.5 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 font-bold text-[11px]', 'Liberar');
        btn.type = 'button';
        btn.title = 'Use se outra pessoa usou esta inscrição';
        btn.addEventListener('click', () => liberar(i));
        linha.appendChild(btn);
        tdAcesso.appendChild(linha);
      } else {
        tdAcesso.appendChild(el('span', 'px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-semibold text-[11px]', 'Aguardando 1º acesso'));
      }
      tr.appendChild(tdAcesso);
      tbody.appendChild(tr);
    }
    $('listaVazia').classList.toggle('hidden', filtrados.length > 0 || !listaAtual.length);
  }

  async function liberar(item) {
    const ok = window.confirm(
      `Liberar a inscrição ${item.inscricao_enem} (${item.nome})?\n\n` +
      `O acesso criado com o CPF ${item.conta.cpf} deixa de funcionar e a inscrição fica livre ` +
      'para o candidato correto fazer o 1º acesso. Use só se outra pessoa usou esta inscrição.'
    );
    if (!ok) return;
    try {
      const r = await api.request(`/api/convocados/${encodeURIComponent(item.inscricao_enem)}/liberar`, { method: 'POST' });
      alerta(r.message, 'ok');
      carregarLista();
    } catch (err) {
      if (!tratarErroSessao(err)) alerta(err.message || 'Erro ao liberar a inscrição.');
    }
  }

  // ===== Importação =====
  function enviarPdf(url) {
    return api.request(url, {
      method: 'POST',
      body: arquivoSelecionado,
      headers: { 'Content-Type': 'application/pdf' },
      timeoutMs: 60000
    });
  }

  async function escolherArquivo(arquivo) {
    limparAlerta();
    if (!arquivo) return;
    if (!/\.pdf$/i.test(arquivo.name) && arquivo.type !== 'application/pdf') {
      alerta('Escolha um arquivo PDF.');
      return;
    }
    if (arquivo.size > 5 * 1024 * 1024) {
      alerta('O PDF passa de 5 MB.');
      return;
    }
    arquivoSelecionado = arquivo;
    $('nomeArquivo').textContent = 'Lendo ' + arquivo.name + '...';
    try {
      const dados = await enviarPdf('/api/convocados/previa');
      rotulos = dados.rotulos_modalidade || rotulos;
      mostrarPrevia(dados);
      $('nomeArquivo').textContent = arquivo.name;
    } catch (err) {
      $('nomeArquivo').textContent = 'Clique para escolher o PDF ou arraste aqui';
      arquivoSelecionado = null;
      if (!tratarErroSessao(err)) alerta(err.message || 'Não foi possível ler o PDF.');
    }
  }

  function mostrarPrevia(dados) {
    const resumo = $('previaResumo');
    resumo.textContent = '';
    resumo.appendChild(chip(`${dados.resumo.total} candidatos encontrados`, true));
    for (const [t, n] of Object.entries(dados.resumo.por_turno)) resumo.appendChild(chip(`${TURNO[t] || t}: ${n}`));
    for (const [m, n] of Object.entries(dados.resumo.por_modalidade)) resumo.appendChild(chip(`${rotulos[m] || m}: ${n}`));

    const avisos = $('previaAvisos');
    avisos.textContent = '';
    (dados.avisos || []).forEach(a => avisos.appendChild(el('li', '', a)));
    avisos.classList.toggle('hidden', !(dados.avisos || []).length);

    const tbody = $('previaTabela');
    tbody.textContent = '';
    for (const i of dados.itens) {
      const tr = el('tr');
      tr.appendChild(el('td', 'px-3 py-1.5 font-semibold', TURNO[i.turno] || i.turno));
      tr.appendChild(el('td', 'px-3 py-1.5 text-slate-600', rotulos[i.modalidade] || i.modalidade));
      tr.appendChild(el('td', 'px-3 py-1.5', i.ordem));
      tr.appendChild(el('td', 'px-3 py-1.5 font-bold text-slate-900', i.nome));
      tr.appendChild(el('td', 'px-3 py-1.5', String(i.nota).replace('.', ',')));
      tr.appendChild(el('td', 'px-3 py-1.5 font-mono', i.inscricao_enem));
      tbody.appendChild(tr);
    }
    $('previa').classList.remove('hidden');
  }

  function cancelar() {
    arquivoSelecionado = null;
    $('arquivoPdf').value = '';
    $('previa').classList.add('hidden');
    $('nomeArquivo').textContent = 'Clique para escolher o PDF ou arraste aqui';
  }

  async function salvar() {
    if (!arquivoSelecionado) return;
    const modo = document.querySelector('input[name="modo"]:checked').value;
    if (modo === 'substituir' && !window.confirm('Substituir a lista inteira? Quem não estiver neste PDF não conseguirá mais fazer o 1º acesso.')) return;
    const btn = $('btnSalvar');
    btn.disabled = true;
    $('btnSalvarTexto').textContent = 'Salvando...';
    try {
      const r = await enviarPdf('/api/convocados?modo=' + modo);
      cancelar();
      alerta(r.message, 'ok');
      carregarLista();
    } catch (err) {
      if (!tratarErroSessao(err)) alerta(err.message || 'Erro ao salvar a lista.');
    } finally {
      btn.disabled = false;
      $('btnSalvarTexto').textContent = 'Salvar lista';
    }
  }

  // ===== Eventos =====
  $('arquivoPdf').addEventListener('change', (e) => escolherArquivo(e.target.files[0]));
  const area = $('areaArquivo');
  area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('border-[#0f3b7a]'); });
  area.addEventListener('dragleave', () => area.classList.remove('border-[#0f3b7a]'));
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('border-[#0f3b7a]');
    escolherArquivo(e.dataTransfer.files[0]);
  });
  $('btnCancelar').addEventListener('click', cancelar);
  $('btnSalvar').addEventListener('click', salvar);
  $('busca').addEventListener('input', desenharLista);
  $('filtroTurno').addEventListener('change', desenharLista);
  $('filtroAcesso').addEventListener('change', desenharLista);
  $('btnSair').addEventListener('click', () => { api.clearSession(); window.location.href = 'login.html'; });

  const user = api.getUser();
  if (user && user.nome) $('usuarioLogado').textContent = user.nome;
  let tokenEquipe = null;
  try { tokenEquipe = localStorage.getItem('coruja_token'); } catch (e) { /* sem storage */ }
  if (!tokenEquipe) {
    window.location.href = 'login.html';
    return;
  }
  carregarLista();
})();
