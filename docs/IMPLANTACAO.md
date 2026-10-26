# Implantação do DCP

## 1. Banco de dados Supabase

1. Acesse o projeto Supabase correto em https://supabase.com/dashboard.
2. Faça backup antes de alterar um banco com dados existentes.
3. No SQL Editor, confira o histórico de migrações e aplique somente as migrações ainda não executadas, em ordem:
   - `202610260001_initial_schema.sql`
   - `202610260002_private_storage.sql`
   - `202610260003_financial_history_guards.sql`
   - `202610260004_empenho_rpcs_and_balances.sql`
   - `202610260005_balance_validation.sql`
   - `202610260006_balance_policy.sql`
   - `202610260007_serialize_payment_confirmations.sql`
   - `202610260008_orders_and_payments.sql`
   - `202610260009_empenho_items.sql`
4. Verifique cada resultado antes de seguir. Não reaplique scripts não idempotentes sem revisar o conteúdo.
5. Em **Authentication → Users**, crie o usuário inicial. O sistema não oferece cadastro público de usuários.
6. Em **Project Settings → API Keys** (ou **Project Connect**), copie a Project URL e a chave **Publishable**.

> `supabase/manual/implantacao_008_009.sql` é uma alternativa consolidada para implantação manual específica. Não execute esse arquivo além das migrações 008 e 009 sem conferir o estado do banco: ele reaplica mudanças dessas duas versões e pode não substituir todo o histórico de migrações.

## 2. Configurar GitHub Actions e Cloudflare Workers

O repositório usa `wrangler.jsonc` e publica os arquivos de `dist/` como **Cloudflare Worker com Static Assets**. O workflow de CI faz build em pull requests e tenta publicar na branch `main`.

No GitHub, abra **Settings → Secrets and variables → Actions** e configure os seguintes *Repository secrets*:

- `CLOUDFLARE_API_TOKEN`: token com permissão para publicar o Worker existente. A permissão mínima documentada é **Workers Scripts Write**; confira também o escopo da conta e do Worker.
- `CLOUDFLARE_ACCOUNT_ID`: ID da conta Cloudflare que contém o Worker `dcp-controle-de-empenhos`.

O token deve pertencer à conta correta e ter escopo para esse Worker. Não cole o token em issues, logs ou no código. Se o erro do deploy mencionar `assets-upload-session` ou `No access to the specified resource`, o build do Vite pode estar correto, mas o token não tem acesso suficiente ao recurso/conta ou não está autorizado para upload de assets. Confira a permissão **Workers Scripts Write** e o escopo do recurso; para publicar um Worker já existente, a documentação atual também indica o papel **Workers Editor**.

Configure as variáveis de build do Vite no ambiente do workflow se quiser substituir os valores padrão do código:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Variáveis `VITE_*` são incorporadas ao frontend. Nunca coloque uma chave `service_role` ou `sb_secret_...` nelas.

## 3. Rodar localmente (opcional)

1. Instale Node.js 22.
2. Clone o repositório e execute `npm install`.
3. Copie `.env.example` para `.env.local`.
4. Preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Execute `npm run dev` e abra o endereço informado pelo Vite.

A aplicação também aceita `VITE_SUPABASE_ANON_KEY` por compatibilidade. Use apenas uma chave pública com políticas RLS corretamente configuradas.

## 4. Verificações antes de usar dados reais

- Confirmar que as nove migrações foram aplicadas na ordem correta, sem erros, no projeto Supabase certo.
- Criar usuário inicial pelo Supabase Auth e testar login/logout.
- Confirmar cadastro e consulta de órgão.
- Criar empenho com um item e com vários itens; verificar que a soma dos itens corresponde ao valor original.
- Testar pedido de R$ 1.000,00 com acréscimo de 20%: nota fiscal e compromisso do empenho de R$ 1.200,00.
- Testar pagamento independente e pagamento vinculado a pedido; confirmar que o pagamento vinculado não abate o saldo pela segunda vez.
- Confirmar saldo negativo e alertas de excedente, cancelamento e preservação do histórico.
- Confirmar que usuários não autenticados não consultam tabelas nem anexos, e revisar RLS para que usuários autenticados só acessem órgãos autorizados.
- Validar upload/download de anexos no bucket privado.
- Fazer backup e testar restauração antes de armazenar dados financeiros reais.

## 5. Regras financeiras que exigem validação operacional

O sistema guarda snapshots da regra em cada lançamento. O saldo operacional é calculado a partir dos lançamentos e das confirmações no banco. Antes de usar em produção, a DCP deve validar as regras comerciais para base de cálculo, desconto por item, momento de comprometimento do saldo e alterações de percentual. Não considere a implantação validada somente porque o build passou: teste as operações no Supabase de homologação.
