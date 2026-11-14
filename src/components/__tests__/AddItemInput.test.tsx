/**
 * OPTIMISE P6 step 1 (Fable audit task 137): the open list kept the
 * "Add item…" text in its own state, so every keystroke re-rendered the whole
 * 1,300-line screen and every card on it. The field now keeps its own text.
 */
import React, { useRef } from 'react';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { TextInput } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';

const modPath = join(__dirname, '..', 'AddItemInput.tsx');
const mod = existsSync(modPath) ? require('../AddItemInput') : null;
const AddItemInput = mod?.default;

let parentRenders = 0;
let handle: any;
const onSubmit = jest.fn();

function Parent({ editable = true }: { editable?: boolean }) {
  parentRenders++;
  const ref = useRef<any>(null);
  handle = ref;
  return <AddItemInput ref={ref} style={{}} placeholder="Add item..." editable={editable} onSubmit={onSubmit} />;
}

let tree: ReactTestRenderer;
const input = () => tree.root.findByType(TextInput);
const type = async (t: string) => { await act(async () => { input().props.onChangeText(t); }); };

beforeEach(async () => {
  expect(AddItemInput).toBeDefined();
  parentRenders = 0;
  onSubmit.mockClear();
  await act(async () => { tree = create(<Parent />); });
});

it('typing re-renders the field only, not the screen holding it', async () => {
  const before = parentRenders;
  for (const t of ['M', 'Mi', 'Mil', 'Milk']) await type(t);
  expect(parentRenders).toBe(before);
  expect(input().props.value).toBe('Milk');
});

it('submit sends the trimmed text and keeps it until the screen clears it', async () => {
  await type('  Bread  ');
  await act(async () => { input().props.onSubmitEditing(); });
  expect(onSubmit).toHaveBeenCalledWith('Bread');
  expect(input().props.value).toBe('  Bread  ');
  await act(async () => { handle.current.clear(); });
  expect(input().props.value).toBe('');
});

it('blank or spaces only: nothing is sent', async () => {
  await act(async () => { input().props.onSubmitEditing(); });
  await type('   ');
  await act(async () => { handle.current.submit(); });
  expect(onSubmit).not.toHaveBeenCalled();
});

it('the Add button path (handle.submit) sends the current text', async () => {
  await type('Eggs');
  await act(async () => { handle.current.submit(); });
  expect(onSubmit).toHaveBeenCalledWith('Eggs');
});

it('a locked or completed list makes it read-only', async () => {
  await act(async () => { tree.update(<Parent editable={false} />); });
  expect(input().props.editable).toBe(false);
});

it('ListDetailScreen no longer holds the typed text in its own state', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'screens', 'lists', 'ListDetailScreen.tsx'), 'utf8');
  expect(src).not.toMatch(/\[newItemName, setNewItemName\]/);
  expect(src).toContain('<AddItemInput');
});
