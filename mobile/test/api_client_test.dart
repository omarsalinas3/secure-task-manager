/// Verifies one refresh followed by one retry using MockClient, plus failure handling.
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:secure_task_manager/core/network/api_client.dart';

import 'fakes.dart';

const _base = 'http://api.test/api/v1';

void main() {
  test('refreshes once on 401 and retries the original request once', () async {
    var originalCalls = 0;
    var refreshCalls = 0;
    final mock = MockClient((request) async {
      if (request.url.path.endsWith('/auth/refresh')) {
        refreshCalls++;
        return http.Response(
          jsonEncode({
            'accessToken': 'new-access',
            'refreshToken': 'new-refresh',
          }),
          200,
        );
      }
      originalCalls++;
      if (originalCalls == 1) return http.Response('{}', 401);
      expect(request.headers['authorization'], 'Bearer new-access');
      return http.Response(jsonEncode({'items': []}), 200);
    });
    final tokens = FakeTokenStore(
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
    );
    final client = ApiClient(mock, tokens, baseUrl: _base);

    await client.send('GET', 'tasks');

    expect(refreshCalls, 1);
    expect(originalCalls, 2);
    expect(tokens.savedAccessToken, 'new-access');
    expect(tokens.savedRefreshToken, 'new-refresh');
  });

  test('concurrent 401s share a single refresh (single-flight)', () async {
    var refreshCalls = 0;
    final refreshGate = Completer<void>();
    final mock = MockClient((request) async {
      if (request.url.path.endsWith('/auth/refresh')) {
        refreshCalls++;
        await refreshGate.future;
        return http.Response(
          jsonEncode({'accessToken': 'a2', 'refreshToken': 'r2'}),
          200,
        );
      }
      if (request.headers['authorization'] == 'Bearer a1') {
        return http.Response('{}', 401);
      }
      return http.Response(jsonEncode({'items': []}), 200);
    });
    final tokens = FakeTokenStore(accessToken: 'a1', refreshToken: 'r1');
    final client = ApiClient(mock, tokens, baseUrl: _base);

    final requests = List.generate(3, (_) => client.send('GET', 'tasks'));
    await Future<void>.delayed(const Duration(milliseconds: 10));
    refreshGate.complete();
    await Future.wait(requests);

    expect(refreshCalls, 1);
  });

  test(
    'failed refresh clears tokens, notifies, and throws a safe message',
    () async {
      var expiredCalls = 0;
      final mock = MockClient((request) async {
        if (request.url.path.endsWith('/auth/refresh')) {
          return http.Response('{"error":{"code":"UNAUTHENTICATED"}}', 401);
        }
        return http.Response('{}', 401);
      });
      final tokens = FakeTokenStore(
        accessToken: 'secret-access',
        refreshToken: 'secret-refresh',
      );
      final client = ApiClient(
        mock,
        tokens,
        baseUrl: _base,
        onSessionExpired: () => expiredCalls++,
      );

      await expectLater(
        client.send('GET', 'tasks'),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 401)
              .having(
                (e) => e.message,
                'message',
                contains('session has expired'),
              ),
        ),
      );
      expect(tokens.clearCalls, 1);
      expect(tokens.accessToken, isNull);
      expect(expiredCalls, 1);
    },
  );

  test('auth endpoints are never refreshed or retried', () async {
    var calls = 0;
    final mock = MockClient((request) async {
      calls++;
      return http.Response(
        jsonEncode({
          'error': {
            'code': 'UNAUTHENTICATED',
            'message': 'Invalid email or password.',
          },
        }),
        401,
      );
    });
    final client = ApiClient(
      mock,
      FakeTokenStore(refreshToken: 'r'),
      baseUrl: _base,
    );

    await expectLater(
      client.send(
        'POST',
        'auth/login',
        body: {'email': 'a@b.test', 'password': 'x'},
      ),
      throwsA(
        isA<ApiException>().having(
          (e) => e.message,
          'message',
          'Invalid email or password.',
        ),
      ),
    );
    expect(calls, 1);
  });

  test('exceptions never contain tokens or raw server bodies', () async {
    final mock = MockClient(
      (request) async => http.Response(
        'Error: duplicate key at /srv/app/node_modules/pg ... Bearer secret-access',
        500,
      ),
    );
    final client = ApiClient(
      mock,
      FakeTokenStore(accessToken: 'secret-access'),
      baseUrl: _base,
    );

    try {
      await client.send('GET', 'tasks');
      fail('expected an ApiException');
    } on ApiException catch (error) {
      expect(error.statusCode, 500);
      expect(error.message, 'The request could not be completed. Try again.');
      expect(error.toString(), isNot(contains('secret')));
      expect(error.toString(), isNot(contains('node_modules')));
    }
  });

  test('uses the API\'s curated 4xx message and code', () async {
    final mock = MockClient(
      (request) async => http.Response(
        jsonEncode({
          'error': {'code': 'NOT_FOUND', 'message': 'Task not found.'},
        }),
        404,
      ),
    );
    final client = ApiClient(
      mock,
      FakeTokenStore(accessToken: 'a'),
      baseUrl: _base,
    );

    await expectLater(
      client.send('DELETE', 'tasks/c123'),
      throwsA(
        isA<ApiException>()
            .having((e) => e.message, 'message', 'Task not found.')
            .having((e) => e.code, 'code', 'NOT_FOUND'),
      ),
    );
  });

  test('malformed JSON becomes a safe error', () async {
    final mock = MockClient(
      (request) async => http.Response('<html>oops</html>', 200),
    );
    final client = ApiClient(
      mock,
      FakeTokenStore(accessToken: 'a'),
      baseUrl: _base,
    );
    await expectLater(
      client.send('GET', 'tasks'),
      throwsA(
        isA<ApiException>().having(
          (e) => e.message,
          'message',
          'The server returned unexpected data.',
        ),
      ),
    );
  });

  test('timeouts become a connection error', () async {
    final mock = MockClient((request) => Completer<http.Response>().future);
    final client = ApiClient(
      mock,
      FakeTokenStore(accessToken: 'a'),
      baseUrl: _base,
      timeout: const Duration(milliseconds: 50),
    );
    await expectLater(
      client.send('GET', 'tasks'),
      throwsA(
        isA<ApiException>().having(
          (e) => e.message,
          'message',
          contains('Could not connect'),
        ),
      ),
    );
  });

  test('204 responses decode to an empty map', () async {
    final mock = MockClient((request) async => http.Response('', 204));
    final client = ApiClient(
      mock,
      FakeTokenStore(accessToken: 'a'),
      baseUrl: _base,
    );
    expect(await client.send('DELETE', 'tasks/c1'), isEmpty);
  });

  test(
    'query parameters are encoded, not concatenated into the path',
    () async {
      late Uri seen;
      final mock = MockClient((request) async {
        seen = request.url;
        return http.Response(jsonEncode({'items': []}), 200);
      });
      final client = ApiClient(
        mock,
        FakeTokenStore(accessToken: 'a'),
        baseUrl: _base,
      );

      await client.send('GET', 'tasks', query: {'q': 'a&b=c', 'page': '1'});

      expect(seen.path, '/api/v1/tasks');
      expect(seen.queryParameters, {'q': 'a&b=c', 'page': '1'});
    },
  );
}
