/**
 * Cria as tabelas para orçamentos diretos (avulsos), independentes de chamados.
 * Uso: node --env-file=.env scripts/db-orcamentos-diretos.mjs
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

await run('Tabela orcamentos_diretos', sql`
  CREATE TABLE IF NOT EXISTS orcamentos_diretos (
    id SERIAL PRIMARY KEY,
    numero VARCHAR(40),
    cliente_nome VARCHAR(255) NOT NULL,
    cliente_nif VARCHAR(50),
    cliente_morada VARCHAR(500),
    cliente_codigo_postal VARCHAR(20),
    cliente_localidade VARCHAR(255),
    cliente_telefone VARCHAR(50),
    cliente_email VARCHAR(255),
    validade_dias INTEGER DEFAULT 30,
    observacoes TEXT,
    include_iva BOOLEAN DEFAULT true,
    iva_rate DECIMAL(5,2) DEFAULT 23,
    subtotal DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'rascunho',
    public_token VARCHAR(120) UNIQUE,
    enviado_via VARCHAR(50),
    enviado_at TIMESTAMP,
    chamado_id INTEGER REFERENCES chamados(id),
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )
`);

await run('Tabela orcamento_direto_itens', sql`
  CREATE TABLE IF NOT EXISTS orcamento_direto_itens (
    id SERIAL PRIMARY KEY,
    orcamento_id INTEGER REFERENCES orcamentos_diretos(id) ON DELETE CASCADE,
    descricao VARCHAR(500) NOT NULL,
    quantidade DECIMAL(10,2) DEFAULT 1,
    preco_unitario DECIMAL(10,2) NOT NULL DEFAULT 0,
    ordem INTEGER DEFAULT 0
  )
`);

await run('Índice itens por orçamento', sql`
  CREATE INDEX IF NOT EXISTS idx_orc_direto_itens_orc
  ON orcamento_direto_itens (orcamento_id)
`);

// FK chamado_id: apagar um chamado deve apenas desligar o orçamento (SET NULL),
// não bloquear a remoção do chamado.
await run('FK chamado_id ON DELETE SET NULL', sql`
  ALTER TABLE orcamentos_diretos
  DROP CONSTRAINT IF EXISTS orcamentos_diretos_chamado_id_fkey
`);
await run('Recriar FK chamado_id (SET NULL)', sql`
  ALTER TABLE orcamentos_diretos
  ADD CONSTRAINT orcamentos_diretos_chamado_id_fkey
  FOREIGN KEY (chamado_id) REFERENCES chamados(id) ON DELETE SET NULL
`);

const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
console.log(`\n📋 Tabelas na BD: ${tables.map(t => t.tablename).join(', ')}`);
console.log('\n✅ Migração concluída.');
