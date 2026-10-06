# Roadmap da retaguarda JLL Montagens

## Diretriz permanente
A central de atendimento web deve evoluir para um aplicativo para iOS e Android para uso dos atendentes. Toda decisão de UX deve funcionar bem no celular e permitir futura distribuição como PWA/React Native, sem depender de uma interface exclusiva para desktop.

## Experiência desejada
- Fila única com prioridade para atendimentos não respondidos.
- Navegação em três áreas no desktop: filtros, lista de conversas e conversa ativa.
- Navegação em telas no celular: fila, conversa e ações.
- Histórico completo, imagens ampliáveis e anexos.
- Responsável visível e bloqueio de respostas concorrentes.
- Transferência entre atendentes e controle administrativo.
- Marcação de lida/não lida, notificações e atualização em tempo real.
- Chat interno da equipe separado da conversa com o cliente.
- Dashboard com volume, tempo de primeira resposta, atendimentos por status e serviços convertidos em orçamento.
- Acessibilidade, contraste, alvos de toque confortáveis e estados claros de carregamento/erro.

## Evolução por etapas
1. Painel web em três painéis e conversa ativa.
2. Assumir, transferir, responder, marcar como não lida e gerar orçamento.
3. Chat interno e abas por atendente.
4. Atualização em tempo real e notificações.
5. PWA instalável e, depois, aplicativo iOS/Android com a mesma API.

## Portal de acompanhamento do cliente — 05/10/2026

- Página responsiva para localizar o atendimento pelo telefone, consultar o orçamento destacado e interagir na conversa.
- Linha do tempo visual preparada para orçamento/agendamento, profissional atribuído, deslocamento, chegada e conclusão.
- Atualização automática sem recarregar a página e exibição de imagens e PDFs enviados pela equipe.
- Próxima etapa do acompanhamento: autenticação reforçada por código de uso único (OTP) antes da produção definitiva.
- Futura integração com o aplicativo do montador: registrar `MONTADOR_A_CAMINHO` e `MONTADOR_CHEGOU`, solicitar consentimento de localização e transmitir coordenadas temporárias somente durante o deslocamento.
- O mapa em tempo real dependerá dessa futura origem de geolocalização; nesta entrega, a interface informa a etapa operacional e já aceita os eventos correspondentes.

## Anexos na conversa

- Cliente: envio de imagens JPEG, PNG e WebP.
- Atendente: envio de imagens JPEG, PNG e WebP e documentos PDF.
- Arquivos armazenados de forma privada e acessados pela mensagem correspondente.
- Evolução futura: antivírus/antimalware assíncrono e política configurável de retenção dos anexos.

## Cancelamento de atendimentos — 06/10/2026

- Cancelamento disponível em todas as etapas ativas para o responsável ou administrador.
- Finalizados não podem ser cancelados; o orçamento associado passa a `CANCELADO` e não retorna aos totais financeiros.
- Histórico de cancelados separado no navegador, com acesso somente para consulta; não há fila separada no APK.
- Mensagens, anexos, transferências e webhooks de pagamento são bloqueados depois do cancelamento.
