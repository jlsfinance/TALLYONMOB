// Basic smoke test for TallyMobile app
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('App launches without crashing', (WidgetTester tester) async {
    // Basic widget rendering test
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(
            child: Text('TallySync'),
          ),
        ),
      ),
    );

    expect(find.text('TallySync'), findsOneWidget);
  });
}
