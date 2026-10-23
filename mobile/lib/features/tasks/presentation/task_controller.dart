/// Keeps task-list state outside the widget tree.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../../core/providers.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/task.dart';

/// Immutable task-list state.
class TaskListState {
  /// Creates a state value.
  const TaskListState({
    this.loading = true,
    this.loadingMore = false,
    this.tasks = const [],
    this.errorMessage,
    this.query = '',
    this.status = TaskStatusFilter.all,
    this.total = 0,
    this.hasMore = false,
    this.nextCursor,
  });

  /// Whether the first page is loading.
  final bool loading;

  /// Whether a further page is loading.
  final bool loadingMore;

  /// Loaded tasks.
  final List<Task> tasks;

  /// Safe error message for the last failed load.
  final String? errorMessage;

  /// Current search text.
  final String query;

  /// Current completion filter.
  final TaskStatusFilter status;

  /// Tasks matching the search and filter on the server.
  final int total;

  /// Whether more pages are available.
  final bool hasMore;

  /// Cursor of the next page.
  final String? nextCursor;

  /// Returns a copy with the given fields replaced.
  TaskListState copyWith({
    bool? loading,
    bool? loadingMore,
    List<Task>? tasks,
    String? Function()? errorMessage,
    String? query,
    TaskStatusFilter? status,
    int? total,
    bool? hasMore,
    String? Function()? nextCursor,
  }) {
    return TaskListState(
      loading: loading ?? this.loading,
      loadingMore: loadingMore ?? this.loadingMore,
      tasks: tasks ?? this.tasks,
      errorMessage: errorMessage != null ? errorMessage() : this.errorMessage,
      query: query ?? this.query,
      status: status ?? this.status,
      total: total ?? this.total,
      hasMore: hasMore ?? this.hasMore,
      nextCursor: nextCursor != null ? nextCursor() : this.nextCursor,
    );
  }
}

/// Exposes [TaskController]; it is rebuilt whenever the signed-in state changes.
final taskControllerProvider = NotifierProvider<TaskController, TaskListState>(
  TaskController.new,
);

/// Loads, searches, pages, and mutates the user's tasks.
class TaskController extends Notifier<TaskListState> {
  static const _pageSize = 20;

  @override
  TaskListState build() {
    final status = ref.watch(authStateProvider.select((s) => s.status));
    if (status == AuthStatus.signedIn) Future.microtask(load);
    return const TaskListState();
  }

  /// Loads the first page for the current search and filter.
  Future<void> load() async {
    final query = state.query;
    final filter = state.status;
    state = state.copyWith(loading: true, errorMessage: () => null);
    try {
      final page = await ref
          .read(taskRepositoryProvider)
          .fetchPage(limit: _pageSize, query: query, status: filter);
      // Ignore results for a search the user has already replaced.
      if (!ref.mounted || state.query != query || state.status != filter) {
        return;
      }
      state = state.copyWith(
        loading: false,
        tasks: page.items,
        total: page.total,
        hasMore: page.hasMore,
        nextCursor: () => page.nextCursor,
      );
    } on ApiException catch (error) {
      if (!ref.mounted) return;
      state = state.copyWith(loading: false, errorMessage: () => error.message);
    }
  }

  /// Loads the next page using the stable cursor.
  Future<void> loadMore() async {
    final cursor = state.nextCursor;
    if (state.loadingMore || !state.hasMore || cursor == null) return;
    state = state.copyWith(loadingMore: true);
    try {
      final page = await ref
          .read(taskRepositoryProvider)
          .fetchPage(
            limit: _pageSize,
            cursor: cursor,
            query: state.query,
            status: state.status,
          );
      if (!ref.mounted) return;
      state = state.copyWith(
        loadingMore: false,
        tasks: [...state.tasks, ...page.items],
        total: page.total,
        hasMore: page.hasMore,
        nextCursor: () => page.nextCursor,
      );
    } on ApiException {
      if (!ref.mounted) return;
      state = state.copyWith(loadingMore: false);
      rethrow;
    }
  }

  /// Changes the search text and reloads.
  Future<void> search(String query) async {
    if (query.trim() == state.query) return;
    state = state.copyWith(query: query.trim());
    await load();
  }

  /// Changes the completion filter and reloads.
  Future<void> setFilter(TaskStatusFilter status) async {
    if (status == state.status) return;
    state = state.copyWith(status: status);
    await load();
  }

  /// Creates a task and reloads so it appears in the correct order and filter.
  Future<void> create(String title, String? description) async {
    await ref.read(taskRepositoryProvider).create(title, description);
    await load();
  }

  /// Edits a task's title and description.
  Future<void> edit(Task task, String title, String? description) async {
    final updated = await ref
        .read(taskRepositoryProvider)
        .edit(task, title, description);
    _replace(updated);
  }

  /// Toggles completion, then reloads if the task no longer matches the filter.
  Future<void> toggle(Task task) async {
    final updated = await ref
        .read(taskRepositoryProvider)
        .setCompleted(task, !task.completed);
    if (state.status == TaskStatusFilter.all) {
      _replace(updated);
    } else {
      await load();
    }
  }

  /// Deletes a task.
  Future<void> delete(Task task) async {
    await ref.read(taskRepositoryProvider).delete(task.id);
    if (!ref.mounted) return;
    state = state.copyWith(
      tasks: state.tasks.where((t) => t.id != task.id).toList(),
      total: state.total > 0 ? state.total - 1 : 0,
    );
  }

  void _replace(Task updated) {
    if (!ref.mounted) return;
    state = state.copyWith(
      tasks: [for (final t in state.tasks) t.id == updated.id ? updated : t],
    );
  }
}
