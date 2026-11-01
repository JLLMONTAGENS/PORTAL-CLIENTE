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

## Aplicativo de atendimento

O painel também disponibiliza uma aplicação web instalável (PWA) para iOS e Android. Ela reutiliza o mesmo login e as mesmas APIs do painel, mas o modo instalado abre somente a operação de **Atendimentos**.

- Android/Chrome: use o botão **Instalar app** exibido no painel ou a opção de instalação do navegador.
- iPhone/iPad/Safari: use **Compartilhar → Adicionar à Tela de Início**.

No aplicativo permanecem disponíveis a fila em tempo real, conversa, anexos, transferência, geração e atualização de orçamento, geração de link de pagamento e finalização. Usuários, gestão geral de orçamentos e configuração de pagamentos continuam exclusivos do navegador.

## Experiência de mensageria

O atendimento segue o comportamento esperado de aplicativos como WhatsApp e Telegram:

- ao enviar, a mensagem aparece imediatamente com o indicador **Enviando…**;
- a confirmação do servidor atualiza apenas a própria mensagem, sem reconstruir a conversa;
- mensagens novas recebidas são acrescentadas ao histórico sem atualizar a tela inteira;
- quando o atendente está no fim da conversa, a rolagem acompanha suavemente a mensagem nova;
- quando está lendo o histórico, sua posição é preservada e a seta de mensagem recente fica disponível;
- mensagens não são duplicadas caso a atualização automática aconteça durante um envio mais lento;
- imagens abrem em um visualizador interno, contido na tela, com botão de fechar, fechamento ao tocar no fundo e suporte à tecla `Esc` no navegador.

Essas regras são compartilhadas pelo painel web, pela PWA e pelo APK, pois todos utilizam a mesma interface de atendimento publicada na homologação.

Os arquivos da interface usam estratégia online-first: quando há internet, o aplicativo busca a versão mais recente publicada; o cache é usado apenas como contingência. Assim, correções de conversa chegam ao APK sem reinstalação depois do deploy.

## Registro de evolução — 04/10/2026

- filtros de datas dos orçamentos adaptados para desktop, tablet e celular;
- link de pagamento disponibilizado diretamente na conversa do atendente;
- PWA de atendimento criada para iOS e Android;
- APK Android criado com login e navegação dentro do aplicativo;
- atualização incremental das mensagens implementada, eliminando o efeito de refresh;
- visualizador responsivo de imagens implementado para uso mobile.

## Evolução de 04/10/2026 — aplicativo compacto, desempenho e atribuição interna

- O modo aplicativo (`/admin?app=1`) usa cabeçalho reduzido, identificação compacta do usuário e botão de saída discreto.
- As classificações de atendimento aparecem como chips horizontais roláveis, seguindo o padrão de navegação de aplicativos de mensagens.
- As filas são mantidas em cache durante a sessão e pré-carregadas em segundo plano. Ao tocar em um status já visitado, a lista aparece imediatamente e é atualizada silenciosamente pela API.
- As primeiras conversas visíveis também são pré-carregadas. A conversa abre com o conteúdo em cache e valida dados novos em segundo plano, reduzindo a espera percebida.
- A API de filas aceita `summary=0` para pré-carregamento leve, sem repetir as consultas de totalização. As totalizações continuam sendo atualizadas pelo carregamento normal.
- O responsável pelo atendimento ou um administrador pode atribuir, trocar ou remover o montador diretamente na conversa, após a geração do orçamento.
- A rota interna é `POST /api/admin/assign-assembler`, com `atendimentoId` e `montadorId` (vazio remove a atribuição).
- A atribuição recalcula o valor-base do montador pelo percentual cadastrado, atualiza os status do orçamento e atendimento e registra um evento de auditoria.
- Regra de privacidade operacional: atribuir ou trocar o montador **não cria mensagem no chat do cliente**. Mesmo quando o orçamento já nasce com montador, o resumo enviado ao cliente não informa nome, percentual ou valor do montador.
- O aplicativo do montador, com eventos como “a caminho do cliente”, permanece no roadmap. Esse evento futuramente poderá gerar uma atualização visível ao cliente, mas não faz parte desta entrega.
## Navegação de finalizados e status no aplicativo — 04/10/2026

- `Serviço finalizado` deixou de ser um filtro da fila operacional de atendimentos.
- No navegador, os registros encerrados ficam no menu independente **Atendimentos finalizados**, mantendo a mesma busca, abertura do histórico e atualização em tempo real.
- O menu **Atendimentos finalizados** não é exibido no modo aplicativo (`?app=1`).
- No APK, os quatro status operacionais permanecem obrigatoriamente em uma única linha, com rolagem horizontal por toque, sem quebra para uma segunda linha.
- O botão de saída usa um ícone vetorial de porta e seta, com contraste próprio para fundos escuros.
## Segmentação de endereço dos orçamentos — 05/10/2026

- O orçamento possui agora as colunas independentes `endereco`, `bairro` e `cidade`.
- Novos orçamentos e atualizações exigem o preenchimento de bairro e cidade no formulário do atendente.
- Orçamentos existentes permanecem válidos com os novos campos nulos; ao serem editados, deverão receber os dados segmentados.
- A mensagem automática apresenta Endereço, Bairro e Cidade em campos separados tanto para o cliente quanto para o atendente.
- A gestão administrativa exibe e pesquisa também por endereço, bairro e cidade.
- Foi criado o índice `orcamentos_cidade_bairro_idx` para apoiar buscas e análises geográficas futuras.
- Antes da publicação da API, executar `database/migracao-bairro-cidade-orcamentos.sql` no banco de homologação.

## Acompanhamento do cliente e anexos do atendente — 05/10/2026

- O menu principal possui agora o acesso **Acompanhe seu atendimento**, disponível também no menu móvel.
- No tema claro do site, o acesso possui contraste próprio ao lado de **Pedir orçamento** e navega na mesma aba (`target="_self"`), preservando a sessão do navegador.
- A página pública fica em `/acompanhe-seu-atendimento/`. O cliente localiza o registro com o mesmo telefone informado no atendimento.
- A consulta usa `POST /api/conversations/tracking` e retorna a conversa mais recente, priorizando atendimentos ainda abertos.
- Quando há orçamento, serviço, valor, data agendada e endereço segmentado ficam destacados fora do histórico de mensagens. A data é apresentada sem horário.
- A conversa continua interativa enquanto o atendimento estiver aberto e é atualizada silenciosamente a cada quatro segundos, sem recarregar a página.
- O painel do atendente aceita imagens JPEG, PNG ou WebP e PDF de até 3 MB pela rota autenticada `POST /api/admin/attachment`. O limite considera o transporte em Base64 dentro da requisição serverless.
- Anexos continuam privados no Vercel Blob e são entregues por `/api/conversations/attachment`, vinculados ao atendimento e à mensagem. PDFs são abertos em modo de leitura no navegador.
- Somente o responsável pelo atendimento ou um administrador pode anexar arquivos; atendimentos finalizados não aceitam novos anexos. A API valida também a assinatura binária do arquivo, além do tipo informado pelo navegador.
- A nova página foi marcada como `noindex`, pois o histórico do cliente não deve aparecer em mecanismos de busca.

### Contrato preparado para o futuro aplicativo do montador

A jornada já interpreta os eventos `MONTADOR_ATRIBUIDO`, `MONTADOR_A_CAMINHO`, `MONTADOR_CHEGOU` e `ATENDIMENTO_FINALIZADO` da tabela `eventos_atendimento`. Nesta etapa, apenas a atribuição e a finalização já são produzidas pelo sistema atual. O futuro aplicativo do montador deverá registrar os eventos de saída e chegada e, em uma etapa posterior, enviar localização autorizada para alimentar o mapa em tempo real. Nenhum dado financeiro interno ou valor de repasse do montador é exposto ao cliente.

### Ajuste de experiência após a consulta — 06/10/2026

- Depois de localizar um atendimento, a apresentação azul é reduzida a um cabeçalho compacto e o formulário de telefone é recolhido.
- O resumo do atendimento passa a ocupar imediatamente a área visível, com espaçamento próprio abaixo da faixa azul e sem sobreposição entre os dois blocos.
- A ação **Consultar outro telefone** restaura a apresentação e o formulário completos.

### Cancelamento de atendimentos — 06/10/2026

- Todos os atendimentos ativos podem ser cancelados pelo responsável ou administrador; atendimentos finalizados permanecem imutáveis.
- Ao cancelar, o atendimento recebe o status `CANCELADO`, uma mensagem automática e um evento de auditoria `ATENDIMENTO_CANCELADO`.
- O orçamento relacionado recebe `status_orcamento = 'CANCELADO'`, o link de pagamento é removido e o registro deixa de compor os totais financeiros ativos.
- O navegador ganhou o menu **Atendimentos cancelados**; esse histórico não aparece como fila no APK.
- Atendimentos cancelados não aceitam novas mensagens, transferência, anexos, novos links de pagamento ou confirmação tardia de webhook.
- Antes do deploy, executar `database/migracao-cancelamento-atendimentos.sql` no banco de homologação.

## Área do Montador — 31/10/2026

Antes de publicar esta versão na homologação, execute `database/migracao-area-montador.sql` no banco **de homologação**. A migração é reexecutável e preserva montadores legados.

Configure somente no ambiente de homologação:

- `MONTADOR_SESSION_SECRET`: segredo aleatório para assinar a sessão do montador (pode usar `ADMIN_SESSION_SECRET` como contingência, mas recomenda-se segredo independente);
- `SMTP_CONFIG_ENCRYPTION_KEY`: segredo aleatório de pelo menos 32 caracteres para criptografar a senha SMTP (pode usar `PAYMENT_CONFIG_ENCRYPTION_KEY` como contingência);
- `BLOB_READ_WRITE_TOKEN`: token do Vercel Blob já usado pelos anexos privados.

Fluxos incluídos:

- cadastro público em `/area-do-montador/`, com CPF/CNPJ validados, CEP, banco pesquisável e senha própria;
- termos versionados (`2026-10-31.1`) e registros de aceite com hash, data, IP e navegador;
- certidão enviada pelo próprio profissional, sem consulta criminal automatizada;
- cadastro permanece pendente até o envio e a revisão humana da certidão;
- documentos privados no Vercel Blob, servidos apenas a administradores autenticados;
- gestão em `/admin/montadores.html`, com edição, pendências, revisão, aprovação e auditoria;
- configuração SMTP Locaweb em `/admin/configuracoes-email.html`;
- e-mails de cadastro recebido, termos aceitos, revisão de certidão e mudanças de status;
- envio de NFS-e pelo valor total previsto e bloqueio do registro de repasse pago sem NFS-e aprovada e referenciada ao atendimento.

O servidor SMTP padrão segue a configuração oficial da Locaweb: `email-ssl.com.br`, porta `465`, SSL/TLS. O usuário SMTP deve ser o endereço completo da conta e deve coincidir com o remetente configurado.

### Verificações locais

- `npm install`
- `npm test`
- `npm audit --omit=dev`
## Operação do montador e pagamentos agrupados

### Acesso do aplicativo à homologação

O endereço configurado no APK precisa aceitar acesso público às APIs. Se a Vercel responder `401 Protected deployment`, a autenticação da própria Vercel está interceptando a chamada antes do login do montador. A solução recomendada é usar um domínio exclusivo e público de homologação ou liberar a proteção somente para essa implantação. Como alternativa temporária, a compilação aceita `--dart-define=VERCEL_PROTECTION_BYPASS=...`, usando um segredo de bypass criado na Vercel; esse valor não deve ser reutilizado em produção nem distribuído fora da equipe de testes.

O login possui “Manter conectado”. Quando selecionado, a sessão fica guardada no armazenamento seguro do aparelho por até 30 dias; sem a seleção, ela existe apenas enquanto o aplicativo estiver aberto. O botão “Sair” elimina a sessão e o cache operacional local.

O fluxo “Esqueci minha senha” envia um link de uso único, válido por 30 minutos, ao e-mail cadastrado. O token é armazenado apenas como hash. O envio depende do SMTP ativo no painel administrativo e de `PUBLIC_SITE_URL` apontando para o endereço público da homologação.

Antes de testar os serviços, fotos, NFS-e ou pagamentos, execute no banco **exclusivo de homologação**, nesta ordem:

1. `database/migracao-area-montador.sql` (se ainda não tiver sido executada);
2. `database/migracao-operacao-montador.sql`.

A segunda migração cria os estados de aceite e execução, evidências fotográficas, fila idempotente para operação offline, dispositivos, notificações push, pagamentos agrupados, vínculos da NFS-e e controle de arquivos CNAB.

### Aplicativo Flutter

O código está em `montador-app/`. A URL padrão aponta para a homologação e pode ser substituída na compilação:

```text
flutter build apk --release --dart-define=API_BASE_URL=https://SEU-ENDERECO-DE-HOMOLOGACAO
```

O aplicativo mantém localmente somente os serviços ainda ativos e os cinco repasses pagos mais recentes. Ações, fotos e NFS-e feitas sem internet entram em uma fila local e são sincronizadas automaticamente quando a conexão retorna. O histórico completo permanece no servidor e pode ser consultado pela área web.

### Push Firebase

Configure na Vercel da **homologação** a variável `FIREBASE_SERVICE_ACCOUNT_JSON` com o JSON completo da conta de serviço do projeto Firebase. Cadastre também os arquivos oficiais dos aplicativos:

- Android: `montador-app/android/app/google-services.json`;
- iOS: `montador-app/ios/Runner/GoogleService-Info.plist`, além da chave APNs no Firebase.

Sem essa configuração, a atribuição do atendimento não falha: a notificação fica registrada como `AGUARDANDO_CONFIGURACAO`. Depois de configurado, novas atribuições são enviadas pelo Firebase Cloud Messaging e auditadas em `notificacoes_push_montador`.

### CNAB 240

A tela e os estados de pagamento estão implementados, mas a geração de remessa e a leitura de retorno permanecem bloqueadas até existir um adaptador homologado para o banco escolhido. Para concluí-lo são necessários o banco, o convênio, a carteira/serviço, a versão do leiaute CNAB 240 e exemplos de remessa e retorno aprovados pelo banco. O sistema retorna erro controlado em vez de produzir um arquivo bancário possivelmente inválido.

### Verificação funcional mínima

1. atribua um orçamento a um montador aprovado;
2. confira a proposta no app, ainda sem nome, telefone ou endereço completo do cliente;
3. aceite e confirme que os dados completos são liberados e a jornada do cliente fica verde;
4. inicie o deslocamento, registre a chegada, anexe ao menos uma foto e finalize pelo app;
5. no admin, selecione atendimentos concluídos e gere os pagamentos — o agrupamento deve ocorrer por montador;
6. envie uma única NFS-e pelo valor total do pagamento, revise-a e faça a baixa manual de teste;
7. confirme que todos os atendimentos do pagamento passaram para pagos e que o app mostra o repasse entre os cinco mais recentes.
