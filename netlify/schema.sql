-- Run this to initialize the database
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'tecnico',
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

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
  cancel_reason TEXT,
  paid_at TIMESTAMP,
  payment_method VARCHAR(50),
  payment_amount DECIMAL(10,2),
  tecnico_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
ALTER TABLE chamados ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE chamados ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;
ALTER TABLE chamados ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE chamados ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(10,2);

CREATE TABLE IF NOT EXISTS servicos (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  descricao TEXT,
  preco DECIMAL(10,2) NOT NULL,
  unidade VARCHAR(50) DEFAULT 'unidade',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chamado_servicos (
  id SERIAL PRIMARY KEY,
  chamado_id INTEGER REFERENCES chamados(id) ON DELETE CASCADE,
  orcamento_id INTEGER REFERENCES orcamentos(id) ON DELETE CASCADE,
  servico_id INTEGER REFERENCES servicos(id),
  quantidade INTEGER DEFAULT 1,
  preco_unitario DECIMAL(10,2) NOT NULL,
  observacao TEXT
);

ALTER TABLE chamado_servicos ADD COLUMN IF NOT EXISTS orcamento_id INTEGER REFERENCES orcamentos(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS orcamentos (
  id SERIAL PRIMARY KEY,
  chamado_id INTEGER REFERENCES chamados(id) ON DELETE CASCADE,
  total DECIMAL(10,2) NOT NULL,
  include_iva BOOLEAN DEFAULT false,
  iva_rate DECIMAL(5,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pendente',
  enviado_via VARCHAR(50),
  enviado_at TIMESTAMP,
  aceite_token VARCHAR(120) UNIQUE,
  aceite_at TIMESTAMP,
  mbway_order_id VARCHAR(40),
  mbway_request_id VARCHAR(80),
  mbway_reference VARCHAR(80),
  mbway_status VARCHAR(30),
  mbway_phone VARCHAR(30),
  mbway_amount DECIMAL(10,2),
  mbway_requested_at TIMESTAMP,
  mbway_paid_at TIMESTAMP,
  mbway_last_check_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS include_iva BOOLEAN DEFAULT false;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS iva_rate DECIMAL(5,2) DEFAULT 0;
UPDATE orcamentos SET iva_rate = 0 WHERE iva_rate IS NULL;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS aceite_token VARCHAR(120) UNIQUE;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS aceite_at TIMESTAMP;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS mbway_order_id VARCHAR(40);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS mbway_request_id VARCHAR(80);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS mbway_reference VARCHAR(80);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS mbway_status VARCHAR(30);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS mbway_phone VARCHAR(30);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS mbway_amount DECIMAL(10,2);
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS mbway_requested_at TIMESTAMP;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS mbway_paid_at TIMESTAMP;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS mbway_last_check_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO app_settings (key, value, updated_at)
VALUES ('mbway_enabled', 'false', NOW())
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value, updated_at)
VALUES
  ('payment_cash_enabled', 'true', NOW()),
  ('payment_bank_transfer_enabled', 'false', NOW()),
  ('payment_bank_iban', '', NOW()),
  ('payment_mbway_phone_enabled', 'false', NOW()),
  ('payment_mbway_phone', '', NOW()),
  ('iva_rate', '23', NOW()),
  ('booking_notify_emails', 'edward.carvalho@gmail.com', NOW()),
  ('booking_notify_whatsapp_numbers', '911831978', NOW()),
  ('booking_notify_whatsapp_callmebot_apikey', '', NOW())
ON CONFLICT (key) DO NOTHING;

-- Seed: default admin user (password: admin123 - CHANGE IN PRODUCTION)
-- password hash for "admin123"
INSERT INTO users (email, password_hash, name, role)
VALUES ('Edward', '$2a$12$rgOolbtKNqYCtyme6F2VnexCWbMevMawJ/NZu2i.NEvnzx7YNejru', 'Administrador', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Seed: sample services
INSERT INTO servicos (nome, descricao, preco, unidade) VALUES
  ('Visita Técnica', 'Deslocação e diagnóstico', 35.00, 'visita'),
  ('Instalação de Equipamento', 'Instalação de equipamento fornecido pelo cliente', 50.00, 'unidade'),
  ('Reparação Geral', 'Reparação de equipamentos elétricos/eletrónicos', 45.00, 'hora'),
  ('Cablagem', 'Instalação de cabos (por metro)', 3.50, 'metro'),
  ('Tomada / Interruptor', 'Substituição ou instalação', 25.00, 'unidade')
ON CONFLICT DO NOTHING;
