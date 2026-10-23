/// Implements login, registration, and best-effort logout with the API.
library;

import '../../../core/network/api_client.dart';
import '../../../core/storage/token_store.dart';

/// Coordinates authentication requests and local token persistence.
class AuthRepository {
  /// Creates a repository using [client] and [tokens].
  AuthRepository(this._client, this._tokens, {this.deviceName});

  final ApiClient _client;
  final TokenStore _tokens;

  /// Optional label sent to the API so the user can recognize this session.
  final String? deviceName;

  /// Logs in and persists the returned access and refresh tokens.
  Future<void> login(String email, String password) async {
    final result = await _client.send(
      'POST',
      'auth/login',
      body: {
        'email': email,
        'password': password,
        if (deviceName != null) 'deviceName': deviceName,
      },
    );
    await _savePair(result);
  }

  /// Registers an account and persists its returned token pair.
  Future<void> register(String email, String password) async {
    final result = await _client.send(
      'POST',
      'auth/register',
      body: {
        'email': email,
        'password': password,
        if (deviceName != null) 'deviceName': deviceName,
      },
    );
    await _savePair(result);
  }

  /// Saves a token pair returned by an authentication endpoint.
  Future<void> savePair(Map<String, dynamic> result) => _savePair(result);

  Future<void> _savePair(Map<String, dynamic> result) async {
    final accessToken = result['accessToken'];
    final refreshToken = result['refreshToken'];
    if (accessToken is! String || refreshToken is! String) {
      throw const ApiException('The server returned unexpected data.');
    }
    await _tokens.saveTokens(accessToken, refreshToken);
  }

  /// Whether a refresh token is stored (the user may still be signed in).
  Future<bool> hasSession() async => await _tokens.readRefreshToken() != null;

  /// Attempts server-side logout and always clears local tokens.
  Future<void> logout() async {
    try {
      final refreshToken = await _tokens.readRefreshToken();
      if (refreshToken != null) {
        await _client.send(
          'POST',
          'auth/logout',
          body: {'refreshToken': refreshToken},
        );
      }
    } on ApiException {
      // Local logout still proceeds when the server cannot be reached.
    } finally {
      await _tokens.clear();
    }
  }
}
