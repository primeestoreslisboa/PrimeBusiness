/**
 * Desmembramento por técnico externo: quando outro técnico é deslocado,
 * fica com uma percentagem do orçamento (default 50%) + o custo de material.
 * Uso: node --env-file=.env scripts/db-tecnico-externo.mjs
 */
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const run = async (label, query) => { try { await query; console.log(`  ✅ ${label}`); } catch (e) { console.log(`  ❌ ${label} — ${e.message}`); } };

await run('Campo tecnico_externo', sql`ALTER TABLE orcamentos_diretos ADD COLUMN IF NOT EXISTS tecnico_externo VARCHAR(255)`);
await run('Campo tecnico_percent', sql`ALTER TABLE orcamentos_diretos ADD COLUMN IF NOT EXISTS tecnico_percent DECIMAL(5,2) DEFAULT 50`);
console.log('✅ Migração concluída.');
