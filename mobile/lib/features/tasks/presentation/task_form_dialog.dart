/// Validated form for creating and editing a task.
library;

import 'package:flutter/material.dart';

import '../domain/task.dart';

/// Values submitted by [TaskFormDialog].
typedef TaskFormResult = ({String title, String? description});

/// Validates a task title with the same rules as the API (1–120 characters).
String? validateTaskTitle(String? value) {
  final title = value?.trim() ?? '';
  if (title.isEmpty) return 'Enter a title.';
  if (title.length > 120) return 'Use 120 characters or fewer.';
  return null;
}

/// Validates a task description with the same rules as the API (at most 2000).
String? validateTaskDescription(String? value) {
  if ((value?.trim().length ?? 0) > 2000) {
    return 'Use 2000 characters or fewer.';
  }
  return null;
}

/// Shows the dialog; returns null when cancelled. Pass [task] to edit it.
Future<TaskFormResult?> showTaskFormDialog(BuildContext context, {Task? task}) {
  return showDialog<TaskFormResult>(
    context: context,
    builder: (_) => TaskFormDialog(task: task),
  );
}

/// A dialog with title and description fields.
class TaskFormDialog extends StatefulWidget {
  /// Creates the dialog; [task] pre-fills the fields for editing.
  const TaskFormDialog({super.key, this.task});

  /// Task being edited, or null to create one.
  final Task? task;

  @override
  State<TaskFormDialog> createState() => _TaskFormDialogState();
}

class _TaskFormDialogState extends State<TaskFormDialog> {
  final _formKey = GlobalKey<FormState>();
  late final _title = TextEditingController(text: widget.task?.title);
  late final _description = TextEditingController(
    text: widget.task?.description,
  );

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    final description = _description.text.trim();
    Navigator.of(context).pop<TaskFormResult>((
      title: _title.text.trim(),
      description: description.isEmpty ? null : description,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final editing = widget.task != null;
    return AlertDialog(
      title: Text(editing ? 'Edit task' : 'New task'),
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextFormField(
              key: const Key('task-title'),
              controller: _title,
              autofocus: true,
              maxLength: 120,
              decoration: const InputDecoration(labelText: 'Title'),
              validator: validateTaskTitle,
              textInputAction: TextInputAction.next,
            ),
            TextFormField(
              key: const Key('task-description'),
              controller: _description,
              maxLength: 2000,
              minLines: 1,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Description (optional)',
              ),
              validator: validateTaskDescription,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        FilledButton(onPressed: _submit, child: Text(editing ? 'Save' : 'Add')),
      ],
    );
  }
}

/// Asks the user to confirm a destructive action.
Future<bool> confirmAction(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Delete',
}) async {
  final confirmed = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  return confirmed ?? false;
}
