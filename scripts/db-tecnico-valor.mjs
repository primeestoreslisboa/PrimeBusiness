/** Técnico externo: passa a usar valor fixo (€) em vez de percentagem. */
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const run = async (label, query) => { try { await query; console.log(`  ✅ ${label}`); } catch (e) { console.log(`  ❌ ${label} — ${e.message}`); } };
await run('Campo tecnico_valor', sql`ALTER TABLE orcamentos_diretos ADD COLUMN IF NOT EXISTS tecnico_valor DECIMAL(10,2) DEFAULT 0`);
console.log('✅ Migração concluída.');
