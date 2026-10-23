/// Wires the app's dependencies with Riverpod so tests can override any of them.
library;

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

import '../features/account/data/account_repository.dart';
import '../features/admin/data/admin_repository.dart';
import '../features/auth/data/auth_repository.dart';
import '../features/auth/presentation/auth_controller.dart';
import '../features/notifications/push_service.dart';
import '../features/tasks/data/task_repository.dart';
import 'network/api_client.dart';
import 'storage/token_store.dart';

/// Platform secure storage (Keychain on iOS, encrypted storage on Android).
final secureStorageProvider = Provider<FlutterSecureStorage>(
  (ref) => const FlutterSecureStorage(),
);

/// Token persistence.
final tokenStoreProvider = Provider<TokenStore>(
  (ref) => TokenStore(ref.watch(secureStorageProvider)),
);

/// Shared HTTP client, closed when the container is disposed.
final httpClientProvider = Provider<http.Client>((ref) {
  final client = http.Client();
  ref.onDispose(client.close);
  return client;
});

/// Generic device label shown in session management; deliberately not a fingerprint.
final deviceNameProvider = Provider<String?>(
  (ref) => kIsWeb ? 'Flutter web' : 'Flutter ${defaultTargetPlatform.name}',
);

/// API client whose failed refresh signs the user out of the app.
final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(
    ref.watch(httpClientProvider),
    ref.watch(tokenStoreProvider),
    onSessionExpired: () => ref.read(authStateProvider.notifier).signOut(),
  );
});

/// Authentication requests.
final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(
    ref.watch(apiClientProvider),
    ref.watch(tokenStoreProvider),
    deviceName: ref.watch(deviceNameProvider),
  ),
);

/// Account-management requests.
final accountRepositoryProvider = Provider<AccountRepository>(
  (ref) => AccountRepository(
    ref.watch(apiClientProvider),
    ref.watch(tokenStoreProvider),
    deviceName: ref.watch(deviceNameProvider),
  ),
);

/// Task requests.
final taskRepositoryProvider = Provider<TaskRepository>(
  (ref) => TaskRepository(ref.watch(apiClientProvider)),
);

/// Administrator requests.
final adminRepositoryProvider = Provider<AdminRepository>(
  (ref) => AdminRepository(ref.watch(apiClientProvider)),
);

/// Push token source; replace with a Firebase-backed implementation to enable push.
final pushTokenSourceProvider = Provider<PushTokenSource>(
  (ref) => const DisabledPushTokenSource(),
);

/// Push registration.
final pushServiceProvider = Provider<PushService>(
  (ref) => PushService(
    ref.watch(apiClientProvider),
    ref.watch(pushTokenSourceProvider),
  ),
);
