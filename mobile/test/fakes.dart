/// Shared test doubles.
library;

import 'package:secure_task_manager/core/storage/token_store.dart';

/// In-memory [TokenStore] that records what was saved and cleared.
class FakeTokenStore implements TokenStore {
  /// Creates a store pre-loaded with an optional token pair.
  FakeTokenStore({this.accessToken, this.refreshToken});

  /// Current access token.
  String? accessToken;

  /// Current refresh token.
  String? refreshToken;

  /// Last access token passed to [saveTokens].
  String? savedAccessToken;

  /// Last refresh token passed to [saveTokens].
  String? savedRefreshToken;

  /// Number of [clear] calls.
  int clearCalls = 0;

  @override
  Future<String?> readAccessToken() async => accessToken;

  @override
  Future<String?> readRefreshToken() async => refreshToken;

  @override
  Future<void> saveTokens(String accessToken, String refreshToken) async {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    savedAccessToken = accessToken;
    savedRefreshToken = refreshToken;
  }

  @override
  Future<void> clear() async {
    clearCalls++;
    accessToken = null;
    refreshToken = null;
  }
}
