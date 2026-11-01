# JLL Montador

Aplicativo Flutter de homologação para a operação dos profissionais da JLL Montagens.

## Recursos implementados

- login com a mesma conta da Área do Montador;
- propostas pendentes, com dados limitados antes do aceite;
- serviços aceitos com dados completos do cliente;
- deslocamento, chegada, várias fotos e finalização obrigatória pelo app;
- funcionamento offline com sincronização automática e operações idempotentes;
- pagamentos gerados, envio da NFS-e e últimos cinco repasses recebidos;
- registro do token Android/iOS para notificações Firebase.

## Executar

```text
flutter pub get
flutter run --dart-define=API_BASE_URL=https://portal-cliente-git-homologacao-jean-melo.vercel.app
```

## Gerar APK de homologação

```text
flutter build apk --release --dart-define=API_BASE_URL=https://portal-cliente-git-homologacao-jean-melo.vercel.app
```

O APK é criado em `build/app/outputs/flutter-apk/app-release.apk`.

## Configurações externas

O push exige um projeto Firebase configurado para Android e iOS. A compilação iOS, assinatura e publicação exigem macOS, Xcode e uma conta Apple Developer. Não adicione arquivos de credenciais reais ao Git.
