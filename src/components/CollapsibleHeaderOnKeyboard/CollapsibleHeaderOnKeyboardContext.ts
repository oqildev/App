import type {SharedValue} from 'react-native-reanimated';

import {createContext} from 'react';

/**
 * How far the collapsing header content is currently shifted up (0 when expanded, negative while collapsed).
 * Undefined outside a CollapsibleHeaderOnKeyboard, and on web where the header never collapses.
 */
const CollapsibleHeaderOnKeyboardContext = createContext<SharedValue<number> | undefined>(undefined);

export default CollapsibleHeaderOnKeyboardContext;
