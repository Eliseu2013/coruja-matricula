/**
 * Define (ou redefine) a senha de um perfil da equipe direto no banco local.
 * Uso: npm run definir-senha -- <login> <nova-senha>
 * Exemplo: npm run definir-senha -- admin "MinhaSenhaForte#2026"
 *
 * Existe porque o sistema não tem mais senha padrão: cada perfil nasce com uma senha
 * aleatória (exibida uma vez no console) e este comando permite escolher a definitiva.
 */
import { findUserByLogin, createOrUpdateUsuario, incrementarVersaoSessaoUsuario, initDB } from '../db.js';
import { senhaPermitida, SENHA_MIN_EQUIPE } from '../auth.js';

const [login, novaSenha] = process.argv.slice(2);

if (!login || !novaSenha) {
  console.error('Uso: npm run definir-senha -- <login> <nova-senha>');
  process.exit(1);
}
if (!senhaPermitida(novaSenha, SENHA_MIN_EQUIPE)) {
  console.error(`A senha deve ter pelo menos ${SENHA_MIN_EQUIPE} caracteres e não pode ser uma senha óbvia.`);
  process.exit(1);
}

await initDB();
const usuario = await findUserByLogin(login);
if (!usuario || /aluno|candidato/i.test(usuario.cargo || '')) {
  console.error(`Perfil da equipe "${login}" não encontrado.`);
  process.exit(1);
}
await createOrUpdateUsuario({
  login: usuario.login,
  nome: usuario.nome,
  senha: novaSenha,
  cargo: usuario.cargo,
  email: usuario.email
});
// Senha nova: quem estava logado com a senha antiga precisa entrar de novo
await incrementarVersaoSessaoUsuario(usuario.id);
console.log(`✅ Senha do perfil "${usuario.login}" atualizada. Sessões abertas foram encerradas.`);
process.exit(0);
