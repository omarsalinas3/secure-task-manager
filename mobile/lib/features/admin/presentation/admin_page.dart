/// Administrator screen: list users and change roles.
///
/// Hiding this screen from regular users is only a convenience; the API enforces roles.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/providers.dart';
import '../data/admin_repository.dart';

/// Users visible to administrators.
final adminUsersProvider = FutureProvider.autoDispose<List<AdminUser>>(
  (ref) => ref.watch(adminRepositoryProvider).users(),
);

/// Lists users with their roles and task counts.
class AdminPage extends ConsumerWidget {
  /// Creates the page; [currentUserId] cannot change their own role.
  const AdminPage({super.key, required this.currentUserId});

  /// The signed-in administrator.
  final String currentUserId;

  Future<void> _setRole(
    BuildContext context,
    WidgetRef ref,
    AdminUser user,
    String role,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(adminRepositoryProvider).setRole(user, role);
      ref.invalidate(adminUsersProvider);
      messenger.showSnackBar(
        SnackBar(content: Text('${user.email} is now $role.')),
      );
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final users = ref.watch(adminUsersProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Administration')),
      body: users.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text(error.toString())),
        data: (items) => ListView(
          children: [
            for (final user in items)
              ListTile(
                leading: Icon(
                  user.role == 'ADMIN'
                      ? Icons.shield_outlined
                      : Icons.person_outline,
                ),
                title: Text(user.email),
                subtitle: Text('${user.role} · ${user.taskCount} tasks'),
                trailing: user.id == currentUserId
                    ? const Text('You')
                    : PopupMenuButton<String>(
                        tooltip: 'Change role',
                        onSelected: (role) =>
                            _setRole(context, ref, user, role),
                        itemBuilder: (_) => [
                          for (final role in const ['USER', 'ADMIN'])
                            PopupMenuItem(
                              value: role,
                              enabled: role != user.role,
                              child: Text('Make $role'),
                            ),
                        ],
                      ),
              ),
          ],
        ),
      ),
    );
  }
}
