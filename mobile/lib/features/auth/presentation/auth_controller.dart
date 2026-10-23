/// Holds the signed-in/signed-out state of the application.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/providers.dart';

/// Whether the app knows who is signed in.
enum AuthStatus {
  /// Stored credentials are still being checked.
  unknown,

  /// A session exists.
  signedIn,

  /// No session: the login screen is shown.
  signedOut,
}

/// Authentication state plus an optional safe message for the login screen.
class AuthState {
  /// Creates an auth state.
  const AuthState(this.status, {this.message});

  /// Current status.
  final AuthStatus status;

  /// Message to show on the login screen (for example, session expired).
  final String? message;
}

/// Exposes [AuthController].
final authStateProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);

/// Signs users in and out and reacts to expired sessions.
class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    Future.microtask(_restore);
    return const AuthState(AuthStatus.unknown);
  }

  Future<void> _restore() async {
    final hasSession = await ref.read(authRepositoryProvider).hasSession();
    if (!ref.mounted || state.status != AuthStatus.unknown) return;
    state = AuthState(hasSession ? AuthStatus.signedIn : AuthStatus.signedOut);
  }

  /// Signs in. Throws [ApiException] with a safe message on failure.
  Future<void> login(String email, String password) async {
    await ref.read(authRepositoryProvider).login(email.trim(), password);
    _onSignedIn();
  }

  /// Registers and signs in. Throws [ApiException] with a safe message on failure.
  Future<void> register(String email, String password) async {
    await ref.read(authRepositoryProvider).register(email.trim(), password);
    _onSignedIn();
  }

  void _onSignedIn() {
    state = const AuthState(AuthStatus.signedIn);
    ref.read(pushServiceProvider).registerDevice();
  }

  /// Logs out on the server (best effort) and always clears local tokens.
  Future<void> logout() async {
    await ref.read(pushServiceProvider).unregisterDevice();
    await ref.read(authRepositoryProvider).logout();
    state = const AuthState(AuthStatus.signedOut);
  }

  /// Moves to the login screen after tokens were cleared elsewhere.
  void signOut({
    String message = 'Your session has expired. Please sign in again.',
  }) {
    if (state.status == AuthStatus.signedOut) return;
    state = AuthState(AuthStatus.signedOut, message: message);
  }
}
