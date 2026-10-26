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

## Estado do projeto

Repositório inicializado com documentação do escopo. A implementação será evoluída por etapas: banco e segurança, interface, fluxo de lançamentos, anexos, relatórios e publicação.
