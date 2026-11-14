import React, { forwardRef, memo, useImperativeHandle, useState } from 'react';
import { TextInput, StyleProp, TextStyle } from 'react-native';

export interface AddItemInputHandle {
  /** Empty the field (after the item was added). */
  clear(): void;
  /** Send the current text, as the keyboard's submit does (the Add button). */
  submit(): void;
}

interface AddItemInputProps {
  style: StyleProp<TextStyle>;
  placeholder: string;
  editable: boolean;
  /** Called with the trimmed text on submit; blank text is never sent. */
  onSubmit(name: string): void;
}

/**
 * The "Add item…" field of an open list. It keeps its own text, so typing
 * re-renders this field only, not the whole list screen and every card on it
 * (OPTIMISE P6, Fable audit task 137). The screen empties it through the ref
 * once the item is in.
 */
const AddItemInput = forwardRef<AddItemInputHandle, AddItemInputProps>(
  ({ style, placeholder, editable, onSubmit }, ref) => {
    const [text, setText] = useState('');
    const submit = () => {
      const name = text.trim();
      if (name) onSubmit(name);
    };
    useImperativeHandle(ref, () => ({ clear: () => setText(''), submit }));

    return (
      <TextInput
        style={style}
        placeholder={placeholder}
        placeholderTextColor="#6E6E73"
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        editable={editable}
        accessibilityLabel="Add item"
      />
    );
  },
);

export default memo(AddItemInput);
