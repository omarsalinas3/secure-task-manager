/// Displays task-list states and task completion controls.
library;

import 'package:flutter/material.dart';

import '../domain/task.dart';

/// Renders an asynchronous task-list result.
class TaskListView extends StatelessWidget {
  /// Creates a task list view.
  const TaskListView({
    super.key,
    required this.loading,
    required this.tasks,
    required this.errorMessage,
    required this.onRetry,
    required this.onToggle,
    required this.onDelete,
    this.onEdit,
    this.hasMore = false,
    this.loadingMore = false,
    this.onLoadMore,
    this.emptyMessage = 'No tasks yet. Add your first task.',
  });

  /// Whether the repository is loading tasks.
  final bool loading;

  /// Tasks to display after a successful load.
  final List<Task> tasks;

  /// Safe error message, if the request failed.
  final String? errorMessage;

  /// Callback to retry loading.
  final VoidCallback onRetry;

  /// Callback for completion changes.
  final ValueChanged<Task> onToggle;

  /// Callback for deletion.
  final ValueChanged<Task> onDelete;

  /// Callback for editing a task, if editing is supported.
  final ValueChanged<Task>? onEdit;

  /// Whether another page can be loaded.
  final bool hasMore;

  /// Whether the next page is loading.
  final bool loadingMore;

  /// Callback to load the next page.
  final VoidCallback? onLoadMore;

  /// Message shown when there are no tasks.
  final String emptyMessage;

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(errorMessage!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton(onPressed: onRetry, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    if (tasks.isEmpty) {
      return Center(child: Text(emptyMessage, textAlign: TextAlign.center));
    }

    final footer = hasMore ? 1 : 0;
    return ListView.builder(
      itemCount: tasks.length + footer,
      itemBuilder: (context, index) {
        if (index == tasks.length) {
          return Padding(
            padding: const EdgeInsets.all(12),
            child: Center(
              child: loadingMore
                  ? const CircularProgressIndicator()
                  : OutlinedButton(
                      onPressed: onLoadMore,
                      child: const Text('Load more'),
                    ),
            ),
          );
        }
        final task = tasks[index];
        return ListTile(
          leading: Checkbox(
            value: task.completed,
            onChanged: (_) => onToggle(task),
          ),
          title: Text(
            task.title,
            style: task.completed
                ? const TextStyle(decoration: TextDecoration.lineThrough)
                : null,
          ),
          subtitle: task.description == null ? null : Text(task.description!),
          onTap: onEdit == null ? null : () => onEdit!(task),
          trailing: IconButton(
            tooltip: 'Delete task',
            icon: const Icon(Icons.delete_outline),
            onPressed: () => onDelete(task),
          ),
        );
      },
    );
  }
}
