/**
 * Inicializa as tabelas na BD Neon.
 * Uso: npm run db:init
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

await run('Tabela users', sql`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'tecnico',
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await run('Tabela chamados', sql`
  CREATE TABLE IF NOT EXISTS chamados (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    telefone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    morada VARCHAR(500) NOT NULL,
    bairro VARCHAR(255),
    cidade VARCHAR(255) NOT NULL,
    codigo_postal VARCHAR(20),
    descricao TEXT NOT NULL,
    horario_agendado TIMESTAMP NOT NULL,
    status VARCHAR(50) DEFAULT 'pendente',
    tecnico_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )
`);

await run('Tabela servicos', sql`
  CREATE TABLE IF NOT EXISTS servicos (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    preco DECIMAL(10,2) NOT NULL,
    unidade VARCHAR(50) DEFAULT 'unidade',
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await run('Tabela chamado_servicos', sql`
  CREATE TABLE IF NOT EXISTS chamado_servicos (
    id SERIAL PRIMARY KEY,
    chamado_id INTEGER REFERENCES chamados(id) ON DELETE CASCADE,
    servico_id INTEGER REFERENCES servicos(id),
    quantidade INTEGER DEFAULT 1,
    preco_unitario DECIMAL(10,2) NOT NULL,
    observacao TEXT
  )
`);

await run('Tabela orcamentos', sql`
  CREATE TABLE IF NOT EXISTS orcamentos (
    id SERIAL PRIMARY KEY,
    chamado_id INTEGER REFERENCES chamados(id) ON DELETE CASCADE,
    total DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'pendente',
    enviado_via VARCHAR(50),
    enviado_at TIMESTAMP,
    aceite_token VARCHAR(120) UNIQUE,
    aceite_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  )
`);

await run('Campo orcamentos.aceite_token', sql`
  ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS aceite_token VARCHAR(120) UNIQUE
`);

await run('Campo orcamentos.aceite_at', sql`
  ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS aceite_at TIMESTAMP
`);

const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
console.log(`\n📋 Tabelas na BD: ${tables.map(t => t.tablename).join(', ')}`);
console.log('\n✅ BD inicializada com sucesso!');
