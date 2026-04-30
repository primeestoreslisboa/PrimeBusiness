/**
 * Insere dados iniciais (admin + serviços).
 * Uso: npm run db:seed
 */
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const sql = neon(process.env.DATABASE_URL);

console.log('🌱 A inserir dados iniciais...\n');

// Admin user
const password = 'admin123';
const hash = await bcrypt.hash(password, 12);
await sql`
  INSERT INTO users (email, password_hash, name, role)
  VALUES ('admin@primebussines.pt', ${hash}, 'Administrador', 'admin')
  ON CONFLICT (email) DO UPDATE SET password_hash = ${hash}
`;
console.log(`  ✅ Utilizador admin criado`);
console.log(`     Email:  admin@primebussines.pt`);
console.log(`     Senha:  ${password}  ← alterar após primeiro login!\n`);

// Serviços
const servicos = [
  { nome: 'Visita Técnica',           descricao: 'Deslocação e diagnóstico',                           preco: 35.00, unidade: 'visita'  },
  { nome: 'Instalação de Equipamento',descricao: 'Instalação de equipamento fornecido pelo cliente',   preco: 50.00, unidade: 'unidade' },
  { nome: 'Reparação Geral',          descricao: 'Reparação de equipamentos elétricos/eletrónicos',    preco: 45.00, unidade: 'hora'    },
  { nome: 'Cablagem',                 descricao: 'Instalação de cabos',                                preco:  3.50, unidade: 'metro'   },
  { nome: 'Tomada / Interruptor',     descricao: 'Substituição ou instalação',                         preco: 25.00, unidade: 'unidade' },
  { nome: 'Disjuntor',                descricao: 'Substituição de disjuntor',                          preco: 40.00, unidade: 'unidade' },
  { nome: 'Quadro Elétrico',          descricao: 'Instalação ou reparação de quadro elétrico',         preco: 80.00, unidade: 'hora'    },
];

for (const s of servicos) {
  await sql`
    INSERT INTO servicos (nome, descricao, preco, unidade)
    SELECT ${s.nome}, ${s.descricao}, ${s.preco}, ${s.unidade}
    WHERE NOT EXISTS (SELECT 1 FROM servicos WHERE nome = ${s.nome})
  `;
  console.log(`  ✅ Serviço: ${s.nome.padEnd(28)} €${s.preco.toFixed(2)}/${s.unidade}`);
}

console.log('\n✅ Seed concluído!');
