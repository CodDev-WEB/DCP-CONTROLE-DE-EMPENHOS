# Implantação do DCP

## 1. Conectar o projeto Supabase

O projeto Supabase do DCP usa a URL e a chave Publishable fornecidas pelo responsável pelo projeto.

1. Acesse https://supabase.com/dashboard e abra o projeto DCP.
2. Em **SQL Editor**, aplique os arquivos SQL da pasta `supabase/migrations`, na ordem numérica:
   - `202610260001_initial_schema.sql`
   - `202610260002_private_storage.sql`
   - `202610260003_financial_history_guards.sql`
   - `202610260004_empenho_rpcs_and_balances.sql`
   - `202610260005_balance_validation.sql`
   - `202610260006_balance_policy.sql`
   - `202610260007_serialize_payment_confirmations.sql`
3. Verifique se cada script concluiu sem erros.
4. Em **Authentication → Users**, crie o usuário inicial da equipe. O sistema não oferece cadastro público de usuários.
5. Em **Project Connect** ou **Settings → API Keys**, copie a Project URL e a chave **Publishable**.

## 2. Rodar localmente (opcional)

1. Instale Node.js LTS.
2. Clone o repositório e execute `npm install`.
3. Copie `.env.example` para `.env.local`.
4. Preencha:
   - `VITE_SUPABASE_URL` = URL do projeto
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = chave Publishable
5. Execute `npm run dev` e abra o endereço indicado no terminal.

A aplicação aceita também a variável legada `VITE_SUPABASE_ANON_KEY`, mas prefira `VITE_SUPABASE_PUBLISHABLE_KEY` para projetos novos.

Nunca use uma chave `service_role` ou `sb_secret_...` em variáveis `VITE_*`; essas variáveis são enviadas ao navegador. A chave Publishable é apropriada para o frontend somente com políticas RLS devidamente configuradas.

## 3. Publicar no Cloudflare Pages

1. Acesse https://dash.cloudflare.com/.
2. Abra **Workers & Pages** → **Create application** → **Pages** → **Import an existing Git repository**.
3. Conecte o GitHub e selecione `CodDev-WEB/DCP-CONTROLE-DE-EMPENHOS`.
4. Configure:
   - Production branch: `main`
   - Build command: `npm run build`
   - Build output directory: `dist`
5. Em **Settings → Environment variables**, configure para Production (e Preview se desejar):
   - `VITE_SUPABASE_URL` = URL do projeto Supabase
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = chave Publishable
6. Salve e faça o deploy.
7. Teste o endereço `.pages.dev` gerado pelo Cloudflare.

O Cloudflare Pages deve reconstruir o site após novos commits na branch de produção.

## 4. Verificações antes de usar dados reais

- Confirmar que as sete migrações foram aplicadas na ordem correta e sem erros.
- Criar usuário inicial pelo painel Supabase Auth.
- Confirmar login, criação de órgão, criação de empenho, solicitação, anexo e confirmação de pagamento.
- Confirmar que usuários não autenticados não conseguem consultar tabelas nem anexos.
- Restringir as políticas RLS por perfil e órgão antes de adicionar usuários de diferentes organizações.
- Fazer backup e testar restauração antes de armazenar documentos ou dados financeiros de produção.

## Observação sobre os cálculos

O sistema guarda snapshots da regra em cada lançamento. O saldo operacional só é abatido após a confirmação do pagamento. A política do empenho define se uma alteração de percentual preserva o limite operacional inicial ou recalcula o limite pela taxa vigente. A configuração de base de cálculo e modo de abatimento deve ser validada com a regra comercial real da DCP antes do uso em produção.
