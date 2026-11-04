# JLL Atendimento — Flutter

Aplicativo Android e iOS da equipe de atendimento. Ele mantém o mesmo login e as mesmas permissões do portal administrativo e apresenta a interface compacta `/admin/?app=1` dentro do Flutter.

## Compilar a homologação

No PowerShell, a partir da raiz do repositório:

```powershell
.\atendimento-app\compilar-homologacao.ps1
```

O script valida o Protection Bypass da Vercel e gera o APK em `atendimento-app/build/app/outputs/flutter-apk/app-release.apk`.

## Firebase

Antes de testar notificações, configure o projeto com `flutterfire configure`, selecionando Android e iOS. Os identificadores previstos são:

- Android: `br.com.jllmontagens.atendimento`
- iOS: `br.com.jllmontagens.atendimento`

Não versione contas de serviço. O backend recebe a conta de serviço exclusivamente pela variável privada `FIREBASE_SERVICE_ACCOUNT_JSON` da Vercel de homologação.
