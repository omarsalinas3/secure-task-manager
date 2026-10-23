/// Main screen: search, filter, list, create, edit, complete, and delete tasks.
library;

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_client.dart';
import '../../account/presentation/account_page.dart';
import '../../auth/presentation/auth_controller.dart';
import '../domain/task.dart';
import 'task_controller.dart';
import 'task_form_dialog.dart';
import 'task_list_view.dart';

/// Shows the signed-in user's tasks.
class TaskPage extends ConsumerStatefulWidget {
  /// Creates the task page.
  const TaskPage({super.key});

  @override
  ConsumerState<TaskPage> createState() => _TaskPageState();
}

class _TaskPageState extends ConsumerState<TaskPage> {
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  TaskController get _controller => ref.read(taskControllerProvider.notifier);

  /// Runs a mutation and shows its safe error message, if any.
  Future<void> _run(Future<void> Function() action, {String? success}) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await action();
      if (success != null) {
        messenger.showSnackBar(SnackBar(content: Text(success)));
      }
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    }
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(
      const Duration(milliseconds: 350),
      () => _controller.search(value),
    );
  }

  Future<void> _create() async {
    final result = await showTaskFormDialog(context);
    if (result == null) return;
    await _run(
      () => _controller.create(result.title, result.description),
      success: 'Task added.',
    );
  }

  Future<void> _edit(Task task) async {
    final result = await showTaskFormDialog(context, task: task);
    if (result == null) return;
    await _run(
      () => _controller.edit(task, result.title, result.description),
      success: 'Task saved.',
    );
  }

  Future<void> _delete(Task task) async {
    final confirmed = await confirmAction(
      context,
      title: 'Delete task?',
      message: '"${task.title}" will be permanently deleted.',
    );
    if (!confirmed) return;
    await _run(() => _controller.delete(task), success: 'Task deleted.');
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(taskControllerProvider);
    final filtering =
        state.query.isNotEmpty || state.status != TaskStatusFilter.all;

    return Scaffold(
      appBar: AppBar(
        title: const Text('My tasks'),
        actions: [
          IconButton(
            tooltip: 'Account',
            icon: const Icon(Icons.manage_accounts_outlined),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(builder: (_) => const AccountPage()),
            ),
          ),
          IconButton(
            tooltip: 'Log out',
            icon: const Icon(Icons.logout),
            onPressed: () => ref.read(authStateProvider.notifier).logout(),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: TextField(
              key: const Key('task-search'),
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: 'Search tasks',
                border: OutlineInputBorder(),
                isDense: true,
              ),
              maxLength: 100,
              buildCounter: (
                _, {
                required currentLength,
                required isFocused,
                maxLength,
              }) => null,
              onChanged: _onSearchChanged,
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
            child: SegmentedButton<TaskStatusFilter>(
              segments: const [
                ButtonSegment(value: TaskStatusFilter.all, label: Text('All')),
                ButtonSegment(
                  value: TaskStatusFilter.pending,
                  label: Text('Pending'),
                ),
                ButtonSegment(
                  value: TaskStatusFilter.completed,
                  label: Text('Done'),
                ),
              ],
              selected: {state.status},
              onSelectionChanged: (selection) =>
                  _controller.setFilter(selection.first),
            ),
          ),
          if (!state.loading && state.errorMessage == null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  '${state.total} task${state.total == 1 ? '' : 's'}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _controller.load,
              child: TaskListView(
                loading: state.loading,
                tasks: state.tasks,
                errorMessage: state.errorMessage,
                onRetry: _controller.load,
                onToggle: (task) => _run(() => _controller.toggle(task)),
                onDelete: _delete,
                onEdit: _edit,
                hasMore: state.hasMore,
                loadingMore: state.loadingMore,
                onLoadMore: () => _run(_controller.loadMore),
                emptyMessage: filtering
                    ? 'No tasks match your search.'
                    : 'No tasks yet. Add your first task.',
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _create,
        icon: const Icon(Icons.add),
        label: const Text('Add task'),
      ),
    );
  }
}
