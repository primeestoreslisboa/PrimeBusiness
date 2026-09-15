import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
const run = async (label, q) => { try { await q; console.log('  OK', label); } catch (e) { console.log('  ERRO', label, e.message); } };
await run('coluna margem_pct', sql`ALTER TABLE servicos ADD COLUMN IF NOT EXISTS margem_pct DECIMAL(6,2) DEFAULT 250`);
// Backfill: preserva o preco atual -> margem = preco/custo*100 (quando ha custo); senao 250 (margem global atual).
const r = await sql`
  UPDATE servicos
  SET margem_pct = CASE
    WHEN custo IS NOT NULL AND custo > 0 THEN ROUND(preco / custo * 100, 2)
    ELSE 250
  END
  RETURNING id, nome, custo, preco, margem_pct
`;
console.log('Backfill:', JSON.stringify(r.map(x=>({id:x.id,margem:x.margem_pct}))));
