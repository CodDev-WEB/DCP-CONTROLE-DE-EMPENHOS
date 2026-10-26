# Implantação do DCP

## 1. Criar o projeto Supabase

1. Acesse https://supabase.com/dashboard e crie um projeto independente para o DCP.
2. Escolha uma região adequada para a equipe e guarde a senha do banco em um gerenciador de senhas.
3. No projeto, abra **SQL Editor**.
4. Aplique os arquivos SQL da pasta `supabase/migrations`, na ordem numérica:
   - `202610260001_initial_schema.sql`
   - `202610260002_private_storage.sql`
   - `202610260003_financial_history_guards.sql`
   - `202610260004_empenho_rpcs_and_balances.sql`
   - `202610260005_balance_validation.sql`
   - `202610260006_balance_policy.sql`
5. Verifique se cada script concluiu sem erros.
6. Em **Authentication**, crie o usuário inicial da equipe. O sistema não oferece cadastro público de usuários.
7. Em **Project Connect** ou **Settings → API Keys**, copie a Project URL e a chave **Publishable** (ou a chave legada **anon**, se for o que o projeto disponibilizar).

## 2. Rodar localmente (opcional)

1. Instale Node.js LTS.
2. Clone o repositório e execute `npm install`.
3. Copie `.env.example` para `.env.local`.
4. Preencha:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (pode receber a chave Publishable atual).
5. Execute `npm run dev` e abra o endereço indicado no terminal.

Nunca use uma chave `service_role` ou `sb_secret_...` nas variáveis `VITE_*`; essas variáveis são enviadas ao navegador.

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
   - `VITE_SUPABASE_ANON_KEY` = chave Publishable/anon
6. Salve e faça o deploy.
7. Teste o endereço `.pages.dev` gerado pelo Cloudflare.

O Cloudflare Pages deve reconstruir o site após novos commits na branch de produção.

## 4. Verificações antes de usar dados reais

- Confirmar que as seis migrações foram aplicadas na ordem correta.
- Criar usuário inicial pelo painel Supabase Auth.
- Confirmar login, criação de órgão, criação de empenho, solicitação, anexo e confirmação de pagamento.
- Confirmar que usuários não autenticados não conseguem consultar tabelas nem anexos.
- Restringir as políticas RLS por perfil e órgão antes de adicionar usuários de diferentes organizações.
- Fazer backup e testar restauração antes de armazenar documentos ou dados financeiros de produção.

## Observação sobre os cálculos

O sistema guarda snapshots da regra em cada lançamento. O saldo operacional só é abatido após a confirmação do pagamento. A política do empenho define se uma alteração de percentual preserva o limite operacional inicial ou recalcula o limite pela taxa vigente. A configuração de base de cálculo e modo de abatimento deve ser validada com a regra comercial real da DCP antes do uso em produção.
