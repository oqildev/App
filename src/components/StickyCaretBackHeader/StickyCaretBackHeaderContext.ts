import type {Dispatch, SetStateAction} from 'react';
import type {View} from 'react-native';
import type {SharedValue} from 'react-native-reanimated';

import {createContext} from 'react';

type StickyCaretBackHeaderConfig = {
    shouldShowBackButton: boolean;
    onBackButtonPress?: () => void;

    /** Set when the placeholder sits in a header that collapses over the keyboard, so the header bar collapses with it */
    collapseOffset?: SharedValue<number>;
};

type StickyCaretBackHeaderActions = {
    /** Sets the config of the focused screen, or clears it when that screen blurs */
    setConfig: Dispatch<SetStateAction<StickyCaretBackHeaderConfig | undefined>>;

    /** Moves the caret to where the focused screen's placeholder sits inside the host */
    measurePlaceholder: (placeholder: View | null) => void;
};

/** Undefined when there is no host above the screen, in which case the header renders in place. */
const StickyCaretBackHeaderContext = createContext<StickyCaretBackHeaderActions | undefined>(undefined);

export default StickyCaretBackHeaderContext;
export type {StickyCaretBackHeaderActions, StickyCaretBackHeaderConfig};
