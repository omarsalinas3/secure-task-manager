/// Implements task operations using the remote Task Manager API.
library;

import '../../../core/network/api_client.dart';
import '../domain/task.dart';

/// Separates UI state management from HTTP details.
class TaskRepository {
  /// Creates a repository using [client].
  TaskRepository(this._client);

  final ApiClient _client;

  /// Fetches one page of the current user's tasks.
  ///
  /// Returns the tasks in the API response.
  Future<List<Task>> list({int page = 1, int limit = 20}) async {
    final result = await fetchPage(page: page, limit: limit);
    return result.items;
  }

  /// Fetches one page with optional search, completion filter, and cursor.
  ///
  /// Pass the previous page's [TaskPage.nextCursor] as [cursor] for stable paging.
  Future<TaskPage> fetchPage({
    int page = 1,
    int limit = 20,
    String? cursor,
    String? query,
    TaskStatusFilter status = TaskStatusFilter.all,
  }) async {
    final trimmed = query?.trim();
    final result = await _client.send(
      'GET',
      'tasks',
      query: {
        'page': '$page',
        'limit': '$limit',
        'status': status.name,
        'cursor': ?cursor,
        if (trimmed != null && trimmed.isNotEmpty) 'q': trimmed,
      },
    );
    return TaskPage.fromJson(result);
  }

  /// Creates a task using its editable fields.
  Future<Task> create(String title, String? description) async {
    final result = await _client.send(
      'POST',
      'tasks',
      body: {
        'title': title.trim(),
        if (description != null && description.trim().isNotEmpty)
          'description': description.trim(),
      },
    );
    return Task.fromJson(result['item'] as Map<String, dynamic>);
  }

  /// Updates a task's completion state.
  Future<Task> setCompleted(Task task, bool completed) async {
    final result = await _client.send(
      'PATCH',
      'tasks/${Uri.encodeComponent(task.id)}',
      body: {'completed': completed},
    );
    return Task.fromJson(result['item'] as Map<String, dynamic>);
  }

  /// Edits a task's title and description; an empty description clears it.
  Future<Task> edit(Task task, String title, String? description) async {
    final trimmed = description?.trim();
    final result = await _client.send(
      'PATCH',
      'tasks/${Uri.encodeComponent(task.id)}',
      body: {
        'title': title.trim(),
        'description': (trimmed == null || trimmed.isEmpty) ? null : trimmed,
      },
    );
    return Task.fromJson(result['item'] as Map<String, dynamic>);
  }

  /// Deletes a task by its identifier.
  Future<void> delete(String taskId) async {
    await _client.send('DELETE', 'tasks/${Uri.encodeComponent(taskId)}');
  }
}
