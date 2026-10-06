/**
 * The home card's creator line (task 24): the date the list was really made,
 * shown once, with who made it when that is known.
 */
import React from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import AnimatedListCard from '../AnimatedListCard';
import { DARK_THEME } from '../../styles/theme';

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');

type CardProps = React.ComponentProps<typeof AnimatedListCard>;

const baseProps: CardProps = {
  index: 0,
  listId: 'list-1',
  listName: 'Thursday, 15 January 2026',
  isCompleted: false,
  isLocked: false,
  formattedDate: 'Thu 15 Jan',
  accessibilityDate: 'Thursday 15 January 2026',
  syncStatus: 'synced',
  onPress: jest.fn(),
  onDelete: jest.fn(),
  listCardStyle: {},
  theme: DARK_THEME,
};

function render(overrides: Partial<CardProps> = {}): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<AnimatedListCard {...baseProps} {...overrides} />);
  });
  return renderer;
}

/** Every rendered string, nested Text flattened, as a screen reader-free view of the card. */
function textOf(renderer: ReactTestRenderer): string {
  const flatten = (children: unknown): string => {
    if (children == null || typeof children === 'boolean') return '';
    if (typeof children === 'string' || typeof children === 'number') return String(children);
    if (Array.isArray(children)) return children.map(flatten).join('');
    if (React.isValidElement(children)) return flatten((children.props as { children?: unknown }).children);
    return '';
  };
  // Outermost Text nodes only, so nested name spans aren't counted twice.
  return renderer.root
    .findAllByType(Text)
    .filter(node => {
      let parent = node.parent;
      while (parent) {
        if (parent.type === Text) return false;
        parent = parent.parent;
      }
      return true;
    })
    .map(node => flatten(node.props.children))
    .join('\n');
}

function creatorRowLabel(renderer: ReactTestRenderer): string {
  const row = renderer.root.find(
    node => typeof node.props.accessibilityLabel === 'string' && node.props.accessibilityLabel.startsWith('Created'),
  );
  return row.props.accessibilityLabel;
}

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('AnimatedListCard creator line (active list)', () => {
  it('shows the creation date exactly once', () => {
    const text = textOf(render({ createdByName: 'Anna', createdByInitial: 'A' }));

    expect(occurrences(text, 'Thu 15 Jan')).toBe(1);
  });

  it('names the creator with their initial badge', () => {
    const renderer = render({ createdByName: 'Anna', createdByInitial: 'A' });
    const text = textOf(renderer);

    expect(text).toContain('Created by Anna on Thu 15 Jan');
    expect(text.split('\n')).toContain('A');
    expect(creatorRowLabel(renderer)).toBe('Created by Anna on Thursday 15 January 2026');
  });

  it('says "you" for the current user\'s own lists', () => {
    const renderer = render({ createdByName: 'you', createdByInitial: 'G' });

    expect(textOf(renderer)).toContain('Created by you on Thu 15 Jan');
    expect(creatorRowLabel(renderer)).toBe('Created by you on Thursday 15 January 2026');
  });

  it('shows only the date when the creator is unknown, with no badge', () => {
    const renderer = render({ createdByName: null, createdByInitial: null });
    const text = textOf(renderer);

    expect(text).toContain('Created on Thu 15 Jan');
    expect(text).not.toContain('by');
    expect(creatorRowLabel(renderer)).toBe('Created on Thursday 15 January 2026');
  });

  it('falls back to the visible date for the label when no spoken date is given', () => {
    const renderer = render({ accessibilityDate: undefined, createdByName: 'Anna', createdByInitial: 'A' });

    expect(creatorRowLabel(renderer)).toBe('Created by Anna on Thu 15 Jan');
  });
});

describe('AnimatedListCard (completed list) is unchanged', () => {
  it('shows the completion date and store, with no creator line', () => {
    const renderer = render({
      isCompleted: true,
      formattedDate: '20/01/2026',
      storeName: 'Tesco',
      createdByName: 'Anna',
      createdByInitial: 'A',
    });
    const text = textOf(renderer);

    expect(text).toContain('20/01/2026');
    expect(text).toContain('Tesco');
    expect(text).not.toContain('Created');
    expect(text).not.toContain('Anna');
  });
});
