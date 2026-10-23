/// Widget tests for the loading, empty, error, and populated task-list states.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:secure_task_manager/features/tasks/domain/task.dart';
import 'package:secure_task_manager/features/tasks/presentation/task_list_view.dart';

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

TaskListView _view({
  bool loading = false,
  List<Task> tasks = const [],
  String? errorMessage,
  VoidCallback? onRetry,
  ValueChanged<Task>? onToggle,
  ValueChanged<Task>? onDelete,
  ValueChanged<Task>? onEdit,
  bool hasMore = false,
  VoidCallback? onLoadMore,
}) {
  return TaskListView(
    loading: loading,
    tasks: tasks,
    errorMessage: errorMessage,
    onRetry: onRetry ?? () {},
    onToggle: onToggle ?? (_) {},
    onDelete: onDelete ?? (_) {},
    onEdit: onEdit,
    hasMore: hasMore,
    onLoadMore: onLoadMore,
  );
}

const _tasks = [
  Task(id: 'c1', title: 'Buy milk', description: '2 liters', completed: false),
  Task(id: 'c2', title: 'Write report', completed: true),
];

void main() {
  testWidgets('shows a progress indicator while loading', (tester) async {
    await tester.pumpWidget(_wrap(_view(loading: true)));
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('shows the empty state', (tester) async {
    await tester.pumpWidget(_wrap(_view()));
    expect(find.text('No tasks yet. Add your first task.'), findsOneWidget);
  });

  testWidgets('shows the error with a working retry button', (tester) async {
    var retries = 0;
    await tester.pumpWidget(
      _wrap(
        _view(errorMessage: 'Could not connect.', onRetry: () => retries++),
      ),
    );

    expect(find.text('Could not connect.'), findsOneWidget);
    await tester.tap(find.text('Retry'));
    expect(retries, 1);
  });

  testWidgets('renders tasks and forwards toggle, edit, and delete', (
    tester,
  ) async {
    Task? toggled;
    Task? deleted;
    Task? edited;
    await tester.pumpWidget(
      _wrap(
        _view(
          tasks: _tasks,
          onToggle: (t) => toggled = t,
          onDelete: (t) => deleted = t,
          onEdit: (t) => edited = t,
        ),
      ),
    );

    expect(find.text('Buy milk'), findsOneWidget);
    expect(find.text('2 liters'), findsOneWidget);
    expect(find.text('Write report'), findsOneWidget);
    final checkboxes = tester
        .widgetList<Checkbox>(find.byType(Checkbox))
        .toList();
    expect(checkboxes.map((c) => c.value), [false, true]);

    await tester.tap(find.byType(Checkbox).first);
    expect(toggled?.id, 'c1');

    await tester.tap(find.byTooltip('Delete task').last);
    expect(deleted?.id, 'c2');

    await tester.tap(find.text('Write report'));
    expect(edited?.id, 'c2');
  });

  testWidgets('offers "Load more" only when more pages exist', (tester) async {
    var loads = 0;
    await tester.pumpWidget(
      _wrap(_view(tasks: _tasks, hasMore: true, onLoadMore: () => loads++)),
    );
    await tester.tap(find.text('Load more'));
    expect(loads, 1);

    await tester.pumpWidget(_wrap(_view(tasks: _tasks)));
    expect(find.text('Load more'), findsNothing);
  });
}
