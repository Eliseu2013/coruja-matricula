/**
 * Testes Unitários da Camada de Integração apiClient
 */
let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${testName}`);
  }
}

console.log('--- TESTES: apiClient e Contratos de Integração ---');

// Mock localStorage para testes
const mockStorage = new Map();
global.localStorage = {
  getItem: (k) => mockStorage.get(k) || null,
  setItem: (k, v) => mockStorage.set(k, String(v)),
  removeItem: (k) => mockStorage.delete(k),
  clear: () => mockStorage.clear()
};

// Mock CustomEvent e window
global.window = {
  dispatchEvent: (e) => {},
  __CORUJA_CONFIG: { API_URL: 'http://localhost:3000' },
  addEventListener: () => {}
};
global.CustomEvent = class {
  constructor(name, opts) {
    this.name = name;
    this.detail = opts ? opts.detail : null;
  }
};

// Carrega apiClient
await import('../public/apiClient.js');
const api = global.window.apiClient;

assert(api !== undefined, 'apiClient exportado globalmente em window.apiClient');
assert(typeof api.request === 'function', 'Função api.request disponível');
assert(typeof api.auth.login === 'function', 'Método auth.login disponível');
assert(typeof api.candidato.obterFicha === 'function', 'Método candidato.obterFicha disponível');
assert(typeof api.candidato.anexarDocumento === 'function', 'Método candidato.anexarDocumento disponível');
assert(typeof api.escolas.sugestoes === 'function', 'Método escolas.sugestoes disponível');
assert(typeof api.matriculas.criar === 'function', 'Método matriculas.criar disponível');
assert(typeof api.matriculas.consultar === 'function', 'Método matriculas.consultar disponível');

// Teste de gerenciamento de sessão
api.setSession('token_jwt_teste_123', { nome: 'Secretaria Teste', cargo: 'Gestor' }, 'ADMIN');
assert(api.getToken() === 'token_jwt_teste_123', 'Token salvo e recuperado com sucesso');
assert(api.getUser().nome === 'Secretaria Teste', 'Dados do usuário salvos e recuperados');

api.clearSession();
assert(api.getToken() === null, 'Sessão limpa com sucesso');
assert(api.getUser() === null, 'Usuário limpo com sucesso');

console.log('\n=======================================');
console.log(`TOTAL DE TESTES APICLIENT: ${passed + failed}`);
console.log(`PASSOU: ${passed}`);
console.log(`FALHOU: ${failed}`);
console.log('=======================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✓ TESTES DO APICLIENT CONCLUÍDOS COM SUCESSO!\n');
}
