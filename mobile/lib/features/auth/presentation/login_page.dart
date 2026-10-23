/// Login and registration form.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import 'auth_controller.dart';

/// Validates an email address before it is sent (the server validates again).
String? validateEmail(String? value) {
  final email = value?.trim() ?? '';
  if (email.isEmpty) return 'Enter your email.';
  if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(email)) {
    return 'Enter a valid email.';
  }
  return null;
}

/// Validates a password. New accounts need 12–128 characters, like the API.
String? validatePassword(String? value, {required bool registering}) {
  final password = value ?? '';
  if (password.isEmpty) return 'Enter your password.';
  if (password.length > 128) return 'Use 128 characters or fewer.';
  if (registering && password.length < 12) return 'Use at least 12 characters.';
  return null;
}

/// Lets a user sign in or create an account.
class LoginPage extends ConsumerStatefulWidget {
  /// Creates the login page.
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _registering = false;
  bool _submitting = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    final auth = ref.read(authStateProvider.notifier);
    try {
      if (_registering) {
        await auth.register(_email.text, _password.text);
      } else {
        await auth.login(_email.text, _password.text);
      }
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sessionMessage = ref.watch(
      authStateProvider.select((s) => s.message),
    );
    // The "session expired" notice belongs to sign-in, not to account creation.
    final message = _error ?? (_registering ? null : sessionMessage);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: AutofillGroup(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Icon(
                        Icons.task_alt,
                        size: 56,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        _registering
                            ? 'Create your account'
                            : 'Sign in to your tasks',
                        textAlign: TextAlign.center,
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 24),
                      if (message != null) ...[
                        Text(
                          message,
                          key: const Key('auth-message'),
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],
                      TextFormField(
                        key: const Key('email'),
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email],
                        decoration: const InputDecoration(labelText: 'Email'),
                        validator: validateEmail,
                        textInputAction: TextInputAction.next,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        key: const Key('password'),
                        controller: _password,
                        obscureText: _obscure,
                        autofillHints: [
                          _registering
                              ? AutofillHints.newPassword
                              : AutofillHints.password,
                        ],
                        decoration: InputDecoration(
                          labelText: 'Password',
                          helperText: _registering
                              ? 'At least 12 characters.'
                              : null,
                          suffixIcon: IconButton(
                            tooltip: _obscure
                                ? 'Show password'
                                : 'Hide password',
                            icon: Icon(
                              _obscure
                                  ? Icons.visibility
                                  : Icons.visibility_off,
                            ),
                            onPressed: () =>
                                setState(() => _obscure = !_obscure),
                          ),
                        ),
                        validator: (v) =>
                            validatePassword(v, registering: _registering),
                        onFieldSubmitted: (_) =>
                            _registering ? null : _submit(),
                      ),
                      if (_registering) ...[
                        const SizedBox(height: 12),
                        TextFormField(
                          key: const Key('confirm-password'),
                          controller: _confirm,
                          obscureText: _obscure,
                          decoration: const InputDecoration(
                            labelText: 'Confirm password',
                          ),
                          validator: (v) => v == _password.text
                              ? null
                              : 'Passwords do not match.',
                          onFieldSubmitted: (_) => _submit(),
                        ),
                      ],
                      const SizedBox(height: 24),
                      FilledButton(
                        key: const Key('submit'),
                        onPressed: _submitting ? null : _submit,
                        child: _submitting
                            ? const SizedBox.square(
                                dimension: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : Text(_registering ? 'Create account' : 'Sign in'),
                      ),
                      TextButton(
                        onPressed: _submitting
                            ? null
                            : () => setState(() {
                                _registering = !_registering;
                                _error = null;
                              }),
                        child: Text(
                          _registering
                              ? 'Already have an account? Sign in'
                              : 'New here? Create an account',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
