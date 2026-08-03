/**
 * Cria a tabela de faturas de compra de material associadas a um orçamento.
 * Preenchimento manual dos campos: número da fatura, fornecedor, data de compra e valor total.
 * Uso: node --env-file=.env scripts/db-orcamento-faturas.mjs
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

await run('Tabela orcamento_faturas', sql`
  CREATE TABLE IF NOT EXISTS orcamento_faturas (
    id SERIAL PRIMARY KEY,
    orcamento_id INTEGER REFERENCES orcamentos_diretos(id) ON DELETE CASCADE,
    numero_fatura VARCHAR(120),
    fornecedor VARCHAR(255),
    data_compra DATE,
    valor_total DECIMAL(10,2) DEFAULT 0,
    ordem INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await run('Índice faturas por orçamento', sql`
  CREATE INDEX IF NOT EXISTS idx_orc_faturas_orc
  ON orcamento_faturas (orcamento_id)
`);

const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
console.log(`\n📋 Tabelas na BD: ${tables.map(t => t.tablename).join(', ')}`);
console.log('\n✅ Migração concluída.');
