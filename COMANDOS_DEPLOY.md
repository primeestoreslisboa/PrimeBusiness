# Comandos de Execucao e Deploy

Este ficheiro serve apenas como lembrete rapido dos comandos mais usados neste projeto.

## Instalar dependencias

```bash
npm install
```

## Correr a aplicacao localmente

Servidor de desenvolvimento normal:

```bash
npm run dev
```

Se o frontend arrancar estranho, sem CSS, ou com cache do Vite:

```bash
npm run dev:clean
```

Porta local esperada:

```text
http://localhost:4300
```

## Base de dados

Criar/inicializar tabelas:

```bash
npm run db:init
```

Inserir dados iniciais:

```bash
npm run db:seed
```

Credenciais admin criadas pelo seed:

```text
Email: Edward
Senha: 96460021(com@)
```

## Build local

Gerar build de producao:

```bash
npm run build
```

Testar a build localmente:

```bash
npm run preview
```

Porta de preview:

```text
http://localhost:4301
```

## Deploy na Netlify

Este projeto esta preparado para Netlify e usa o adapter `@astrojs/netlify`.

Build command:

```bash
npm run build
```

Publish directory:

```text
dist
```

Se usares Netlify CLI para deploy manual:

```bash
netlify deploy --build
```

Sem Netlify CLI instalada globalmente, usa:

```bash
npx netlify deploy --build
```

Deploy para producao:

```bash
netlify deploy --build --prod
```

Sem install global:

```bash
npx netlify deploy --build --prod
```

Resumo rapido:

```text
Usa `netlify ...` se ja tiveres netlify-cli instalada globalmente.
Usa `npx netlify ...` se quiseres correr a CLI sem instalar globalmente.
```

## Variaveis de ambiente

Copiar a base de:

```bash
.env.example
```

Variaveis importantes:

```text
DATABASE_URL
JWT_SECRET
PUBLIC_SITE_URL
PUBLIC_AGENDAMENTO_URL
EMAIL_USER / EMAIL_PASS (ou o setup de email que estiveres a usar no momento)
MBWAY_IFTHENPAY_KEY
MBWAY_CALLBACK_ANTI_PHISHING_KEY
```

Na Netlify, estas variaveis devem existir no painel do site antes do deploy.