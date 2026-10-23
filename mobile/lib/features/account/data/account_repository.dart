/// Implements profile, password, session, audit, and account-deletion operations.
library;

import '../../../core/network/api_client.dart';
import '../../../core/storage/token_store.dart';

/// The signed-in user's public profile.
class UserProfile {
  /// Creates a profile value.
  const UserProfile({
    required this.id,
    required this.email,
    required this.role,
  });

  /// Server-generated user identifier.
  final String id;

  /// Account email.
  final String email;

  /// `USER` or `ADMIN`.
  final String role;

  /// Whether the user may open administrator screens. The API enforces this too.
  bool get isAdmin => role == 'ADMIN';

  /// Parses the API profile object.
  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
    id: json['id'] as String,
    email: json['email'] as String,
    role: json['role'] as String,
  );
}

/// One signed-in device (a refresh-token family on the server).
class SessionInfo {
  /// Creates a session value.
  const SessionInfo({
    required this.id,
    required this.deviceName,
    required this.signedInAt,
    required this.lastRefreshedAt,
    required this.current,
  });

  /// Session identifier.
  final String id;

  /// Device label supplied at sign-in, if any.
  final String? deviceName;

  /// When the session started.
  final DateTime signedInAt;

  /// When the session last rotated its refresh token.
  final DateTime lastRefreshedAt;

  /// Whether this is the session of this app instance.
  final bool current;

  /// Parses the API session object.
  factory SessionInfo.fromJson(Map<String, dynamic> json) => SessionInfo(
    id: json['id'] as String,
    deviceName: json['deviceName'] as String?,
    signedInAt: DateTime.parse(json['signedInAt'] as String).toLocal(),
    lastRefreshedAt: DateTime.parse(json['lastRefreshedAt'] as String)
        .toLocal(),
    current: json['current'] as bool? ?? false,
  );
}

/// A security event recorded by the API (no personal data).
class AuditEntry {
  /// Creates an audit entry.
  const AuditEntry({
    required this.action,
    required this.outcome,
    required this.createdAt,
  });

  /// Action name such as `auth.login`.
  final String action;

  /// `success` or `failure`.
  final String outcome;

  /// When the event happened.
  final DateTime createdAt;

  /// Parses the API audit object.
  factory AuditEntry.fromJson(Map<String, dynamic> json) => AuditEntry(
    action: json['action'] as String,
    outcome: json['outcome'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
  );
}

/// Coordinates account-management requests.
class AccountRepository {
  /// Creates a repository using [client] and [tokens].
  AccountRepository(this._client, this._tokens, {this.deviceName});

  final ApiClient _client;
  final TokenStore _tokens;

  /// Device label sent when a password change issues a new session.
  final String? deviceName;

  /// Loads the signed-in user's profile.
  Future<UserProfile> me() async {
    final result = await _client.send('GET', 'auth/me');
    return UserProfile.fromJson(result['user'] as Map<String, dynamic>);
  }

  /// Changes the password; the server signs out every session and returns a new pair.
  Future<void> changePassword(
    String currentPassword,
    String newPassword,
  ) async {
    final result = await _client.send(
      'POST',
      'auth/change-password',
      body: {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
        if (deviceName != null) 'deviceName': deviceName,
      },
    );
    final accessToken = result['accessToken'];
    final refreshToken = result['refreshToken'];
    if (accessToken is! String || refreshToken is! String) {
      throw const ApiException('The server returned unexpected data.');
    }
    await _tokens.saveTokens(accessToken, refreshToken);
  }

  /// Lists active sessions.
  Future<List<SessionInfo>> sessions() async {
    final result = await _client.send('GET', 'auth/sessions');
    return (result['items'] as List<dynamic>? ?? [])
        .map((item) => SessionInfo.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  /// Signs out one session.
  Future<void> revokeSession(String sessionId) async {
    await _client.send(
      'DELETE',
      'auth/sessions/${Uri.encodeComponent(sessionId)}',
    );
  }

  /// Signs out every session except this one.
  Future<void> revokeOtherSessions() async {
    await _client.send('DELETE', 'auth/sessions');
  }

  /// Signs out every session, including this one, and clears local tokens.
  Future<void> logoutAll() async {
    try {
      await _client.send('POST', 'auth/logout-all');
    } finally {
      await _tokens.clear();
    }
  }

  /// Lists the user's recent security events.
  Future<List<AuditEntry>> auditEvents() async {
    final result = await _client.send('GET', 'auth/audit');
    return (result['items'] as List<dynamic>? ?? [])
        .map((item) => AuditEntry.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  /// Permanently deletes the account and clears local tokens.
  Future<void> deleteAccount(String password) async {
    await _client.send('DELETE', 'auth/account', body: {'password': password});
    await _tokens.clear();
  }
}
