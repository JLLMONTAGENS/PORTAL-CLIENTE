import 'package:flutter_test/flutter_test.dart';
import 'package:jll_atendimento/main.dart';

void main() {
  test('URL do app abre a central no modo compacto', () {
    final uri = buildAdminUri();
    expect(uri.path, '/admin/');
    expect(uri.queryParameters['app'], '1');
  });
}
