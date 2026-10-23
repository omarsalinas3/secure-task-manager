/// Account settings: password, sessions/devices, security activity, and deletion.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/providers.dart';
import '../../admin/presentation/admin_page.dart';
import '../../auth/presentation/auth_controller.dart';
import '../../auth/presentation/login_page.dart';
import '../../tasks/presentation/task_form_dialog.dart';
import '../data/account_repository.dart';

/// Signed-in user's profile.
final profileProvider = FutureProvider.autoDispose<UserProfile>(
  (ref) => ref.watch(accountRepositoryProvider).me(),
);

/// Active sessions.
final sessionsProvider = FutureProvider.autoDispose<List<SessionInfo>>(
  (ref) => ref.watch(accountRepositoryProvider).sessions(),
);

/// Recent security events.
final auditProvider = FutureProvider.autoDispose<List<AuditEntry>>(
  (ref) => ref.watch(accountRepositoryProvider).auditEvents(),
);

String _formatDate(DateTime value) {
  String two(int n) => n.toString().padLeft(2, '0');
  return '${value.year}-${two(value.month)}-${two(value.day)} ${two(value.hour)}:${two(value.minute)}';
}

/// Account settings screen.
class AccountPage extends ConsumerWidget {
  /// Creates the account page.
  const AccountPage({super.key});

  Future<void> _run(
    BuildContext context,
    Future<void> Function() action,
    String success,
  ) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await action();
      messenger.showSnackBar(SnackBar(content: Text(success)));
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _changePassword(BuildContext context, WidgetRef ref) async {
    final result = await showDialog<(String, String)>(
      context: context,
      builder: (_) => const _ChangePasswordDialog(),
    );
    if (result == null || !context.mounted) return;
    await _run(context, () async {
      await ref
          .read(accountRepositoryProvider)
          .changePassword(result.$1, result.$2);
      ref.invalidate(sessionsProvider);
      ref.invalidate(auditProvider);
    }, 'Password changed. Other devices were signed out.');
  }

  Future<void> _deleteAccount(BuildContext context, WidgetRef ref) async {
    final confirmed = await confirmAction(
      context,
      title: 'Delete account?',
      message: 'Your account, tasks, and sessions will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Continue',
    );
    if (!confirmed || !context.mounted) return;
    final password = await showDialog<String>(
      context: context,
      builder: (_) => const _PasswordPromptDialog(),
    );
    if (password == null || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    try {
      await ref.read(accountRepositoryProvider).deleteAccount(password);
      navigator.popUntil((route) => route.isFirst);
      ref
          .read(authStateProvider.notifier)
          .signOut(message: 'Your account was deleted.');
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  Future<void> _logoutAll(BuildContext context, WidgetRef ref) async {
    final confirmed = await confirmAction(
      context,
      title: 'Sign out everywhere?',
      message: 'Every device, including this one, will need to sign in again.',
      confirmLabel: 'Sign out all',
    );
    if (!confirmed || !context.mounted) return;
    final navigator = Navigator.of(context);
    try {
      await ref.read(accountRepositoryProvider).logoutAll();
    } on ApiException {
      // Local tokens are cleared regardless.
    }
    navigator.popUntil((route) => route.isFirst);
    ref
        .read(authStateProvider.notifier)
        .signOut(message: 'You signed out of all devices.');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);
    final sessions = ref.watch(sessionsProvider);
    final audit = ref.watch(auditProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(profileProvider);
          ref.invalidate(sessionsProvider);
          ref.invalidate(auditProvider);
        },
        child: ListView(
          children: [
            profile.when(
              loading: () => const ListTile(title: Text('Loading profile…')),
              error: (error, _) => ListTile(title: Text(error.toString())),
              data: (user) => Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.person_outline),
                    title: Text(user.email),
                    subtitle: Text(
                      user.isAdmin ? 'Administrator' : 'Standard account',
                    ),
                  ),
                  if (user.isAdmin)
                    ListTile(
                      leading: const Icon(Icons.admin_panel_settings_outlined),
                      title: const Text('Administration'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => AdminPage(currentUserId: user.id),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.password),
              title: const Text('Change password'),
              subtitle: const Text('Signs out your other devices'),
              onTap: () => _changePassword(context, ref),
            ),
            const _SectionHeader('Signed-in devices'),
            sessions.when(
              loading: () => const ListTile(title: Text('Loading sessions…')),
              error: (error, _) => ListTile(title: Text(error.toString())),
              data: (items) => Column(
                children: [
                  for (final session in items)
                    ListTile(
                      leading: Icon(
                        session.current
                            ? Icons.smartphone
                            : Icons.devices_other,
                      ),
                      title: Text(session.deviceName ?? 'Unnamed device'),
                      subtitle: Text(
                        '${session.current ? 'This device · ' : ''}'
                        'Signed in ${_formatDate(session.signedInAt)}',
                      ),
                      trailing: session.current
                          ? null
                          : IconButton(
                              tooltip: 'Sign out this device',
                              icon: const Icon(Icons.logout),
                              onPressed: () => _run(context, () async {
                                await ref
                                    .read(accountRepositoryProvider)
                                    .revokeSession(session.id);
                                ref.invalidate(sessionsProvider);
                              }, 'Device signed out.'),
                            ),
                    ),
                  if (items.length > 1)
                    TextButton.icon(
                      icon: const Icon(Icons.phonelink_erase),
                      label: const Text('Sign out all other devices'),
                      onPressed: () => _run(context, () async {
                        await ref
                            .read(accountRepositoryProvider)
                            .revokeOtherSessions();
                        ref.invalidate(sessionsProvider);
                      }, 'Other devices signed out.'),
                    ),
                ],
              ),
            ),
            ListTile(
              leading: const Icon(Icons.logout),
              title: const Text('Sign out of all devices'),
              onTap: () => _logoutAll(context, ref),
            ),
            const _SectionHeader('Recent security activity'),
            audit.when(
              loading: () => const ListTile(title: Text('Loading activity…')),
              error: (error, _) => ListTile(title: Text(error.toString())),
              data: (items) => Column(
                children: [
                  for (final entry in items.take(10))
                    ListTile(
                      dense: true,
                      leading: Icon(
                        entry.outcome == 'success'
                            ? Icons.check_circle_outline
                            : Icons.error_outline,
                        color: entry.outcome == 'success'
                            ? null
                            : Theme.of(context).colorScheme.error,
                      ),
                      title: Text(entry.action),
                      subtitle: Text(_formatDate(entry.createdAt)),
                    ),
                ],
              ),
            ),
            const Divider(),
            ListTile(
              leading: Icon(
                Icons.delete_forever,
                color: Theme.of(context).colorScheme.error,
              ),
              title: Text(
                'Delete account',
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
              onTap: () => _deleteAccount(context, ref),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
    child: Text(text, style: Theme.of(context).textTheme.titleSmall),
  );
}

class _ChangePasswordDialog extends StatefulWidget {
  const _ChangePasswordDialog();

  @override
  State<_ChangePasswordDialog> createState() => _ChangePasswordDialogState();
}

class _ChangePasswordDialogState extends State<_ChangePasswordDialog> {
  final _formKey = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Change password'),
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              controller: _current,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Current password'),
              validator: (v) => validatePassword(v, registering: false),
            ),
            TextFormField(
              controller: _next,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'New password'),
              validator: (v) {
                final error = validatePassword(v, registering: true);
                if (error != null) return error;
                return v == _current.text
                    ? 'Choose a different password.'
                    : null;
              },
            ),
            TextFormField(
              controller: _confirm,
              obscureText: true,
              decoration: const InputDecoration(
                labelText: 'Confirm new password',
              ),
              validator: (v) =>
                  v == _next.text ? null : 'Passwords do not match.',
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          onPressed: () {
            if (_formKey.currentState!.validate()) {
              Navigator.of(context).pop((_current.text, _next.text));
            }
          },
          child: const Text('Change'),
        ),
      ],
    );
  }
}

class _PasswordPromptDialog extends StatefulWidget {
  const _PasswordPromptDialog();

  @override
  State<_PasswordPromptDialog> createState() => _PasswordPromptDialogState();
}

class _PasswordPromptDialogState extends State<_PasswordPromptDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Confirm with your password'),
      content: TextField(
        controller: _controller,
        obscureText: true,
        autofocus: true,
        decoration: const InputDecoration(labelText: 'Password'),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
          onPressed: () {
            if (_controller.text.isNotEmpty) {
              Navigator.of(context).pop(_controller.text);
            }
          },
          child: const Text('Delete account'),
        ),
      ],
    );
  }
}
