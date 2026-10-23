/// Client-side validation mirrors the API rules (the API still validates again).
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:secure_task_manager/features/auth/presentation/login_page.dart';
import 'package:secure_task_manager/features/tasks/domain/task.dart';
import 'package:secure_task_manager/features/tasks/presentation/task_form_dialog.dart';

void main() {
  group('validators', () {
    test('email', () {
      expect(validateEmail(''), isNotNull);
      expect(validateEmail('not-an-email'), isNotNull);
      expect(validateEmail(' person@example.test '), isNull);
    });

    test('password', () {
      expect(validatePassword('', registering: false), isNotNull);
      expect(validatePassword('short', registering: false), isNull);
      expect(validatePassword('short', registering: true), isNotNull);
      expect(validatePassword('a' * 12, registering: true), isNull);
      expect(validatePassword('a' * 129, registering: true), isNotNull);
    });

    test('task fields', () {
      expect(validateTaskTitle('   '), isNotNull);
      expect(validateTaskTitle('x' * 121), isNotNull);
      expect(validateTaskTitle(' ok '), isNull);
      expect(validateTaskDescription('x' * 2001), isNotNull);
      expect(validateTaskDescription(null), isNull);
    });
  });

  testWidgets('task form blocks an empty title and returns trimmed values', (
    tester,
  ) async {
    TaskFormResult? result;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () async => result = await showTaskFormDialog(context),
            child: const Text('open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Add'));
    await tester.pump();
    expect(find.text('Enter a title.'), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('task-title')),
      '  Plan sprint  ',
    );
    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();
    expect(result?.title, 'Plan sprint');
    expect(result?.description, isNull);
  });

  testWidgets('edit form is pre-filled with the task', (tester) async {
    const task = Task(
      id: 'c1',
      title: 'Old title',
      description: 'Old notes',
      completed: false,
    );
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: TaskFormDialog(task: task)),
      ),
    );
    expect(find.text('Edit task'), findsOneWidget);
    expect(find.text('Old title'), findsOneWidget);
    expect(find.text('Old notes'), findsOneWidget);
    expect(find.text('Save'), findsOneWidget);
  });
}
