/**
 * FAETERJ-Rio Coruja - Camada Centralizada de Serviços e Cliente HTTP (apiClient)
 * Centraliza todas as chamadas HTTP (fetch), tratamento de cabeçalhos,
 * autenticação JWT (Bearer token), estados de erro, timeout e interceptor 401/403.
 */
(function() {
  'use strict';

  const CONFIG = {
    baseURL: (typeof window !== 'undefined' && window.__CORUJA_CONFIG && window.__CORUJA_CONFIG.API_URL) 
      ? String(window.__CORUJA_CONFIG.API_URL).replace(/\/+$/, '') 
      : '',
    timeoutMs: 30000
  };

  function getToken() {
    try {
      return localStorage.getItem('coruja_token') || localStorage.getItem('aluno_token') || null;
    } catch (e) {
      return null;
    }
  }

  function getUser() {
    try {
      const u = localStorage.getItem('coruja_user') || localStorage.getItem('aluno_user');
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  }

  function setSession(token, user, tipo = 'ADMIN') {
    try {
      if (tipo === 'ALUNO') {
        // Uma sessão por navegador: o token da equipe teria prioridade em getToken() e
        // faria as rotas do candidato recusarem a requisição
        localStorage.removeItem('coruja_token');
        localStorage.removeItem('coruja_user');
        localStorage.setItem('aluno_token', token);
        if (user) localStorage.setItem('aluno_user', JSON.stringify(user));
      } else {
        localStorage.setItem('coruja_token', token);
        if (user) localStorage.setItem('coruja_user', JSON.stringify(user));
      }
    } catch (e) {
      console.warn('Erro ao salvar sessão localmente:', e);
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem('coruja_token');
      localStorage.removeItem('coruja_user');
      localStorage.removeItem('aluno_token');
      localStorage.removeItem('aluno_user');
    } catch (e) {
      console.warn('Erro ao limpar sessão:', e);
    }
  }

  /**
   * Wrapper universal de chamadas HTTP
   */
  async function request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') 
      ? endpoint 
      : `${CONFIG.baseURL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

    const headers = {
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    // Anexa token JWT se disponível e não explicitamente desabilitado
    const token = options.token || getToken();
    if (token && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Configura Content-Type se houver body JSON
    let body = options.body;
    if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || CONFIG.timeoutMs);

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body,
        signal: controller.signal
      });
      clearTimeout(timeout);

      // Tratamento para 204 No Content
      if (response.status === 204) {
        return { ok: true, status: 204, data: null };
      }

      // Parser defensivo de JSON ou Texto
      const contentType = response.headers.get('content-type') || '';
      let data = null;
      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch (jsonErr) {
          data = { error: 'Resposta em formato JSON inválido do servidor.' };
        }
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        // Interceptor para 401 Unauthorized
        if (response.status === 401) {
          window.dispatchEvent(new CustomEvent('coruja:unauthorized', { detail: { endpoint, data } }));
        }

        const errorMessage = (data && typeof data === 'object')
          ? (data.error || data.message || data.motivo || `Erro HTTP ${response.status}`)
          : (typeof data === 'string' && data ? data : `Erro HTTP ${response.status}`);

        const err = new Error(errorMessage);
        err.status = response.status;
        err.data = data;
        throw err;
      }

      return data;
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        const timeoutErr = new Error('A requisição excedeu o tempo limite. Verifique sua conexão e tente novamente.');
        timeoutErr.status = 408;
        throw timeoutErr;
      }
      throw err;
    }
  }

  // API Módulos
  const api = {
    request,
    getConfig: () => ({ ...CONFIG }),
    getToken,
    getUser,
    setSession,
    clearSession,

    // Autenticação & Sessão
    auth: {
      login: (credentials) => request('/api/auth/login', { method: 'POST', body: credentials }),
      verify: (token) => request('/api/auth/verify', { method: 'GET', token }),
      solicitarRecuperacao: (data) => request('/api/auth/esqueci-senha', { method: 'POST', body: data }),
      redefinirSenha: (data) => request('/api/auth/redefinir-senha', { method: 'POST', body: data }),
      alunoAcesso: (credentials) => request('/api/auth/aluno/acesso', { method: 'POST', body: credentials }),
      alunoLogin: (credentials) => request('/api/auth/aluno/login', { method: 'POST', body: credentials }),
      alunoCadastro: (data) => request('/api/auth/aluno/cadastro', { method: 'POST', body: data }),
      alunoMinhaMatricula: () => request('/api/auth/aluno/minha-matricula', { method: 'GET' }),
      verificarSecretaria: () => request('/api/secretaria/verificar-permissao', { method: 'GET' })
    },

    // Candidato & Ficha Cadastral (Etapa 2)
    candidato: {
      obterFicha: (cpf) => request(`/api/candidatos/ficha-cadastral/${encodeURIComponent(cpf)}`),
      salvarFicha: (dados) => request('/api/candidatos/ficha-cadastral', { method: 'POST', body: dados }),
      conferirDados: (dados) => request('/api/candidatos/conferencia-dados', { method: 'POST', body: dados }),
      
      // Upload e Gestão de Documentos (Etapa 3)
      anexarDocumento: (payload) => request('/api/candidato/documentos', { method: 'POST', body: payload }),
      listarDocumentos: (cpf, protocolo) => {
        const params = new URLSearchParams();
        if (cpf) params.set('cpf', cpf);
        if (protocolo) params.set('protocolo', protocolo);
        return request(`/api/candidato/documentos?${params.toString()}`);
      },
      removerDocumento: (docId, cpf, protocolo) => {
        const params = new URLSearchParams();
        if (cpf) params.set('cpf', cpf);
        if (protocolo) params.set('protocolo', protocolo);
        return request(`/api/candidato/documentos/${encodeURIComponent(docId)}?${params.toString()}`, { method: 'DELETE' });
      },
      extrairOcr: (files) => request('/api/ia/extrair-documentos', { method: 'POST', body: { files } })
    },

    // Escolas & Georreferenciamento Maps (Etapa 2)
    escolas: {
      sugestoes: (q) => request(`/api/escolas/sugestoes?q=${encodeURIComponent(q || '')}`),
      validarMaps: (nomeEscola, cidade, uf) => request('/api/escolas/validar-maps', {
        method: 'POST',
        body: { nomeEscola, cidade, uf }
      })
    },

    // Matrículas & Protocolo (Etapa 4)
    matriculas: {
      criar: (payload) => request('/api/matriculas', { method: 'POST', body: payload }),
      consultar: (paramsObj) => {
        const params = new URLSearchParams(paramsObj || {});
        return request(`/api/public/matricula-consulta?${params.toString()}`);
      },
      reenviarExigencia: (payload) => request('/api/public/reenviar-documentos-exigencia', { method: 'POST', body: payload }),
      obterPorId: (id) => request(`/api/matriculas/${encodeURIComponent(id)}`),
      listar: (semestre) => {
        const qs = semestre ? `?semestre=${encodeURIComponent(semestre)}` : '';
        return request(`/api/matriculas${qs}`);
      },
      deferir: (id, payload) => request(`/api/matriculas/${encodeURIComponent(id)}/deferimento`, { method: 'POST', body: payload })
    },

    // Configurações & Semestres
    config: {
      obterJanela: () => request('/api/configuracoes/janela'),
      salvarJanela: (updates) => request('/api/configuracoes/janela', { method: 'PUT', body: updates }),
      listarSemestres: () => request('/api/semestres'),
      obterSemestreAtivo: () => request('/api/semestres/ativo')
    },

    // Trilha de Auditoria & Estatísticas
    auditoria: {
      painel: () => request('/api/auditoria/painel'),
      listarCadastros: (paramsObj) => {
        const qs = new URLSearchParams(paramsObj || {}).toString();
        return request(`/api/auditoria/cadastros${qs ? '?' + qs : ''}`);
      },
      obterCadastro: (protocolo) => request(`/api/auditoria/cadastros/${encodeURIComponent(protocolo)}`),
      registrarParecer: (protocolo, parecer) => request(`/api/auditoria/cadastros/${encodeURIComponent(protocolo)}/parecer`, {
        method: 'POST',
        body: parecer
      }),
      validarBalcao: (payload) => request('/api/auditoria/balcao/validar', { method: 'POST', body: payload }),
      logs: (paramsObj) => {
        const qs = new URLSearchParams(paramsObj || {}).toString();
        return request(`/api/logs${qs ? '?' + qs : ''}`);
      },
      statsLogs: () => request('/api/logs/stats')
    },

    // Backups
    backups: {
      listar: () => request('/api/backup/listar'),
      executar: () => request('/api/backup/executar', { method: 'POST' }),
      obterUrlDownload: (filename) => `${CONFIG.baseURL}/api/backup/download/${encodeURIComponent(filename)}`
    }
  };

  // Escuta evento global de sessão expirada para emitir notificação amigável
  window.addEventListener('coruja:unauthorized', function(e) {
    if (typeof window.showToast === 'function') {
      window.showToast('Sessão expirada ou não autorizada. Faça login novamente.', 'warning');
    }
  });

  window.apiClient = api;
})();
