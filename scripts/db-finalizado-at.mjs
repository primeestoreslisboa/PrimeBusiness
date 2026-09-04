/**
 * Regista a data de finalização do orçamento (quando o agendamento é concluído).
 * O relatório passa a classificar por esta data em vez da data de criação.
 * Uso: node --env-file=.env scripts/db-finalizado-at.mjs
 */
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const run = async (label, query) => { try { await query; console.log(`  ✅ ${label}`); } catch (e) { console.log(`  ❌ ${label} — ${e.message}`); } };

await run('Campo finalizado_at', sql`ALTER TABLE orcamentos_diretos ADD COLUMN IF NOT EXISTS finalizado_at TIMESTAMP`);
// Backfill: para os já finalizados sem data, usa updated_at (ou created_at) como aproximação.
const r = await sql`
  UPDATE orcamentos_diretos
  SET finalizado_at = COALESCE(updated_at, created_at)
  WHERE status = 'finalizado' AND finalizado_at IS NULL
  RETURNING id
`;
console.log(`  ✅ Backfill em ${r.length} orçamento(s) finalizado(s).`);
console.log('✅ Migração concluída.');
