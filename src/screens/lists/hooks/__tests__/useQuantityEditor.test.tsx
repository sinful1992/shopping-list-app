import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { useQuantityEditor } from '../useQuantityEditor';
import ItemManager from '../../../../services/ItemManager';
import { Item } from '../../../../models/types';

jest.mock('../../../../services/ItemManager', () => ({
  __esModule: true,
  default: { updateItem: jest.fn().mockResolvedValue(undefined) },
}));

const updateItemMock = ItemManager.updateItem as jest.Mock;

type HookResult = ReturnType<typeof useQuantityEditor>;

function renderQuantityEditor(): { result: { current: HookResult }; unmount: () => void } {
  const result = { current: null as unknown as HookResult };
  const Harness = () => {
    result.current = useQuantityEditor();
    return null;
  };
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(<Harness />);
  });
  return { result, unmount: () => act(() => renderer.unmount()) };
}

const makeItem = (id: string, unitQty: number | null): Item => ({
  id,
  listId: 'l1',
  name: id,
  quantity: null,
  price: null,
  checked: false,
  createdBy: 'u1',
  createdAt: 1,
  updatedAt: 1,
  syncStatus: 'synced',
  unitQty,
});

describe('useQuantityEditor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    updateItemMock.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('debounces rapid taps into a single write with the final value', () => {
    const { result } = renderQuantityEditor();

    result.current.setQuantity('a', 2);
    result.current.setQuantity('a', 3);
    result.current.setQuantity('a', 4);

    expect(updateItemMock).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(300); });

    expect(updateItemMock).toHaveBeenCalledTimes(1);
    expect(updateItemMock).toHaveBeenCalledWith('a', { unitQty: 4 });
  });

  it('keeps independent debounce timers per item', () => {
    const { result } = renderQuantityEditor();

    result.current.setQuantity('a', 2);
    result.current.setQuantity('b', 5);
    act(() => { jest.advanceTimersByTime(300); });

    expect(updateItemMock).toHaveBeenCalledTimes(2);
    expect(updateItemMock).toHaveBeenCalledWith('a', { unitQty: 2 });
    expect(updateItemMock).toHaveBeenCalledWith('b', { unitQty: 5 });
  });

  it('mergeOptimisticQty overrides observer emissions until the DB echoes back', () => {
    const { result } = renderQuantityEditor();

    result.current.setQuantity('a', 3);

    // Observer emits stale value → optimistic wins
    const stale = result.current.mergeOptimisticQty([makeItem('a', 1)]);
    expect(stale[0].unitQty).toBe(3);

    // Observer emits the echoed value → entry released, item passed through
    const echoed = result.current.mergeOptimisticQty([makeItem('a', 3)]);
    expect(echoed[0].unitQty).toBe(3);

    // After release, later emissions are no longer overridden
    const later = result.current.mergeOptimisticQty([makeItem('a', 7)]);
    expect(later[0].unitQty).toBe(7);
  });

  it('flush writes pending values immediately and cancels timers', () => {
    const { result } = renderQuantityEditor();

    result.current.setQuantity('a', 6);
    result.current.flush();

    expect(updateItemMock).toHaveBeenCalledWith('a', { unitQty: 6 });
    updateItemMock.mockClear();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(updateItemMock).not.toHaveBeenCalled(); // timer was cancelled — no double write
  });

  it('supports null target quantity (reset to default 1)', () => {
    const { result } = renderQuantityEditor();

    result.current.setQuantity('a', null);
    act(() => { jest.advanceTimersByTime(300); });
    expect(updateItemMock).toHaveBeenCalledWith('a', { unitQty: null });

    const merged = result.current.mergeOptimisticQty([makeItem('a', 4)]);
    expect(merged[0].unitQty).toBeNull();
  });
});
