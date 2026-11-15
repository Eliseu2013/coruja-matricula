import {
  validarTextoPuro,
  validarNomeCompleto,
  validarNomeSocial,
  validarCpf,
  validarRg,
  validarTituloEleitor,
  validarCertidaoMatricula,
  validarDataCalendario,
  validarCep,
  validarUf,
  validarZonaEleitoral,
  validarSecaoEleitoral,
  sanitizarEValidarCadastroEscolar
} from '../validators/cadastroEscolarValidation.js';

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

console.log('--- TESTES 1: Nomes e Textos Puros ---');
// Apenas letras com acentos da língua portuguesa e espaços
assert(validarTextoPuro('João da Silva'), 'Aceita letras e espaços');
assert(validarTextoPuro('Vitória Régia de Alcântara Conceição'), 'Aceita todas as acentuações (á, é, ã, ç, â, etc.)');
assert(validarTextoPuro('Érika Ávila Müller'), 'Aceita trema e maiúsculas acentuadas');
assert(!validarTextoPuro('João 123 Silva'), 'Rejeita números');
assert(!validarTextoPuro('Maria @ Santos'), 'Rejeita caracteres especiais @');
assert(!validarTextoPuro('Pedro!'), 'Rejeita caracter especial !');
assert(!validarTextoPuro('Lucas #'), 'Rejeita caracter especial #');

// Nome Completo (mínimo 2 palavras)
assert(validarNomeCompleto('Carlos Eduardo'), 'Nome completo com duas palavras');
assert(validarNomeCompleto('  Ana Maria de Souza  '), 'Nome completo com espaços nas pontas e preposição');
assert(!validarNomeCompleto('Carlos'), 'Rejeita nome com apenas uma palavra');
assert(!validarNomeCompleto('   '), 'Rejeita nome vazio');
assert(!validarNomeCompleto('Carlos 123'), 'Rejeita nome com número');

// Nome social
assert(validarNomeSocial('Eduarda'), 'Nome social com uma palavra permitido');
assert(validarNomeSocial('Eduarda Silva'), 'Nome social com duas palavras');
assert(validarNomeSocial(''), 'Nome social vazio permitido (opcional)');
assert(!validarNomeSocial('Eduarda 2026'), 'Rejeita nome social com números');

console.log('--- TESTES 2: Documentos Pessoais ---');
// CPF: Estrito 000.000.000-00 e dígito verificador real
// Gerando ou testando CPFs matematicamente válidos
// Exemplo de CPF válido conhecido: 529.982.247-25, 000.000.000-00 é rejeitado por dígitos repetidos
assert(validarCpf('529.982.247-25'), 'Aceita CPF válido no formato 000.000.000-00');
assert(!validarCpf('52998224725'), 'Rejeita CPF sem máscara estrita');
assert(!validarCpf('529.982.247-00'), 'Rejeita CPF com dígito verificador inválido');
assert(!validarCpf('111.111.111-11'), 'Rejeita CPF com todos dígitos iguais');
assert(!validarCpf('529.982.247-255'), 'Rejeita CPF com tamanho irregular');

// RG: Condicional (Possibilidade A: RG Tradicional OU Possibilidade B: Novo RG/CIN)
assert(validarRg('12.345.678-9'), 'Possibilidade A: RG Tradicional 00.000.000-0');
assert(validarRg('12.345.678-X'), 'Possibilidade A: RG Tradicional com dígito X');
assert(validarRg('12.345.678-x'), 'Possibilidade A: RG Tradicional com dígito x minúsculo');
assert(validarRg('529.982.247-25'), 'Possibilidade B: Novo RG/CIN formato 000.000.000-00');
assert(!validarRg('12345'), 'Rejeita RG em formato fora do padrão');
assert(!validarRg('12.345-0'), 'Rejeita RG incompleto');

// Título de Eleitor: 12 dígitos
assert(validarTituloEleitor('1234 5678 9012'), 'Aceita título eleitor com máscara de 12 dígitos');
assert(validarTituloEleitor('123456789012'), 'Aceita título eleitor apenas números com 12 dígitos');
assert(!validarTituloEleitor('12345678901'), 'Rejeita título eleitor com 11 dígitos');
assert(!validarTituloEleitor('1234567890123'), 'Rejeita título eleitor com 13 dígitos');
assert(!validarTituloEleitor('1234 5678 901A'), 'Rejeita título eleitor com letras');

// Certidão: Número do Termo, somente números, sem quantidade fixa
const certidao32 = '12345601552023100001123000000123';
assert(validarCertidaoMatricula(certidao32), 'Aceita termo com 32 dígitos');
assert(validarCertidaoMatricula('12485'), 'Aceita termo com poucos dígitos');
assert(validarCertidaoMatricula('7'), 'Aceita termo com 1 dígito');
assert(!validarCertidaoMatricula('123A45'), 'Rejeita termo com letras');
assert(!validarCertidaoMatricula('123.456-7'), 'Rejeita termo com símbolos');

console.log('--- TESTES 3: Datas e Calendário Real ---');
// Formato DD/MM/AAAA e checagem de dias inexistentes
assert(validarDataCalendario('15/03/2005'), 'Aceita data válida 15/03/2005');
assert(validarDataCalendario('28/02/2026'), 'Aceita 28/02/2026');
assert(!validarDataCalendario('30/02/2026'), 'Bloqueia dia inexistente 30/02/2026');
assert(!validarDataCalendario('31/04/2026'), 'Bloqueia dia inexistente 31/04/2026 (abril tem 30 dias)');
assert(!validarDataCalendario('31/06/2026'), 'Bloqueia dia inexistente 31/06/2026 (junho tem 30 dias)');
assert(!validarDataCalendario('31/09/2026'), 'Bloqueia dia inexistente 31/09/2026 (setembro tem 30 dias)');
assert(!validarDataCalendario('31/11/2026'), 'Bloqueia dia inexistente 31/11/2026 (novembro tem 30 dias)');
assert(validarDataCalendario('29/02/2024'), 'Aceita 29/02 em ano bissexto (2024)');
assert(!validarDataCalendario('29/02/2025'), 'Bloqueia 29/02 em ano não bissexto (2025)');
assert(!validarDataCalendario('2005-03-15'), 'Bloqueia formato fora de DD/MM/AAAA');

console.log('--- TESTES 4: Endereço e Dados Complementares ---');
// CEP
assert(validarCep('21341-240'), 'Aceita CEP formato 00000-000');
assert(!validarCep('21341240'), 'Rejeita CEP sem traço');
assert(!validarCep('2134-240'), 'Rejeita CEP incompleto');

// UF
assert(validarUf('RJ'), 'Aceita UF válida RJ');
assert(validarUf('SP'), 'Aceita UF válida SP');
assert(validarUf('MG'), 'Aceita UF válida MG');
assert(!validarUf('XX'), 'Rejeita UF inexistente XX');
assert(!validarUf('rj'), 'Rejeita UF em minúsculas rj');
assert(!validarUf('R1'), 'Rejeita UF com dígitos');

// Zona e Seção
assert(validarZonaEleitoral('045'), 'Aceita Zona eleitoral com 3 dígitos');
assert(!validarZonaEleitoral('45'), 'Rejeita Zona eleitoral com 2 dígitos');
assert(!validarZonaEleitoral('0045'), 'Rejeita Zona eleitoral com 4 dígitos');

assert(validarSecaoEleitoral('0123'), 'Aceita Seção eleitoral com 4 dígitos');
assert(!validarSecaoEleitoral('123'), 'Rejeita Seção eleitoral com 3 dígitos');
assert(!validarSecaoEleitoral('01234'), 'Rejeita Seção eleitoral com 5 dígitos');

console.log('--- TESTES 5: Validador Integrado de Payload ---');
const payloadValido = {
  nome_completo: '  Carlos Eduardo da Conceição  ',
  nome_social: 'Eduardo Conceição',
  cpf: '529.982.247-25',
  rg: '12.345.678-9',
  data_nascimento: '15/05/2004',
  titulo_eleitor: '1234 5678 9012',
  titulo_zona: '045',
  titulo_secao: '0123',
  certidao_matricula: certidao32,
  cep: '21341-240',
  uf: 'RJ'
};

const resOk = sanitizarEValidarCadastroEscolar(payloadValido);
assert(resOk.valido, 'Payload completo válido aprovado com sucesso');
assert(resOk.dadosSanitizados.nome_completo === 'Carlos Eduardo da Conceição', 'Sanitização trim aplicada');

const payloadComErros = {
  nome_completo: 'Carlos 123',
  cpf: '12345678900',
  rg: 'errado',
  data_nascimento: '30/02/2026',
  cep: '21341240',
  uf: 'XX',
  titulo_zona: '12',
  titulo_secao: '12'
};

const resErr = sanitizarEValidarCadastroEscolar(payloadComErros);
assert(!resErr.valido, 'Payload inválido rejeitado com sucesso');
assert(resErr.erros.length >= 7, `Capturou múltiplos erros específicos (${resErr.erros.length} erros detectados)`);

console.log('\n=======================================');
console.log(`TOTAL DE TESTES: ${passed + failed}`);
console.log(`PASSOU: ${passed}`);
console.log(`FALHOU: ${failed}`);
console.log('=======================================');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✓ TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!\n');
}
