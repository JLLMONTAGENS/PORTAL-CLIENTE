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
