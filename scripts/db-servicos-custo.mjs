/**
 * Adiciona a coluna de custo aos produtos/serviços.
 * O preço de venda passa a ser calculado: custo × (margem/100).
 * Uso: node --env-file=.env scripts/db-servicos-custo.mjs
 */
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
console.log('🔌 A ligar ao Neon...');

const run = async (label, query) => {
  try {
    await query;
    console.log(`  ✅ ${label}`);
  } catch (e) {
    console.log(`  ❌ ${label} — ${e.message}`);
  }
};

await run('Campo servicos.custo', sql`
  ALTER TABLE servicos ADD COLUMN IF NOT EXISTS custo DECIMAL(10,2)
`);

console.log('\n✅ Migração concluída.');
