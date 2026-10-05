# JLL Atendimento — Android

Aplicativo Android de teste para a operação de atendimento da JLL Montagens.

- URL: `https://portal-cliente-git-homologacao-jean-melo.vercel.app/admin/?app=1`
- Pacote: `br.com.jllmontagens.atendimento`
- Android mínimo: 7.0 (API 24)
- Android alvo: API 34

O aplicativo usa o mesmo login e as mesmas APIs do painel web. Links externos de pagamento são abertos no navegador seguro do aparelho.

A autenticação e toda a operação do painel permanecem dentro da interface do aplicativo, inclusive quando a hospedagem realiza redirecionamentos entre domínios de autenticação.

## Conversas

A interface web carregada pelo APK faz atualização incremental das mensagens. Envios aparecem imediatamente, mensagens recebidas são anexadas sem recarregar a tela e a rolagem acompanha o final somente quando o atendente já está acompanhando as mensagens recentes.

Imagens são abertas em um visualizador interno responsivo, limitado ao tamanho da tela e com fechamento acessível. Como esses recursos são servidos pela homologação, melhorias na conversa entram no APK após o deploy web, sem exigir uma nova compilação nativa.

Para reconstruir, execute `powershell -ExecutionPolicy Bypass -File .\android-app\build-apk.ps1` na raiz do projeto. A chave gerada é exclusivamente de depuração e não deve ser usada para publicação na Google Play.

## Interface compacta e desempenho — 04/10/2026

- O APK continua usando a mesma autenticação da plataforma, dentro do próprio aplicativo.
- No modo aplicativo, o cabeçalho foi reduzido e o botão de saída passou a ser um ícone discreto.
- As filas de atendimento são apresentadas como chips horizontais roláveis, semelhantes às classificações de conversas em mensageiros.
- Filas e conversas próximas são pré-carregadas em segundo plano para reduzir o tempo percebido ao navegar.
- As ações menos frequentes ficam recolhidas em “Ações do atendimento”, liberando mais espaço vertical para as mensagens.
- A atribuição de montador na conversa é uma operação interna e nunca envia uma nova mensagem ao cliente.
- Notificações push e o futuro aplicativo exclusivo do montador continuam fora desta versão.
## Barra de status e saída — 04/10/2026

- A barra de status do APK contém apenas: Não respondidas, Pendentes, Orçamento gerado e Montador atribuído.
- Os status ficam em uma única linha e podem ser percorridos horizontalmente com o gesto de arrastar.
- Atendimentos finalizados são acessíveis somente pelo menu próprio da versão web e não aparecem no APK.
- O cabeçalho apresenta um ícone vetorial visível para a ação de sair.
## Endereço segmentado no orçamento — 05/10/2026

- O formulário de orçamento no aplicativo exige Endereço completo, Bairro e Cidade em campos separados.
- O resumo enviado ao cliente apresenta esses dados separadamente e mantém a Referência como último campo de localização.
- Orçamentos antigos sem bairro/cidade exigirão o preenchimento desses campos na próxima atualização.
