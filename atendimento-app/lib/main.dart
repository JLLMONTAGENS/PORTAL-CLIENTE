import 'dart:convert';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';

import 'firebase_options.dart';

const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://portal-cliente-git-homologacao-jean-melo.vercel.app',
);
const vercelProtectionBypass = String.fromEnvironment(
  'VERCEL_PROTECTION_BYPASS',
);

Uri buildAdminUri() {
  final parameters = <String, String>{'app': '1'};
  if (vercelProtectionBypass.isNotEmpty) {
    parameters['x-vercel-protection-bypass'] = vercelProtectionBypass;
    parameters['x-vercel-set-bypass-cookie'] = 'true';
  }
  return Uri.parse('$apiBaseUrl/admin/').replace(queryParameters: parameters);
}

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  } catch (_) {
    // A compilação continua utilizável sem Firebase até a configuração oficial.
  }
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  } catch (_) {
    // O portal permanece acessível mesmo se o push estiver indisponível.
  }
  FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  runApp(const JllAtendimentoApp());
}

class JllAtendimentoApp extends StatelessWidget {
  const JllAtendimentoApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'JLL Atendimento',
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF1A2B4C),
        primary: const Color(0xFF1A2B4C),
        secondary: const Color(0xFFE67E22),
      ),
      useMaterial3: true,
    ),
    home: const AtendimentoWebView(),
  );
}

class AtendimentoWebView extends StatefulWidget {
  const AtendimentoWebView({super.key});

  @override
  State<AtendimentoWebView> createState() => _AtendimentoWebViewState();
}

class _AtendimentoWebViewState extends State<AtendimentoWebView> {
  late final WebViewController controller;
  String? pushToken;
  String? deviceId;
  int progress = 0;
  String? loadError;
  bool _handlingBack = false;

  @override
  void initState() {
    super.initState();
    controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFFF3F6F9))
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (value) => setState(() => progress = value),
          onPageFinished: (_) => _publishPushToken(),
          onWebResourceError: (error) {
            if (error.isForMainFrame == true) {
              setState(
                () => loadError = 'Não foi possível conectar à homologação.',
              );
            }
          },
          onNavigationRequest: (request) async {
            final uri = Uri.tryParse(request.url);
            if (uri != null && _isExternalPayment(uri.host)) {
              await launchUrl(uri, mode: LaunchMode.externalApplication);
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(
        buildAdminUri(),
        headers: vercelProtectionBypass.isEmpty
            ? const {}
            : {'x-vercel-protection-bypass': vercelProtectionBypass},
      );
    _initializePush();
  }

  bool _isExternalPayment(String host) => [
    'mercadopago.com',
    'mercadopago.com.br',
    'pagseguro.com.br',
    'pagbank.com.br',
    'userede.com.br',
  ].any((domain) => host == domain || host.endsWith('.$domain'));

  Future<void> _initializePush() async {
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(
          options: DefaultFirebaseOptions.currentPlatform,
        );
      }
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission(alert: true, badge: true, sound: true);
      final preferences = await SharedPreferences.getInstance();
      deviceId = preferences.getString('device_id');
      if (deviceId == null) {
        deviceId =
            '${Platform.operatingSystem}-${DateTime.now().microsecondsSinceEpoch}';
        await preferences.setString('device_id', deviceId!);
      }
      final firstRegistration = messaging.onRegistered.first.timeout(
        const Duration(seconds: 15),
      );
      messaging.onRegistered.listen((token) {
        pushToken = token;
        _publishPushToken();
      });
      await messaging.register();
      String? initialToken;
      try {
        initialToken = await firstRegistration;
      } catch (_) {
        // Recupera instalações já registradas antes de o listener ser criado.
        // ignore: deprecated_member_use
        initialToken = await messaging.getToken();
      }
      if (initialToken != null && initialToken.isNotEmpty) {
        pushToken = initialToken;
        await _publishPushToken();
      }
      FirebaseMessaging.onMessage.listen((message) {
        if (!mounted) return;
        final notification = message.notification;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              notification?.body ?? 'Há uma atualização no atendimento.',
            ),
            action: SnackBarAction(
              label: 'Abrir',
              onPressed: () => controller.reload(),
            ),
          ),
        );
      });
      FirebaseMessaging.onMessageOpenedApp.listen((_) => controller.reload());
    } catch (_) {
      // O app funciona normalmente; o push será ativado após a configuração Firebase.
    }
  }

  Future<void> _publishPushToken() async {
    if (pushToken == null || deviceId == null) return;
    final payload = jsonEncode({
      'plataforma': Platform.isIOS ? 'IOS' : 'ANDROID',
      'pushToken': pushToken,
      'identificadorDispositivo': deviceId,
    });
    try {
      await controller.runJavaScript(
        "window.dispatchEvent(new CustomEvent('jll-push-token',{detail:$payload}));",
      );
    } catch (_) {
      // onPageFinished tentará publicar novamente quando a página estiver pronta.
    }
  }

  Future<void> _handleBack() async {
    if (_handlingBack) return;
    _handlingBack = true;
    try {
      var handled = false;
      try {
        final result = await controller.runJavaScriptReturningResult(
          "JSON.stringify(Boolean(window.jllHandleAndroidBack && window.jllHandleAndroidBack()))",
        );
        handled = result.toString().replaceAll('"', '') == 'true';
      } catch (_) {
        // Sem navegação interna disponível, o próximo passo é fechar o aplicativo.
      }
      if (!handled) await SystemNavigator.pop();
    } finally {
      _handlingBack = false;
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: false,
    onPopInvokedWithResult: (didPop, _) async {
      if (!didPop) await _handleBack();
    },
    child: Scaffold(
      backgroundColor: const Color(0xFFF3F6F9),
      body: SafeArea(
        child: Stack(
          children: [
            WebViewWidget(controller: controller),
            if (progress < 100)
              LinearProgressIndicator(
                value: progress / 100,
                color: const Color(0xFFE67E22),
              ),
            if (loadError != null)
              Center(
                child: Card(
                  margin: const EdgeInsets.all(24),
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.cloud_off,
                          size: 42,
                          color: Color(0xFFE67E22),
                        ),
                        const SizedBox(height: 12),
                        Text(loadError!, textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        FilledButton(
                          onPressed: () {
                            setState(() => loadError = null);
                            controller.loadRequest(buildAdminUri());
                          },
                          child: const Text('Tentar novamente'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    ),
  );
}
