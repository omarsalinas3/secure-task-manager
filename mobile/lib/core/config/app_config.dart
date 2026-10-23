/// Provides environment-specific API configuration.
///
/// Values passed with `--dart-define` are app configuration, not secret storage.
library;

/// Holds the base URL for the selected development environment.
class AppConfig {
  /// Prevents creating configuration instances.
  const AppConfig._();

  /// Returns the API base URL supplied at build or run time.
  ///
  /// Use an HTTPS URL outside local development.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:3000/api/v1',
  );
}
