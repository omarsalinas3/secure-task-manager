/// Registers this installation for push notifications without logging tokens.
library;

import '../../core/network/api_client.dart';

/// Supplies the platform push token (for example from Firebase Cloud Messaging).
///
/// To enable real pushes, add `firebase_messaging`, configure a Firebase project, and
/// implement this with `FirebaseMessaging.instance.getToken()`.
abstract interface class PushTokenSource {
  /// Returns the current push token, or null when push is unavailable.
  Future<String?> getToken();

  /// Platform name accepted by the API: `android`, `ios`, or `web`.
  String get platform;
}

/// Default source used until a push provider is configured: push is disabled.
class DisabledPushTokenSource implements PushTokenSource {
  /// Creates a disabled source.
  const DisabledPushTokenSource();

  @override
  Future<String?> getToken() async => null;

  @override
  String get platform => 'android';
}

/// Registers and unregisters the device with the API.
///
/// Tokens are sent only in request bodies (never URLs) and are never printed.
class PushService {
  /// Creates a service using [client] and [source].
  PushService(this._client, this._source);

  final ApiClient _client;
  final PushTokenSource _source;

  /// Registers this device after sign-in. Failures are ignored: push is optional.
  Future<void> registerDevice() async {
    try {
      final token = await _source.getToken();
      if (token == null) return;
      await _client.send(
        'POST',
        'auth/devices',
        body: {'pushToken': token, 'platform': _source.platform},
      );
    } on ApiException {
      // Push registration must never block using the app.
    }
  }

  /// Unregisters this device before sign-out so it stops receiving notifications.
  Future<void> unregisterDevice() async {
    try {
      final token = await _source.getToken();
      if (token == null) return;
      await _client.send(
        'POST',
        'auth/devices/unregister',
        body: {'pushToken': token},
      );
    } on ApiException {
      // Sign-out proceeds regardless.
    }
  }
}
