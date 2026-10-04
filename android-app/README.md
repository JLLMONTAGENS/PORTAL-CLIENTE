# JLL Atendimento — Android

Aplicativo Android de teste para a operação de atendimento da JLL Montagens.

- URL: `https://portal-cliente-git-homologacao-jean-melo.vercel.app/admin/?app=1`
- Pacote: `br.com.jllmontagens.atendimento`
- Android mínimo: 7.0 (API 24)
- Android alvo: API 34

O aplicativo usa o mesmo login e as mesmas APIs do painel web. Links externos de pagamento são abertos no navegador seguro do aparelho.

Para reconstruir, execute `powershell -ExecutionPolicy Bypass -File .\android-app\build-apk.ps1` na raiz do projeto. A chave gerada é exclusivamente de depuração e não deve ser usada para publicação na Google Play.
