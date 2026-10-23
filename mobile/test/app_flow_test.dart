/// End-to-end widget flow against a fake API: sign in, see tasks, expire session, log out.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:secure_task_manager/core/providers.dart';
import 'package:secure_task_manager/main.dart';

import 'fakes.dart';

/// Minimal in-memory API that behaves like the backend for the routes the UI uses.
class FakeApi {
  final List<Map<String, dynamic>> tasks = [];
  bool refreshAllowed = true;
  bool accessValid = true;
  int logoutCalls = 0;

  http.Response _json(Object body, [int status = 200]) =>
      http.Response(jsonEncode(body), status);

  Future<http.Response> handle(http.Request request) async {
    final path = request.url.path.replaceFirst('/api/v1/', '');
    if (path == 'auth/login') {
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      if (body['password'] != 'correct-password') {
        return _json({
          'error': {
            'code': 'UNAUTHENTICATED',
            'message': 'Invalid email or password.',
          },
        }, 401);
      }
      accessValid = true;
      return _json({
        'accessToken': 'access-1',
        'refreshToken': 'refresh-1',
        'expiresIn': 600,
      });
    }
    if (path == 'auth/refresh') {
      if (!refreshAllowed) {
        return _json({
          'error': {'code': 'UNAUTHENTICATED'},
        }, 401);
      }
      accessValid = true;
      return _json({
        'accessToken': 'access-2',
        'refreshToken': 'refresh-2',
        'expiresIn': 600,
      });
    }
    if (path == 'auth/logout') {
      logoutCalls++;
      return http.Response('', 204);
    }
    if (!accessValid) {
      return _json({
        'error': {'code': 'UNAUTHENTICATED'},
      }, 401);
    }
    if (path == 'tasks' && request.method == 'GET') {
      return _json({
        'items': tasks,
        'total': tasks.length,
        'hasMore': false,
        'nextCursor': null,
      });
    }
    if (path == 'tasks' && request.method == 'POST') {
      final body = jsonDecode(request.body) as Map<String, dynamic>;
      final task = {
        'id': 'c${tasks.length + 1}',
        'title': body['title'],
        'description': body['description'],
        'completed': false,
      };
      tasks.insert(0, task);
      return _json({'item': task}, 201);
    }
    return _json({
      'error': {'code': 'NOT_FOUND', 'message': 'Route not found.'},
    }, 404);
  }
}

void main() {
  late FakeApi api;
  late FakeTokenStore tokens;

  Widget app() => ProviderScope(
    overrides: [
      httpClientProvider.overrideWithValue(MockClient(api.handle)),
      tokenStoreProvider.overrideWithValue(tokens),
    ],
    child: const TaskManagerApp(),
  );

  setUp(() {
    api = FakeApi();
    tokens = FakeTokenStore();
  });

  testWidgets('wrong password shows the generic API message', (tester) async {
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('email')), 'me@example.test');
    await tester.enterText(find.byKey(const Key('password')), 'wrong');
    await tester.tap(find.byKey(const Key('submit')));
    await tester.pumpAndSettle();

    expect(find.text('Invalid email or password.'), findsOneWidget);
    expect(tokens.accessToken, isNull);
  });

  testWidgets('sign in, add a task, then log out clears secure storage', (
    tester,
  ) async {
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('email')), 'me@example.test');
    await tester.enterText(
      find.byKey(const Key('password')),
      'correct-password',
    );
    await tester.tap(find.byKey(const Key('submit')));
    await tester.pumpAndSettle();

    expect(find.text('My tasks'), findsOneWidget);
    expect(find.text('No tasks yet. Add your first task.'), findsOneWidget);
    expect(tokens.accessToken, 'access-1');

    await tester.tap(find.text('Add task'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const Key('task-title')),
      'Review API security',
    );
    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();
    expect(find.text('Review API security'), findsOneWidget);

    await tester.tap(find.byTooltip('Log out'));
    await tester.pumpAndSettle();
    expect(find.text('Sign in to your tasks'), findsOneWidget);
    expect(api.logoutCalls, 1);
    expect(tokens.accessToken, isNull);
    expect(tokens.refreshToken, isNull);
  });

  testWidgets('a revoked session (e.g. logout-all) returns the app to login', (
    tester,
  ) async {
    tokens = FakeTokenStore(accessToken: 'stale', refreshToken: 'revoked');
    api.accessValid = false;
    api.refreshAllowed = false;

    await tester.pumpWidget(app());
    await tester.pumpAndSettle();

    expect(find.text('Sign in to your tasks'), findsOneWidget);
    expect(
      find.text('Your session has expired. Please sign in again.'),
      findsOneWidget,
    );
    expect(tokens.refreshToken, isNull);
  });

  testWidgets('an expired access token is refreshed transparently', (
    tester,
  ) async {
    tokens = FakeTokenStore(accessToken: 'expired', refreshToken: 'refresh-1');
    api.accessValid = false;
    api.tasks.add({
      'id': 'c1',
      'title': 'Still here',
      'description': null,
      'completed': false,
    });

    await tester.pumpWidget(app());
    await tester.pumpAndSettle();

    expect(find.text('Still here'), findsOneWidget);
    expect(tokens.refreshToken, 'refresh-2');
  });
}
