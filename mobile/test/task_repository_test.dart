/// Verifies repository request shapes and JSON parsing with a mocktail ApiClient.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:secure_task_manager/core/network/api_client.dart';
import 'package:secure_task_manager/features/tasks/data/task_repository.dart';
import 'package:secure_task_manager/features/tasks/domain/task.dart';

class MockApiClient extends Mock implements ApiClient {}

Map<String, dynamic> _taskJson(
  String id, {
  bool completed = false,
  String? description,
}) => {
  'id': id,
  'ownerId': 'owner',
  'title': 'Task $id',
  'description': description,
  'completed': completed,
};

void main() {
  late MockApiClient client;
  late TaskRepository repository;

  setUp(() {
    client = MockApiClient();
    repository = TaskRepository(client);
  });

  test('parses a page with items and paging metadata', () async {
    when(() => client.send('GET', 'tasks', query: any(named: 'query')))
        .thenAnswer(
          (_) async => {
            'items': [
              _taskJson('c1'),
              _taskJson('c2', completed: true, description: 'd'),
            ],
            'total': 5,
            'hasMore': true,
            'nextCursor': 'c2',
          },
        );

    final page = await repository.fetchPage(
      limit: 2,
      query: '  milk ',
      status: TaskStatusFilter.pending,
    );

    expect(page.items.map((t) => t.id), ['c1', 'c2']);
    expect(page.items[1].completed, isTrue);
    expect(page.items[1].description, 'd');
    expect(page.total, 5);
    expect(page.hasMore, isTrue);
    expect(page.nextCursor, 'c2');
    final query =
        verify(
              () => client.send(
                'GET',
                'tasks',
                query: captureAny(named: 'query'),
              ),
            ).captured.single
            as Map<String, String>;
    expect(query, {
      'page': '1',
      'limit': '2',
      'status': 'pending',
      'q': 'milk',
    });
  });

  test('an empty list parses to no tasks', () async {
    when(() => client.send('GET', 'tasks', query: any(named: 'query')))
        .thenAnswer(
          (_) async => {'items': <dynamic>[], 'total': 0, 'hasMore': false},
        );
    expect(await repository.list(), isEmpty);
  });

  test('create trims input and never sends an owner ID', () async {
    when(() => client.send('POST', 'tasks', body: any(named: 'body')))
        .thenAnswer((_) async => {'item': _taskJson('c9')});

    await repository.create('  Buy milk ', '   ');

    final body =
        verify(
              () =>
                  client.send('POST', 'tasks', body: captureAny(named: 'body')),
            ).captured.single
            as Map<String, dynamic>;
    expect(body, {'title': 'Buy milk'});
    expect(body.containsKey('ownerId'), isFalse);
  });

  test('edit sends title and clears an empty description', () async {
    when(() => client.send('PATCH', 'tasks/c1', body: any(named: 'body')))
        .thenAnswer((_) async => {'item': _taskJson('c1')});
    const task = Task(
      id: 'c1',
      title: 'old',
      description: 'old',
      completed: false,
    );

    await repository.edit(task, ' New title ', '  ');

    final body =
        verify(
              () => client.send(
                'PATCH',
                'tasks/c1',
                body: captureAny(named: 'body'),
              ),
            ).captured.single
            as Map<String, dynamic>;
    expect(body, {'title': 'New title', 'description': null});
  });

  test('IDs are URL-encoded in paths', () async {
    when(() => client.send('DELETE', any())).thenAnswer((_) async => {});
    await repository.delete('../admin');
    verify(() => client.send('DELETE', 'tasks/..%2Fadmin')).called(1);
  });
}
