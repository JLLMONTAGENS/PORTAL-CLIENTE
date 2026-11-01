# Escopo — Aplicativo e operação do montador

## Objetivo

Disponibilizar ao profissional aprovado uma operação integrada entre aplicativo móvel e portal web para receber propostas, aceitar serviços, executar atendimentos, enviar evidências, acompanhar repasses e emitir a NFS-e exigida para pagamento.

Este documento registra o escopo funcional futuro. A implementação será feita por etapas e sempre no ambiente de homologação antes de qualquer publicação em produção.

## Tecnologia recomendada

- Aplicativo exclusivo do montador desenvolvido em **Flutter**, com uma base compartilhada para Android e iOS.
- Interface compacta, moderna, intuitiva e adequada a uso em campo.
- API central como fonte oficial dos dados; o aplicativo mantém somente um cache operacional limitado.
- Armazenamento local criptografado, fila de sincronização offline e operações idempotentes para impedir aceite, finalização ou envio duplicado.
- Notificações push para novos serviços atribuídos e mudanças relevantes de status.
- A escolha final dos serviços de push, armazenamento seguro, observabilidade e distribuição será validada na fase técnica.

## Estados e menus do aplicativo

### Serviços pendentes de aprovação

- Exibe todos os serviços atribuídos que aguardam aceite do montador.
- Antes do aceite, mostra somente:
  - descrição do serviço contida no orçamento;
  - bairro e cidade;
  - valor previsto do repasse;
  - data e horário do agendamento.
- Não revela nome, telefone, endereço completo ou outros dados pessoais do cliente antes do aceite.
- Permite aceitar ou recusar a proposta.
- Novo serviço gera notificação push.

### Serviços pendentes de execução

- Recebe o atendimento depois do aceite.
- Após o aceite, mostra nome e contatos do cliente, endereço completo e data e horário do agendamento.
- Permite registrar etapas operacionais, como saída, chegada e execução.
- A conclusão exige pelo menos uma foto do serviço; podem ser anexadas várias imagens vinculadas ao atendimento.
- A finalização efetiva do atendimento será exclusiva do aplicativo móvel.

### Repasses pendentes

- Mostra atendimento por atendimento, com o respectivo valor de repasse ainda não incluído em pagamento concluído.
- Depois da conclusão do serviço, o atendimento permanece nessa área até ser agrupado em um pagamento gerado.

### Pagamentos gerados

- Mostra os borderôs de pagamento gerados pela administração e seus atendimentos componentes.
- Exibe valor total, situação da NFS-e e situação financeira.
- Permite anexar uma NFS-e pelo valor total exato do pagamento gerado.
- Estados previstos: `AGUARDANDO_NFSE`, `NFSE_EM_ANALISE`, `NFSE_REJEITADA`, `AUTORIZADO`, `ENVIADO_AO_BANCO`, `PAGO` e `FALHOU`.

### Repasses recebidos

- Mantém no dispositivo somente os cinco pagamentos recebidos mais recentes.
- Pagamentos concluídos que deixarem de estar entre os cinco mais recentes serão removidos apenas do armazenamento local do aplicativo.
- Os registros oficiais, documentos, auditoria e histórico financeiro permanecem no servidor conforme a política de retenção e as obrigações legais.

## Funcionamento offline

- O aplicativo sincroniza serviços, estados e notificações enquanto estiver online.
- O montador pode consultar os itens já sincronizados, anexar fotos e solicitar a finalização sem conexão.
- Arquivos e comandos offline ficam em fila local protegida e são enviados automaticamente quando a internet voltar.
- A interface deve informar claramente o que está salvo apenas no aparelho, o que está sincronizando e o que foi confirmado pelo servidor.
- Aceites, recusas, anexos e finalizações usam uma chave idempotente para não serem processados duas vezes.
- O aplicativo não mantém todo o histórico: guarda os itens operacionais pendentes e os cinco últimos repasses recebidos.

## Portal web do montador

- Mantém as mesmas seções para consulta, em formato de listagem semelhante a relatório.
- Permite aceitar ou recusar serviços pendentes.
- A finalização do serviço e o envio das fotos obrigatórias ocorrem somente pelo aplicativo móvel.
- Pendentes de aceite, de execução e de repasse exibem todos os registros na respectiva situação.
- Pagamentos finalizados têm filtro de datas; por padrão, o período vai do primeiro dia do mês atual até a data da consulta.
- O portal pode consultar o histórico mantido no servidor sem obrigar o aplicativo a baixar esse histórico.

## Jornada apresentada ao cliente

- A atribuição interna gera `MONTADOR_ATRIBUIDO`: a etapa fica laranja e informa **“Aguardando a confirmação do profissional.”**
- O aceite gera `MONTADOR_SERVICO_ACEITO`: a etapa fica verde, passa a se chamar **“Profissional para o atendimento”** e mostra nome e telefone do montador.
- Nome e telefone do profissional não são expostos ao cliente antes do aceite.
- Os eventos seguintes alimentam as etapas de deslocamento, chegada e conclusão.

## Geração de pagamentos no administrativo

- Na gestão de orçamentos, o administrador filtra serviços finalizados com repasse pendente.
- A listagem permite selecionar um, vários ou todos os itens filtrados e acionar **Gerar pagamento**.
- O servidor agrupa automaticamente a seleção por montador e cria um pagamento separado para cada profissional.
- Cada pagamento soma os valores dos atendimentos daquele montador e registra seus componentes individualmente.
- Um atendimento não pode pertencer simultaneamente a mais de um pagamento ativo.
- O administrativo terá um menu próprio de **Pagamentos gerados** com pesquisa, filtros, detalhes, documentos e auditoria.

## NFS-e e autorização

- O pagamento nasce bloqueado em `AGUARDANDO_NFSE`.
- O montador anexa a nota fiscal de serviço ao pagamento gerado, pelo valor total do borderô.
- Após o anexo, o pagamento passa para `NFSE_EM_ANALISE`.
- O administrador visualiza o documento em acesso restrito, aprova ou rejeita a NFS-e e registra a decisão em auditoria.
- Somente pagamento com NFS-e aprovada pode passar para `AUTORIZADO`.
- O montador acompanha todas as mudanças de situação no aplicativo e no portal web.

## CNAB 240 e baixa dos pagamentos

- O administrativo permite selecionar vários pagamentos autorizados e gerar um arquivo CNAB 240 para transferência Pix.
- Cada pagamento gerado possui um identificador próprio enviado ao banco e usado na conciliação do arquivo de retorno.
- A importação do retorno localiza cada pagamento pelo identificador, registra ocorrências e atualiza o pagamento e todos os atendimentos componentes.
- A baixa manual do pagamento também atualiza todos os atendimentos componentes e exige usuário, data, justificativa e registro de auditoria.
- Arquivos de remessa e retorno, seus hashes, usuário responsável e resultados de processamento devem ser preservados para rastreabilidade.
- O layout CNAB 240 varia por banco e convênio. Antes da implementação serão necessários o banco de pagamento, o manual/layout vigente, os dados do convênio, a forma de Pix aceita e os códigos de ocorrência do arquivo de retorno.

## Segurança e proteção de dados

- Autenticação individual do montador, sessão revogável e armazenamento seguro de credenciais.
- Dados do cliente liberados apenas após o aceite e somente para o montador responsável.
- Links de arquivos privados com autorização no servidor; nenhuma URL pública permanente para fotos, NFS-e ou documentos pessoais.
- Logs de auditoria para atribuição, aceite, recusa, acesso a dados, etapas, anexos, finalização, NFS-e, autorização, remessa e baixa.
- Possibilidade de bloqueio remoto da sessão e limpeza do cache local no próximo contato com o servidor.

## Entrega por fases

1. Contratos de API, estados, permissões e modelo de dados.
2. Portal web do montador com aceite e consultas.
3. Aplicativo Flutter Android/iOS, push e operação online.
4. Cache criptografado, fila offline, fotos e sincronização automática.
5. Pagamentos gerados, NFS-e e autorização administrativa.
6. CNAB 240 do banco escolhido, retorno, conciliação e baixa manual.
7. Testes de segurança, carga, recuperação de falhas e homologação operacional.

## Dependências para detalhamento técnico

- Banco e conta que emitirão o CNAB 240.
- Manual CNAB 240 e versão específica fornecidos pelo banco.
- Credenciais e ambiente de homologação bancária.
- Contas de publicação Google Play e Apple Developer.
- Definição do provedor de notificações push e política definitiva de retenção de imagens.
