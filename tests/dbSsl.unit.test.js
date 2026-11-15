/**
 * V7: opções de TLS da conexão com o PostgreSQL.
 * Antes, em produção, o certificado do banco nunca era conferido (rejectUnauthorized: false).
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let opcoesSslPostgres;
before(async () => {
  // db.js cria a pasta de dados ao carregar: usa uma pasta temporária, nunca a data/ real
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'coruja-ssl-'));
  delete process.env.DATABASE_URL;
  ({ opcoesSslPostgres } = await import('../db.js'));
});

test('V7: produção confere o certificado do banco por padrão', () => {
  const ssl = opcoesSslPostgres({ NODE_ENV: 'production' });
  assert.equal(ssl.rejectUnauthorized, true);
});

test('V7: produção usa o certificado CA informado', () => {
  const ssl = opcoesSslPostgres({ NODE_ENV: 'production', DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\nX\n-----END CERTIFICATE-----' });
  assert.equal(ssl.rejectUnauthorized, true);
  assert.match(ssl.ca, /BEGIN CERTIFICATE/);
});

test('V7: só desliga a conferência quando DATABASE_SSL_INSECURE=1', () => {
  assert.equal(opcoesSslPostgres({ NODE_ENV: 'production', DATABASE_SSL_INSECURE: '1' }).rejectUnauthorized, false);
  assert.equal(opcoesSslPostgres({ NODE_ENV: 'production', DATABASE_SSL_INSECURE: 'true' }).rejectUnauthorized, true, 'só o valor exato 1');
});

test('V7: fora de produção não usa TLS (banco local)', () => {
  assert.equal(opcoesSslPostgres({ NODE_ENV: 'development' }), false);
});
