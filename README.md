# DCP — Controle de Empresas

Sistema independente para controle de órgãos públicos, empenhos e pagamentos da DCP.

## Objetivo

Controlar empenhos vinculados a órgãos públicos, registrar solicitações e pagamentos com anexos, acompanhar saldos e manter histórico mensal e financeiro auditável.

## Arquitetura

- **Frontend:** aplicação web responsiva, hospedada no Cloudflare Pages.
- **Banco de dados:** Supabase PostgreSQL.
- **Autenticação:** Supabase Auth.
- **Arquivos:** Supabase Storage em bucket privado, com acesso autorizado.
- **Código:** este repositório GitHub.

## Módulos da primeira versão

1. Painel geral.
2. Cadastro de órgãos públicos, cada um com sua própria área/aba.
3. Cadastro de empenhos por órgão.
4. Lançamentos de solicitações e pagamentos, com anexos PDF/imagem.
5. Histórico mensal e trilha de auditoria.
6. Cálculo configurável de percentual e base de cálculo por empenho.

## Regras financeiras

- Cada empenho possui seu próprio valor original e saldo; empenhos e órgãos nunca compartilham saldo.
- O percentual é configurável por empenho e pode mudar durante a vigência.
- A base de cálculo pode ser o valor original do empenho ou o valor de cada pedido.
- O modo de abatimento pode ser o valor integral do pedido ou o valor líquido após a parcela percentual.
- Cada lançamento guarda uma fotografia dos parâmetros e cálculos utilizados no momento do registro. Alterações futuras não reescrevem lançamentos anteriores.
- Solicitação e pagamento são estados distintos. Solicitações pendentes não devem ser tratadas como pagamentos confirmados.
- Mudanças financeiras relevantes devem gerar histórico de auditoria.
- O sistema deve validar saldo no servidor/banco, não apenas na interface.

## Configuração local

As variáveis de ambiente devem ser configuradas localmente e no ambiente de publicação, nunca commitadas:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Nunca expor a `service_role` key no frontend. Usar políticas RLS e buckets privados para proteger dados e documentos.

## Implementado no repositório

- Aplicação React + Vite responsiva.
- Login por Supabase Auth.
- Cadastro de órgãos públicos.
- Área individual por órgão.
- Cadastro de empenhos com regra financeira inicial.
- Configuração de percentual, base de cálculo, modo de abatimento e política de saldo.
- Registro de solicitações com anexos PDF/imagem.
- Versionamento de regras por empenho.
- Confirmação de pagamento com validação do saldo no banco.
- Visualização de saldos, solicitações pendentes e histórico.
- Bucket privado para anexos e cabeçalhos básicos de segurança.
- Workflow de build no GitHub Actions.

## Implantação e estado

Siga [docs/IMPLANTACAO.md](docs/IMPLANTACAO.md) para criar o projeto Supabase, aplicar as migrações SQL e publicar no Cloudflare Pages.

O código e os scripts foram adicionados ao repositório, mas a aplicação ainda depende da criação/configuração do projeto Supabase e do Cloudflare. O build precisa ser confirmado pelo workflow do GitHub antes de considerar esta versão validada. Não use dados reais de produção até validar as migrações, permissões RLS, anexos e cálculos financeiros.
