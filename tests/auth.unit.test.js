/**
 * Testes unitários das regras de senha e de perfil (auth.js).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { senhaPermitida, isCargoAluno, SENHA_MIN_EQUIPE, SENHA_MIN_ALUNO } from '../auth.js';

test('senhaPermitida: respeita tamanho mínimo da equipe e do candidato', () => {
  assert.equal(senhaPermitida('abc12', SENHA_MIN_ALUNO), false);
  assert.equal(senhaPermitida('abc123', SENHA_MIN_ALUNO), true);
  assert.equal(senhaPermitida('abc1234', SENHA_MIN_EQUIPE), false);
  assert.equal(senhaPermitida('abc12345', SENHA_MIN_EQUIPE), true);
});

test('senhaPermitida: bloqueia a antiga senha padrão e senhas óbvias', () => {
  assert.equal(senhaPermitida('faeterj2026', SENHA_MIN_EQUIPE), false);
  assert.equal(senhaPermitida('FAETERJ2026', SENHA_MIN_EQUIPE), false);
  assert.equal(senhaPermitida('12345678', SENHA_MIN_EQUIPE), false);
});

test('senhaPermitida: rejeita vazio, nulo e textos gigantes', () => {
  assert.equal(senhaPermitida('', SENHA_MIN_ALUNO), false);
  assert.equal(senhaPermitida(null, SENHA_MIN_ALUNO), false);
  assert.equal(senhaPermitida('a'.repeat(129), SENHA_MIN_ALUNO), false);
});

test('isCargoAluno: diferencia candidato de equipe', () => {
  assert.equal(isCargoAluno('Candidato / Aluno'), true);
  assert.equal(isCargoAluno('Super Administrador'), false);
  assert.equal(isCargoAluno('Gestor da Secretaria Acadêmica'), false);
  assert.equal(isCargoAluno(undefined), false);
});
