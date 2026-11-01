import 'package:flutter_test/flutter_test.dart';
import 'package:jll_montador/main.dart';

void main() {
  test('formata valores de repasse em reais', () {
    expect(NumberFormatHelper.money(1250.5), r'R$ 1.250,50');
  });
}
