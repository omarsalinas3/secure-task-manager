/// Implements administrator operations. The API rejects them for non-admins.
library;

import '../../../core/network/api_client.dart';

/// A user as listed for administrators (no task contents).
class AdminUser {
  /// Creates an admin user row.
  const AdminUser({
    required this.id,
    required this.email,
    required this.role,
    required this.taskCount,
  });

  /// User identifier.
  final String id;

  /// Account email.
  final String email;

  /// `USER` or `ADMIN`.
  final String role;

  /// Number of tasks the user owns.
  final int taskCount;

  /// Parses the API row.
  factory AdminUser.fromJson(Map<String, dynamic> json) => AdminUser(
    id: json['id'] as String,
    email: json['email'] as String,
    role: json['role'] as String,
    taskCount: json['taskCount'] as int? ?? 0,
  );
}

/// Coordinates administrator requests.
class AdminRepository {
  /// Creates a repository using [client].
  AdminRepository(this._client);

  final ApiClient _client;

  /// Lists users.
  Future<List<AdminUser>> users({int page = 1, int limit = 50}) async {
    final result = await _client.send(
      'GET',
      'admin/users',
      query: {'page': '$page', 'limit': '$limit'},
    );
    return (result['items'] as List<dynamic>? ?? [])
        .map((item) => AdminUser.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  /// Changes another user's role.
  Future<AdminUser> setRole(AdminUser user, String role) async {
    final result = await _client.send(
      'PATCH',
      'admin/users/${Uri.encodeComponent(user.id)}/role',
      body: {'role': role},
    );
    final item = result['item'] as Map<String, dynamic>;
    return AdminUser.fromJson({...item, 'taskCount': user.taskCount});
  }
}
