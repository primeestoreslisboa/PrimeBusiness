/**
 * Cria a tabela de folgas: um dia inteiro bloqueado (sem marcações públicas).
 * Uso: node --env-file=.env scripts/db-folgas.mjs
 */
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const run = async (label, query) => { try { await query; console.log(`  ✅ ${label}`); } catch (e) { console.log(`  ❌ ${label} — ${e.message}`); } };

await run('Tabela folgas', sql`
  CREATE TABLE IF NOT EXISTS folgas (
    data DATE PRIMARY KEY,
    motivo TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`);

console.log('✅ Migração concluída.');
