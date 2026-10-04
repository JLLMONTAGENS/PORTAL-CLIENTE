# Backend da homologação

A branch `homologacao` agora possui a base para a API da mensageria:

- `api/health.js` testa se a função da Vercel consegue acessar o PostgreSQL.
- `database/schema.sql` cria as tabelas `usuarios_atendimento`, `montadores`, `atendimentos`, `mensagens`, `anexos_mensagem` e `eventos_atendimento`.
- A regra de banco `atendimentos_um_aberto_por_telefone` impede dois atendimentos não encerrados para o mesmo telefone.

Se o schema original em inglês já foi executado, use `database/migracao-nomes-portugues.sql` uma única vez. A migração renomeia as tabelas e preserva os dados.

Os status oficiais são `PENDENTE`, `GEROU_ORCAMENTO`, `ATRIBUIDO_MONTADOR` e `SERVICO_FINALIZADO`.

## Primeira configuração

1. Execute `database/schema.sql` no SQL Editor do projeto Neon.
2. Faça commit e push da branch `homologacao`.
3. Após o deploy, abra `/api/health` na URL de preview da Vercel.
4. O resultado esperado é `{"ok":true,"database":true}`.

As credenciais continuam apenas nas variáveis da Vercel. Nunca coloque a URL do banco em arquivos públicos ou no repositório.

## Evolução de usuários e orçamentos

Para uma base que já está em uso, execute `database/migracao-usuarios-orcamentos.sql` antes de publicar esta versão. A migração:

- preserva os usuários existentes e usa o e-mail atual como login inicial;
- acrescenta nome de exibição e nome completo;
- cria a tabela de orçamentos vinculada ao atendimento;
- pode ser executada novamente sem duplicar estruturas.

Depois da migração, o administrador pode ajustar o login e os demais dados pelo menu **Usuários** do painel.

## Gestão financeira dos orçamentos

Em uma base já existente, execute `database/migracao-gestao-orcamentos.sql` antes de publicar a versão com o menu **Orçamentos**. A migração:

- converte `valor_centavos` para `valor NUMERIC(18,2)`, preservando `50000` como `500.00`;
- converte `valor_servico_centavos` para `valor_servico NUMERIC(18,2)`;
- adiciona os status do orçamento, do pagamento do cliente e do pagamento do montador;
- adiciona repasse calculado, adicional do montador e percentual de repasse no cadastro do montador;
- prepara os campos de provedor, identificador externo e link de pagamento.
- registra separadamente as datas de inclusão, finalização, alteração do montador e pagamento do montador;
- cria a tabela `configuracoes_pagamento` para Mercado Pago, PagBank/PagSeguro e Rede.

Os status financeiros são:

- orçamento: `GERADO`, `MONTADOR_ATRIBUIDO`, `FINALIZADO`;
- pagamento do cliente: `PENDENTE`, `PAGO`;
- pagamento do montador: `PENDENTE`, `PAGO`.

Para futuras integrações, configure `PAYMENT_WEBHOOK_SECRET`. O endpoint `POST /api/payments/confirm` aceita confirmações autenticadas pelo cabeçalho `x-jll-payment-secret`. Ao receber `status: "PAGO"`, ele marca o pagamento do cliente e finaliza o atendimento de forma idempotente.

## Configuração dos meios de pagamento

Além de `PAYMENT_WEBHOOK_SECRET`, configure na Vercel a variável privada `PAYMENT_CONFIG_ENCRYPTION_KEY` com pelo menos 32 caracteres aleatórios. Ela é usada para criptografar tokens e chaves com AES-256-GCM antes de gravá-los no banco. Não troque essa variável sem antes migrar as credenciais já armazenadas.

Depois de executar `database/migracao-gestao-orcamentos.sql`, o administrador terá o menu **Pagamentos** para:

- escolher homologação ou produção;
- ativar Mercado Pago, PagBank/PagSeguro ou Rede;
- informar credenciais e URLs de retorno/notificação;
- testar as credenciais sem criar uma cobrança;
- indicar o uso de 3DS quando o fluxo e o contrato do provedor permitirem.

Mercado Pago e PagBank usam checkout hospedado e podem gerar o link diretamente na gestão do orçamento. O valor permanece no banco como `NUMERIC(18,2)`; a conversão para centavos exigida pelo PagBank acontece somente na chamada externa.

A Rede utiliza checkout direto. A conexão OAuth pode ser cadastrada e testada, mas a captura de cartão deve permanecer desabilitada até a conclusão do credenciamento, da certificação e dos requisitos PCI/3DS junto à adquirente. O sistema não armazena dados de cartão.

Configure as URLs públicas de notificação como:

- Mercado Pago: `https://SEU-DOMINIO/api/payments/mercado-pago`;
- PagBank: `https://SEU-DOMINIO/api/payments/pagbank`.

As rotas consultam novamente a API do provedor antes de confirmar o pagamento. No Mercado Pago, quando o segredo de webhook estiver cadastrado, a assinatura `x-signature` também é validada. Somente os estados `approved` (Mercado Pago) e `PAID` (PagBank) finalizam o atendimento.

O endpoint genérico `POST /api/payments/confirm` continua disponível para a confirmação assinada por um intermediário confiável. Antes da entrada em produção, execute a homologação completa com credenciais reais de sandbox e depois de produção.
