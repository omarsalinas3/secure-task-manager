/// Entry point of the Secure Task Manager Flutter client.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'features/auth/presentation/auth_controller.dart';
import 'features/auth/presentation/login_page.dart';
import 'features/tasks/presentation/task_page.dart';

void main() {
  runApp(const ProviderScope(child: TaskManagerApp()));
}

/// Root widget.
class TaskManagerApp extends StatelessWidget {
  /// Creates the app.
  const TaskManagerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Secure Task Manager',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: Colors.indigo, useMaterial3: true),
      darkTheme: ThemeData(
        colorSchemeSeed: Colors.indigo,
        brightness: Brightness.dark,
        useMaterial3: true,
      ),
      home: const AuthGate(),
    );
  }
}

/// Shows the login screen or the task list depending on the session state.
class AuthGate extends ConsumerWidget {
  /// Creates the gate.
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(authStateProvider.select((s) => s.status));
    return switch (status) {
      AuthStatus.unknown => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      ),
      AuthStatus.signedOut => const LoginPage(),
      AuthStatus.signedIn => const TaskPage(),
    };
  }
}
