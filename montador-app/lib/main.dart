import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as path;
import 'package:sqflite/sqflite.dart';

import 'firebase_options.dart';

const apiBase = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'https://portal-cliente-git-homologacao-jean-melo.vercel.app',
);
const vercelProtectionBypass = String.fromEnvironment(
  'VERCEL_PROTECTION_BYPASS',
);

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );
  } catch (_) {
    // O trabalho offline permanece disponível mesmo se o push falhar.
  }
  await LocalStore.instance.open();
  runApp(const JllMontadorApp());
}

class JllMontadorApp extends StatelessWidget {
  const JllMontadorApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'JLL Montador',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF1A2B4C),
        primary: const Color(0xFF1A2B4C),
        secondary: const Color(0xFFE67E22),
      ),
      useMaterial3: true,
      scaffoldBackgroundColor: const Color(0xFFF3F6F9),
      cardTheme: const CardThemeData(
        elevation: 0,
        margin: EdgeInsets.symmetric(vertical: 7),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(16)),
          side: BorderSide(color: Color(0xFFDCE3EB)),
        ),
      ),
    ),
    home: const SessionGate(),
  );
}

class LocalStore {
  LocalStore._();
  static final instance = LocalStore._();
  Database? _db;
  Future<void> open() async {
    _db = await openDatabase(
      path.join(await getDatabasesPath(), 'jll_montador.db'),
      version: 1,
      onCreate: (db, _) async {
        await db.execute(
          'CREATE TABLE cache (chave TEXT PRIMARY KEY, conteudo TEXT NOT NULL, atualizado_em TEXT NOT NULL)',
        );
        await db.execute(
          'CREATE TABLE fila (id TEXT PRIMARY KEY, rota TEXT NOT NULL, corpo TEXT NOT NULL, criado_em TEXT NOT NULL)',
        );
      },
    );
  }

  Future<void> cache(String key, Object value) => _db!.insert('cache', {
    'chave': key,
    'conteudo': jsonEncode(value),
    'atualizado_em': DateTime.now().toIso8601String(),
  }, conflictAlgorithm: ConflictAlgorithm.replace);
  Future<dynamic> read(String key) async {
    final rows = await _db!.query(
      'cache',
      where: 'chave=?',
      whereArgs: [key],
      limit: 1,
    );
    return rows.isEmpty ? null : jsonDecode(rows.first['conteudo']! as String);
  }

  Future<void> queue(String id, String route, Map<String, dynamic> body) =>
      _db!.insert('fila', {
        'id': id,
        'rota': route,
        'corpo': jsonEncode(body),
        'criado_em': DateTime.now().toIso8601String(),
      }, conflictAlgorithm: ConflictAlgorithm.ignore);
  Future<List<Map<String, Object?>>> queued() =>
      _db!.query('fila', orderBy: 'criado_em');
  Future<void> removeQueue(String id) =>
      _db!.delete('fila', where: 'id=?', whereArgs: [id]);
  Future<void> clear() async {
    await _db!.delete('cache');
    await _db!.delete('fila');
  }
}

class ApiClient {
  static const secure = FlutterSecureStorage();
  String? cookie;
  bool keepConnected = false;
  Future<bool> restore() async {
    keepConnected = await secure.read(key: 'keep_connected') == 'true';
    if (!keepConnected) {
      await secure.delete(key: 'session_cookie');
      return false;
    }
    cookie = await secure.read(key: 'session_cookie');
    return cookie?.isNotEmpty == true;
  }

  Future<void> setKeepConnected(bool value) async {
    keepConnected = value;
    if (value) {
      await secure.write(key: 'keep_connected', value: 'true');
    } else {
      await secure.delete(key: 'keep_connected');
      await secure.delete(key: 'session_cookie');
    }
  }

  Future<Map<String, dynamic>> request(
    String route, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final headers = <String, String>{
      'Accept': 'application/json',
      'X-JLL-App': 'montador-mobile',
    };
    if (vercelProtectionBypass.isNotEmpty) {
      headers['x-vercel-protection-bypass'] = vercelProtectionBypass;
    }
    if (cookie != null) headers['Cookie'] = cookie!;
    if (body != null) headers['Content-Type'] = 'application/json';
    var uri = Uri.parse('$apiBase$route');
    if (vercelProtectionBypass.isNotEmpty) {
      uri = uri.replace(
        queryParameters: {
          ...uri.queryParameters,
          'x-vercel-protection-bypass': vercelProtectionBypass,
        },
      );
    }
    final response = method == 'GET'
        ? await http.get(uri, headers: headers)
        : await http.post(uri, headers: headers, body: jsonEncode(body ?? {}));
    final setCookie = response.headers['set-cookie'];
    if (setCookie != null) {
      cookie = setCookie.split(';').first;
      if (keepConnected) {
        await secure.write(key: 'session_cookie', value: cookie);
      }
    }
    Map<String, dynamic> data = <String, dynamic>{};
    if (response.body.isNotEmpty) {
      try {
        final decoded = jsonDecode(response.body);
        if (decoded is Map) data = Map<String, dynamic>.from(decoded);
      } catch (_) {}
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final protectedDeployment =
          response.statusCode == 401 &&
          response.body.toLowerCase().contains('protected deployment');
      throw ApiException(
        protectedDeployment
            ? vercelProtectionBypass.isEmpty
                  ? 'Este APK foi compilado sem o bypass da Vercel. Gere uma nova versão com o segredo da homologação.'
                  : 'O bypass foi enviado, mas a Vercel o rejeitou. Confirme o valor do segredo e faça um novo deploy da homologação após criar ou trocar o bypass.'
            : data['error']?.toString() ??
                  data['message']?.toString() ??
                  'Não foi possível concluir.',
        response.statusCode,
      );
    }
    return data;
  }

  Future<void> logout() async {
    try {
      await request('/api/montadores/logout', method: 'POST');
    } catch (_) {}
    cookie = null;
    await secure.delete(key: 'session_cookie');
    await secure.delete(key: 'keep_connected');
    keepConnected = false;
  }
}

class ApiException implements Exception {
  ApiException(this.message, this.status);
  final String message;
  final int status;
  @override
  String toString() => message;
}

class SessionGate extends StatefulWidget {
  const SessionGate({super.key});
  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  final api = ApiClient();
  bool loading = true;
  bool authenticated = false;
  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    final has = await api.restore();
    if (has) {
      try {
        await api.request('/api/montadores/status');
        authenticated = true;
      } catch (_) {}
    }
    if (mounted) setState(() => loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    return authenticated
        ? HomeScreen(
            api: api,
            onLogout: () => setState(() => authenticated = false),
          )
        : LoginScreen(
            api: api,
            onLogin: () => setState(() => authenticated = true),
          );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.api, required this.onLogin});
  final ApiClient api;
  final VoidCallback onLogin;
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final formKey = GlobalKey<FormState>(),
      email = TextEditingController(),
      password = TextEditingController();
  bool loading = false, keepConnected = true;
  String? error;
  Future<void> submit() async {
    if (!formKey.currentState!.validate()) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      await widget.api.setKeepConnected(keepConnected);
      await widget.api.request(
        '/api/montadores/login',
        method: 'POST',
        body: {
          'email': email.text.trim(),
          'senha': password.text,
          'manterConectado': keepConnected,
        },
      );
      widget.onLogin();
    } catch (e) {
      setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> forgotPassword() async {
    final controller = TextEditingController(text: email.text.trim());
    final requested = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Redefinir senha'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Informe o e-mail do cadastro. Enviaremos um link válido por 30 minutos.',
            ),
            const SizedBox(height: 14),
            TextField(
              controller: controller,
              keyboardType: TextInputType.emailAddress,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'E-mail',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Enviar'),
          ),
        ],
      ),
    );
    if (requested != true || controller.text.trim().isEmpty) return;
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final data = await widget.api.request(
        '/api/montadores/senha-solicitar',
        method: 'POST',
        body: {'email': controller.text.trim()},
      );
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(data['mensagem'].toString())));
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      controller.dispose();
      if (mounted) setState(() => loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Form(
                  key: formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Icon(
                        Icons.handyman_rounded,
                        size: 58,
                        color: Color(0xFFE67E22),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        'JLL Montador',
                        style: Theme.of(context).textTheme.headlineMedium
                            ?.copyWith(fontWeight: FontWeight.w800),
                      ),
                      const Text(
                        'Serviços, execução e repasses em um só lugar.',
                      ),
                      Text(
                        vercelProtectionBypass.isEmpty
                            ? 'Homologação · bypass não configurado'
                            : 'Homologação · bypass configurado',
                        style: const TextStyle(
                          color: Colors.blueGrey,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 22),
                      TextFormField(
                        controller: email,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          labelText: 'E-mail',
                          border: OutlineInputBorder(),
                        ),
                        validator: (v) => v != null && v.contains('@')
                            ? null
                            : 'Informe seu e-mail.',
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: password,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'Senha',
                          border: OutlineInputBorder(),
                        ),
                        validator: (v) =>
                            (v?.length ?? 0) >= 6 ? null : 'Informe sua senha.',
                      ),
                      CheckboxListTile(
                        value: keepConnected,
                        onChanged: loading
                            ? null
                            : (value) => setState(
                                () => keepConnected = value ?? false,
                              ),
                        contentPadding: EdgeInsets.zero,
                        controlAffinity: ListTileControlAffinity.leading,
                        title: const Text('Manter conectado'),
                        subtitle: const Text(
                          'Não será necessário entrar novamente neste aparelho.',
                        ),
                      ),
                      if (error != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Text(
                            error!,
                            style: const TextStyle(color: Colors.red),
                          ),
                        ),
                      const SizedBox(height: 18),
                      FilledButton(
                        onPressed: loading ? null : submit,
                        child: Text(loading ? 'Entrando…' : 'Entrar'),
                      ),
                      TextButton(
                        onPressed: loading ? null : forgotPassword,
                        child: const Text('Esqueci minha senha'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.api, required this.onLogout});
  final ApiClient api;
  final VoidCallback onLogout;
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  int index = 0;
  bool loading = true, syncing = false;
  String? message;
  List<dynamic> pending = [],
      execution = [],
      pendingTransfers = [],
      transfers = [],
      received = [];
  StreamSubscription<List<ConnectivityResult>>? connectivity;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadCache().then((_) => sync());
    connectivity = Connectivity().onConnectivityChanged.listen((result) {
      if (!result.contains(ConnectivityResult.none)) sync();
    });
    _initPush();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    connectivity?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) sync();
  }

  Future<void> _loadCache() async {
    pending = (await LocalStore.instance.read('pending') as List?) ?? [];
    execution = (await LocalStore.instance.read('execution') as List?) ?? [];
    pendingTransfers =
        (await LocalStore.instance.read('pending_transfers') as List?) ?? [];
    transfers = (await LocalStore.instance.read('transfers') as List?) ?? [];
    received = (await LocalStore.instance.read('received') as List?) ?? [];
    if (mounted) setState(() => loading = false);
  }

  Future<void> _initPush() async {
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(
          options: DefaultFirebaseOptions.currentPlatform,
        );
      }
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();
      final registration = messaging.onRegistered.first.timeout(
        const Duration(seconds: 12),
      );
      await messaging.register();
      String? token;
      try {
        token = await registration;
      } catch (_) {
        // Recupera instalações já registradas antes de o listener ser criado.
        // ignore: deprecated_member_use
        token = await messaging.getToken();
      }
      if (token != null && token.isNotEmpty) {
        await widget.api.request(
          '/api/montadores/dispositivo',
          method: 'POST',
          body: {
            'plataforma': Platform.isIOS ? 'IOS' : 'ANDROID',
            'pushToken': token,
            'identificadorDispositivo': Platform.operatingSystemVersion,
          },
        );
      }
    } catch (_) {
      /* Credenciais Firebase serão adicionadas na homologação de push. */
    }
  }

  Future<void> _processQueue() async {
    for (final item in await LocalStore.instance.queued()) {
      try {
        await widget.api.request(
          item['rota']! as String,
          method: 'POST',
          body: jsonDecode(item['corpo']! as String) as Map<String, dynamic>,
        );
        await LocalStore.instance.removeQueue(item['id']! as String);
      } on SocketException {
        return;
      } on ApiException catch (e) {
        if (e.status >= 500) return;
        await LocalStore.instance.removeQueue(item['id']! as String);
        message = e.message;
      }
    }
  }

  Future<void> sync() async {
    if (syncing) return;
    setState(() => syncing = true);
    try {
      await _processQueue();
      final results = await Future.wait([
        widget.api.request('/api/montadores/servicos?view=PENDENTES_ACEITE'),
        widget.api.request('/api/montadores/servicos?view=PENDENTES_EXECUCAO'),
        widget.api.request('/api/montadores/servicos?view=PENDENTES_REPASSE'),
        widget.api.request('/api/montadores/pagamentos'),
        widget.api.request('/api/montadores/pagamentos?view=RECEBIDOS'),
      ]);
      pending = results[0]['servicos'] as List? ?? [];
      execution = results[1]['servicos'] as List? ?? [];
      pendingTransfers = results[2]['servicos'] as List? ?? [];
      transfers = results[3]['pagamentos'] as List? ?? [];
      received = (results[4]['pagamentos'] as List? ?? []).take(5).toList();
      await Future.wait([
        LocalStore.instance.cache('pending', pending),
        LocalStore.instance.cache('execution', execution),
        LocalStore.instance.cache('pending_transfers', pendingTransfers),
        LocalStore.instance.cache('transfers', transfers),
        LocalStore.instance.cache('received', received),
      ]);
      message = null;
    } catch (e) {
      message =
          'Modo offline · alterações serão sincronizadas automaticamente.';
    } finally {
      if (mounted) {
        setState(() {
          loading = false;
          syncing = false;
        });
      }
    }
  }

  Future<bool> queueAction(String route, Map<String, dynamic> body) async {
    final id =
        body['operacaoId']?.toString() ??
        '${DateTime.now().microsecondsSinceEpoch}';
    body['operacaoId'] = id;
    String? feedback;
    try {
      final result = await widget.api.request(
        route,
        method: 'POST',
        body: body,
      );
      feedback = result['mensagem']?.toString();
    } on ApiException catch (e) {
      if (e.status >= 400 && e.status < 500) {
        if (mounted) setState(() => message = e.message);
        return false;
      }
      await LocalStore.instance.queue(id, route, body);
      feedback = 'Ação salva no aparelho. Enviaremos quando a internet voltar.';
    } catch (_) {
      await LocalStore.instance.queue(id, route, body);
      feedback = 'Ação salva no aparelho. Enviaremos quando a internet voltar.';
    }
    await sync();
    if (mounted && feedback != null) setState(() => message = feedback);
    return true;
  }

  Future<void> logout() async {
    await widget.api.logout();
    await LocalStore.instance.clear();
    widget.onLogout();
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      ServiceList(
        title: 'Pendentes de aceite',
        empty: 'Nenhuma proposta aguardando sua decisão.',
        services: pending,
        action: queueAction,
        pending: true,
      ),
      ServiceList(
        title: 'Pendentes de execução',
        empty: 'Nenhum serviço aguardando execução.',
        services: execution,
        action: queueAction,
      ),
      ServiceList(
        title: 'Pendentes de repasse',
        empty: 'Nenhum serviço finalizado aguardando geração de pagamento.',
        services: pendingTransfers,
        action: queueAction,
      ),
      PaymentList(
        title: 'Pagamentos gerados',
        payments: transfers,
        action: queueAction,
      ),
      PaymentList(
        title: 'Últimos 5 repasses',
        payments: received,
        received: true,
      ),
    ];
    return Scaffold(
      appBar: AppBar(
        title: const Text('JLL Montador'),
        actions: [
          if (syncing)
            const Padding(
              padding: EdgeInsets.all(18),
              child: SizedBox.square(
                dimension: 17,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          IconButton(onPressed: sync, icon: const Icon(Icons.sync)),
          TextButton.icon(
            onPressed: logout,
            icon: const Icon(Icons.logout),
            label: const Text('Sair'),
          ),
        ],
      ),
      body: Column(
        children: [
          if (message != null)
            MaterialBanner(
              content: Text(message!),
              actions: [
                TextButton(
                  onPressed: () => setState(() => message = null),
                  child: const Text('OK'),
                ),
              ],
            ),
          Expanded(
            child: loading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(onRefresh: sync, child: pages[index]),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) => setState(() => index = value),
        destinations: [
          NavigationDestination(
            icon: Badge(
              label: Text('${pending.length}'),
              child: const Icon(Icons.inbox_outlined),
            ),
            label: 'Aceitar',
          ),
          NavigationDestination(
            icon: Badge(
              label: Text('${execution.length}'),
              child: const Icon(Icons.build_outlined),
            ),
            label: 'Executar',
          ),
          NavigationDestination(
            icon: Badge(
              label: Text('${pendingTransfers.length}'),
              child: const Icon(Icons.payments_outlined),
            ),
            label: 'A repassar',
          ),
          NavigationDestination(
            icon: Badge(
              label: Text('${transfers.length}'),
              child: const Icon(Icons.receipt_long_outlined),
            ),
            label: 'Pagamentos',
          ),
          const NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            label: 'Recebidos',
          ),
        ],
      ),
    );
  }
}

class ServiceList extends StatelessWidget {
  const ServiceList({
    super.key,
    required this.title,
    required this.empty,
    required this.services,
    required this.action,
    this.pending = false,
  });
  final String title, empty;
  final List<dynamic> services;
  final Future<bool> Function(String, Map<String, dynamic>) action;
  final bool pending;
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      Text(
        title,
        style: Theme.of(
          context,
        ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 8),
      if (services.isEmpty) EmptyState(text: empty),
      ...services.map(
        (item) => ServiceCard(
          data: Map<String, dynamic>.from(item as Map),
          action: action,
          pending: pending,
        ),
      ),
    ],
  );
}

class ServiceCard extends StatefulWidget {
  const ServiceCard({
    super.key,
    required this.data,
    required this.action,
    required this.pending,
  });
  final Map<String, dynamic> data;
  final Future<bool> Function(String, Map<String, dynamic>) action;
  final bool pending;
  @override
  State<ServiceCard> createState() => _ServiceCardState();
}

class _ServiceCardState extends State<ServiceCard> {
  bool busy = false, locallyCompleted = false;
  late int photoCount;
  final picker = ImagePicker();
  @override
  void initState() {
    super.initState();
    photoCount = (widget.data['fotos'] as num? ?? 0).toInt();
    locallyCompleted = widget.data['status'] == 'CONCLUIDO';
  }

  @override
  void didUpdateWidget(covariant ServiceCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    final synchronized = (widget.data['fotos'] as num? ?? 0).toInt();
    if (synchronized > photoCount) photoCount = synchronized;
    if (widget.data['status'] == 'CONCLUIDO') locallyCompleted = true;
  }

  Future<bool> act(String action) async {
    setState(() => busy = true);
    try {
      return await widget.action('/api/montadores/servicos', {
        'id': widget.data['id'],
        'acao': action,
        'operacaoId': '${DateTime.now().microsecondsSinceEpoch}-$action',
      });
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> finish() async {
    if (photoCount < 1) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Anexe ao menos uma imagem do serviço antes de finalizar.',
          ),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }
    final completed = await act('FINALIZAR');
    if (completed && mounted) setState(() => locallyCompleted = true);
  }

  Future<void> photo() async {
    final file = await picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 78,
      maxWidth: 1800,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    setState(() => busy = true);
    try {
      final saved = await widget.action('/api/montadores/servico-foto', {
        'id': widget.data['id'],
        'fileName': file.name,
        'mimeType': file.mimeType ?? 'image/jpeg',
        'data': base64Encode(bytes),
        'capturadoEm': DateTime.now().toIso8601String(),
        'operacaoId': '${DateTime.now().microsecondsSinceEpoch}-foto',
      });
      if (saved && mounted) setState(() => photoCount += 1);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.data, accepted = d['nomeCliente'] != null;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'ATENDIMENTO #${d['numeroAtendimento']}',
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: Colors.blueGrey,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${d['descricaoServico']}',
                        style: const TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 17,
                        ),
                      ),
                    ],
                  ),
                ),
                Chip(label: Text('${d['status']}')),
              ],
            ),
            const SizedBox(height: 12),
            InfoRow(
              icon: Icons.calendar_month,
              text: formatDate(d['agendadoPara']),
            ),
            InfoRow(
              icon: Icons.location_on_outlined,
              text: '${d['bairro']} · ${d['cidade']}',
            ),
            InfoRow(
              icon: Icons.payments_outlined,
              text: formatMoney(d['valorRepasse']),
            ),
            if (accepted) ...[
              const Divider(),
              InfoRow(icon: Icons.person_outline, text: '${d['nomeCliente']}'),
              InfoRow(
                icon: Icons.phone_outlined,
                text: '${d['telefoneCliente']}',
              ),
              if ('${d['telefoneAlternativo'] ?? ''}'.trim().isNotEmpty)
                InfoRow(
                  icon: Icons.phone_in_talk_outlined,
                  text: 'Alternativo: ${d['telefoneAlternativo']}',
                ),
              InfoRow(
                icon: Icons.home_outlined,
                text: '${d['endereco']} · ${d['bairro']} · ${d['cidade']}',
              ),
              if ('${d['referencia'] ?? ''}'.trim().isNotEmpty)
                InfoRow(
                  icon: Icons.near_me_outlined,
                  text: 'Referência: ${d['referencia']}',
                ),
            ] else
              const Padding(
                padding: EdgeInsets.only(top: 8),
                child: Text(
                  'Dados completos do cliente liberados após o aceite.',
                  style: TextStyle(color: Colors.deepOrange),
                ),
              ),
            const SizedBox(height: 12),
            if (widget.pending)
              Row(
                children: [
                  Expanded(
                    child: FilledButton(
                      onPressed: busy ? null : () => act('ACEITAR'),
                      child: const Text('Aceitar'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: busy ? null : () => act('RECUSAR'),
                      child: const Text('Recusar'),
                    ),
                  ),
                ],
              )
            else ...[
              if (d['status'] == 'ACEITO')
                FilledButton.icon(
                  onPressed: busy ? null : () => act('INICIAR_DESLOCAMENTO'),
                  icon: const Icon(Icons.route),
                  label: const Text('Iniciar deslocamento'),
                ),
              if (d['status'] == 'EM_EXECUCAO')
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: double.infinity,
                      margin: const EdgeInsets.only(bottom: 10),
                      padding: const EdgeInsets.all(11),
                      decoration: BoxDecoration(
                        color: locallyCompleted || photoCount > 0
                            ? const Color(0xFFE8F7EE)
                            : const Color(0xFFFFF1E6),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        locallyCompleted
                            ? 'Serviço concluído neste aparelho. Aguardando conexão para sincronizar.'
                            : photoCount > 0
                            ? '$photoCount imagem(ns) anexada(s). O serviço pode ser finalizado.'
                            : 'Obrigatório: anexe ao menos uma imagem para finalizar o serviço.',
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                    ),
                    if (locallyCompleted)
                      FilledButton.icon(
                        onPressed: null,
                        icon: const Icon(Icons.cloud_sync_outlined),
                        label: const Text(
                          'Concluído — aguardando sincronização',
                        ),
                      )
                    else
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          OutlinedButton.icon(
                            onPressed: busy
                                ? null
                                : () => act('CONFIRMAR_CHEGADA'),
                            icon: const Icon(Icons.location_on),
                            label: const Text('Cheguei ao local'),
                          ),
                          OutlinedButton.icon(
                            onPressed: busy ? null : photo,
                            icon: const Icon(Icons.camera_alt),
                            label: const Text('Adicionar foto'),
                          ),
                          FilledButton.icon(
                            onPressed: busy ? null : finish,
                            icon: const Icon(Icons.check_circle),
                            label: const Text('Finalizar serviço'),
                          ),
                        ],
                      ),
                  ],
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class PaymentList extends StatelessWidget {
  const PaymentList({
    super.key,
    required this.title,
    required this.payments,
    this.action,
    this.received = false,
  });
  final String title;
  final List<dynamic> payments;
  final Future<bool> Function(String, Map<String, dynamic>)? action;
  final bool received;
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.all(16),
    children: [
      Text(
        title,
        style: Theme.of(
          context,
        ).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
      ),
      const SizedBox(height: 8),
      if (payments.isEmpty)
        const EmptyState(text: 'Nenhum pagamento nesta situação.'),
      ...payments.map((raw) {
        final item = Map<String, dynamic>.from(raw as Map);
        return PaymentCard(item: item, received: received, action: action);
      }),
    ],
  );
}

class PaymentCard extends StatefulWidget {
  const PaymentCard({
    super.key,
    required this.item,
    required this.received,
    this.action,
  });
  final Map<String, dynamic> item;
  final bool received;
  final Future<bool> Function(String, Map<String, dynamic>)? action;
  @override
  State<PaymentCard> createState() => _PaymentCardState();
}

class _PaymentCardState extends State<PaymentCard> {
  bool busy = false;
  Future<void> invoice() async {
    final file = await FilePicker.pickFile(
      type: FileType.custom,
      allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png'],
    );
    if (file == null || widget.action == null) return;
    final bytes = await file.readAsBytes();
    final extension = (file.extension ?? '').toLowerCase();
    final mime = extension == 'pdf'
        ? 'application/pdf'
        : extension == 'png'
        ? 'image/png'
        : 'image/jpeg';
    setState(() => busy = true);
    await widget.action!('/api/montadores/pagamento-documento', {
      'pagamentoId': widget.item['id'],
      'valorTotal': widget.item['valorTotal'],
      'fileName': file.name,
      'mimeType': mime,
      'data': base64Encode(bytes),
      'operacaoId': '${DateTime.now().microsecondsSinceEpoch}-nfse',
    });
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item,
        canInvoice = [
          'AGUARDANDO_NFSE',
          'NFSE_REJEITADA',
        ].contains(item['status']);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'PAGAMENTO #${item['numero']} · ${item['status']}',
              style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                color: Colors.blueGrey,
              ),
            ),
            Text(
              formatMoney(item['valorTotal']),
              style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900),
            ),
            const Divider(),
            ...(item['itens'] as List? ?? []).map(
              (line) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 3),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        '#${line['numeroAtendimento']} · ${line['descricaoServico']}',
                      ),
                    ),
                    Text(formatMoney(line['valor'])),
                  ],
                ),
              ),
            ),
            if (item['nfseNome'] != null)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text(
                  'NFS-e: ${item['nfseNome']} · ${item['nfseStatus'] ?? ''}',
                ),
              ),
            if (canInvoice)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: FilledButton.icon(
                  onPressed: busy ? null : invoice,
                  icon: const Icon(Icons.upload_file),
                  label: Text(
                    busy ? 'Preparando…' : 'Anexar NFS-e pelo valor total',
                  ),
                ),
              ),
            if (widget.received)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Text('Pago em ${formatDate(item['pagoEm'])}'),
              ),
          ],
        ),
      ),
    );
  }
}

class InfoRow extends StatelessWidget {
  const InfoRow({super.key, required this.icon, required this.text});
  final IconData icon;
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 3),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: Colors.blueGrey),
        const SizedBox(width: 8),
        Expanded(child: Text(text)),
      ],
    ),
  );
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 60),
    child: Column(
      children: [
        const Icon(Icons.inbox_outlined, size: 48, color: Colors.blueGrey),
        const SizedBox(height: 12),
        Text(text, textAlign: TextAlign.center),
      ],
    ),
  );
}

String formatMoney(dynamic value) => NumberFormatHelper.money(value);
String formatDate(dynamic value) {
  final date = DateTime.tryParse(value?.toString() ?? '')?.toLocal();
  if (date == null) return '—';
  return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year} · ${date.hour.toString().padLeft(2, '0')}:${date.minute.toString().padLeft(2, '0')}';
}

class NumberFormatHelper {
  static String money(dynamic value) {
    final number = double.tryParse(value?.toString() ?? '') ?? 0;
    final parts = number.toStringAsFixed(2).split('.');
    final reversed = parts[0].split('').reversed.toList();
    final groups = <String>[];
    for (var i = 0; i < reversed.length; i += 3) {
      groups.add(reversed.skip(i).take(3).toList().reversed.join());
    }
    return 'R\$ ${groups.reversed.join('.')},${parts[1]}';
  }
}
