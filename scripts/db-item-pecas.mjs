/** Adiciona o nº de peças aos itens do orçamento (para m²: total = L×A×peças). */
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const run = async (label, query) => { try { await query; console.log(`  ✅ ${label}`); } catch (e) { console.log(`  ❌ ${label} — ${e.message}`); } };
await run('Campo itens.pecas', sql`ALTER TABLE orcamento_direto_itens ADD COLUMN IF NOT EXISTS pecas INTEGER DEFAULT 1`);
console.log('✅ Migração concluída.');
