/// Defines the task data used by the Flutter application.
library;

/// Represents a task owned by the signed-in user.
class Task {
  /// Creates a task value.
  ///
  /// [id] is the server-generated task identifier.
  /// [title] is the task title.
  /// [description] is optional detail.
  /// [completed] indicates whether the task is complete.
  const Task({
    required this.id,
    required this.title,
    this.description,
    required this.completed,
  });

  /// Server-generated task identifier.
  final String id;

  /// Short task title.
  final String title;

  /// Optional task details.
  final String? description;

  /// Completion state.
  final bool completed;

  /// Creates a task from the API JSON response.
  ///
  /// [json] is a decoded task object.
  /// Returns the parsed task.
  factory Task.fromJson(Map<String, dynamic> json) {
    return Task(
      id: json['id'] as String,
      title: json['title'] as String,
      description: json['description'] as String?,
      completed: json['completed'] as bool,
    );
  }

  /// Converts editable fields into a request payload.
  ///
  /// Returns only task fields accepted by the API.
  Map<String, dynamic> toWriteJson() => {
    'title': title,
    'description': description,
    'completed': completed,
  };
}

/// Completion filter accepted by the API's `status` query parameter.
enum TaskStatusFilter {
  /// Every task.
  all,

  /// Only tasks that are not completed.
  pending,

  /// Only completed tasks.
  completed,
}

/// One page of tasks plus the information needed to request the next one.
class TaskPage {
  /// Creates a page value.
  const TaskPage({
    required this.items,
    required this.total,
    required this.hasMore,
    this.nextCursor,
  });

  /// Tasks on this page.
  final List<Task> items;

  /// Number of tasks matching the current search and filter.
  final int total;

  /// Whether another page exists.
  final bool hasMore;

  /// Cursor for the next page, when [hasMore] is true.
  final String? nextCursor;

  /// Parses the API list response.
  factory TaskPage.fromJson(Map<String, dynamic> json) {
    final items = json['items'] as List<dynamic>? ?? [];
    return TaskPage(
      items: items
          .map((item) => Task.fromJson(item as Map<String, dynamic>))
          .toList(),
      total: json['total'] as int? ?? items.length,
      hasMore: json['hasMore'] as bool? ?? false,
      nextCursor: json['nextCursor'] as String?,
    );
  }
}
