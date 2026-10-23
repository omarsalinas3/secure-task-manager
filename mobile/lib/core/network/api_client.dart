/// Sends authenticated requests to the versioned Task Manager API.
library;

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../config/app_config.dart';
import '../storage/token_store.dart';

/// A safe API failure with a user-displayable message.
class ApiException implements Exception {
  /// Creates an API exception.
  const ApiException(this.message, {this.statusCode, this.code});

  /// A safe message that does not contain server internals.
  final String message;

  /// HTTP status code, when available.
  final int? statusCode;

  /// Stable API error code (for example `VALIDATION_ERROR`), when available.
  final String? code;

  @override
  String toString() => message;
}

/// Builds requests, attaches tokens, and performs one refresh-and-retry cycle.
class ApiClient {
  /// Creates a client with injectable HTTP and token-storage dependencies.
  ApiClient(
    this._http,
    this._tokens, {
    this.onSessionExpired,
    String? baseUrl,
    this.timeout = const Duration(seconds: 15),
  }) : _baseUrl = baseUrl ?? AppConfig.apiBaseUrl;

  final http.Client _http;
  final TokenStore _tokens;
  final String _baseUrl;

  /// Maximum time to wait for one HTTP exchange.
  final Duration timeout;

  /// Called after refresh fails and local credentials have been cleared.
  final VoidCallback? onSessionExpired;

  Future<bool>? _refreshInFlight;

  static const _authPaths = {
    'auth/refresh',
    'auth/login',
    'auth/register',
    'auth/logout',
  };

  /// Builds a fresh request so the request can safely be retried.
  ///
  /// Query values go through [query] so they are encoded, never concatenated into the path.
  Future<http.Request> _buildRequest(
    String method,
    String path,
    Map<String, dynamic>? body, {
    Map<String, String>? query,
    bool withAuth = true,
  }) async {
    final base = Uri.parse(_baseUrl);
    final joinedPath = '${base.path}/$path'.replaceAll(RegExp(r'/+'), '/');
    final uri = base.replace(
      path: joinedPath,
      queryParameters: (query == null || query.isEmpty) ? null : query,
    );
    final request = http.Request(method, uri)
      ..headers['accept'] = 'application/json'
      ..headers['content-type'] = 'application/json';

    if (withAuth) {
      final token = await _tokens.readAccessToken();
      if (token != null) request.headers['authorization'] = 'Bearer $token';
    }
    if (body != null) request.body = jsonEncode(body);
    return request;
  }

  /// Sends a JSON request and returns its decoded response object.
  ///
  /// A protected request that receives 401 may refresh once and retry once.
  /// Throws [ApiException] for unsuccessful responses or malformed JSON.
  Future<Map<String, dynamic>> send(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? query,
  }) async {
    final isAuthPath = _authPaths.contains(path);
    var response = await _sendRequest(
      await _buildRequest(method, path, body, query: query),
    );

    if (response.statusCode == 401 && !isAuthPath) {
      if (await _refreshTokens()) {
        response = await _sendRequest(
          await _buildRequest(method, path, body, query: query),
        );
      } else {
        throw const ApiException(
          'Your session has expired. Please sign in again.',
          statusCode: 401,
        );
      }
    }

    return _decodeResponse(response, isAuthPath: isAuthPath);
  }

  Future<http.Response> _sendRequest(http.Request request) async {
    try {
      final streamed = await _http.send(request).timeout(timeout);
      return await http.Response.fromStream(streamed).timeout(timeout);
    } on ApiException {
      rethrow;
    } catch (_) {
      throw const ApiException(
        'Could not connect to the server. Check your connection and try again.',
      );
    }
  }

  /// Reads the API's curated `error` object. Raw bodies are never surfaced.
  ({String? code, String? message}) _readError(http.Response response) {
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic> && decoded['error'] is Map) {
        final error = decoded['error'] as Map;
        final code = error['code'];
        final message = error['message'];
        return (
          code: code is String && code.length <= 40 ? code : null,
          message: message is String && message.length <= 200 ? message : null,
        );
      }
    } catch (_) {
      // Fall through to the generic message.
    }
    return (code: null, message: null);
  }

  Future<Map<String, dynamic>> _decodeResponse(
    http.Response response, {
    bool isAuthPath = false,
  }) async {
    if (response.statusCode == 401 && !isAuthPath) {
      throw const ApiException(
        'Your session has expired. Please sign in again.',
        statusCode: 401,
      );
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      final error = _readError(response);
      // Server-side 5xx details are never shown; 4xx messages are written for users.
      final useServerMessage =
          response.statusCode < 500 && error.message != null;
      throw ApiException(
        useServerMessage
            ? error.message!
            : 'The request could not be completed. Try again.',
        statusCode: response.statusCode,
        code: error.code,
      );
    }
    if (response.statusCode == 204 || response.body.isEmpty) return {};
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        throw const ApiException('The server returned unexpected data.');
      }
      return decoded;
    } on ApiException {
      rethrow;
    } catch (_) {
      throw const ApiException('The server returned unexpected data.');
    }
  }

  /// Refreshes credentials once; concurrent callers share the same operation.
  Future<bool> _refreshTokens() {
    final inFlight = _refreshInFlight;
    if (inFlight != null) return inFlight;
    final refresh = _performRefresh();
    _refreshInFlight = refresh;
    return refresh.whenComplete(() => _refreshInFlight = null);
  }

  Future<bool> _performRefresh() async {
    try {
      final refreshToken = await _tokens.readRefreshToken();
      if (refreshToken == null) throw const ApiException('Session expired.');
      final request = await _buildRequest('POST', 'auth/refresh', {
        'refreshToken': refreshToken,
      }, withAuth: false);
      final response = await _sendRequest(request);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw const ApiException('Session expired.');
      }
      final decoded = jsonDecode(response.body) as Map<String, dynamic>;
      final accessToken = decoded['accessToken'];
      final newRefreshToken = decoded['refreshToken'];
      if (accessToken is! String || newRefreshToken is! String) {
        throw const ApiException('Session expired.');
      }
      await _tokens.saveTokens(accessToken, newRefreshToken);
      return true;
    } catch (_) {
      await _tokens.clear();
      onSessionExpired?.call();
      return false;
    }
  }
}
