/**
 * Cria a tabela de despesas gerais (compras sem orçamento associado:
 * material para stock, ferramentas, combustível, rendas, etc.).
 * Uso: node --env-file=.env scripts/db-despesas.mjs
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

await run('Tabela despesas', sql`
  CREATE TABLE IF NOT EXISTS despesas (
    id SERIAL PRIMARY KEY,
    data_despesa DATE NOT NULL,
    descricao VARCHAR(500) NOT NULL,
    fornecedor VARCHAR(255),
    categoria VARCHAR(60) DEFAULT 'Outros',
    valor DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await run('Índice despesas por data', sql`
  CREATE INDEX IF NOT EXISTS idx_despesas_data ON despesas (data_despesa)
`);

await run('Campo numero_fatura', sql`
  ALTER TABLE despesas ADD COLUMN IF NOT EXISTS numero_fatura VARCHAR(120)
`);

const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
console.log(`\n📋 Tabelas na BD: ${tables.map(t => t.tablename).join(', ')}`);
console.log('\n✅ Migração concluída.');
