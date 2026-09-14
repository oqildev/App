import CaretBackHeader from '@components/CaretBackHeader';
import CollapsibleHeaderOnKeyboardContext from '@components/CollapsibleHeaderOnKeyboard/CollapsibleHeaderOnKeyboardContext';

import {useFocusEffect, useIsFocused} from '@react-navigation/native';
import React, {useCallback, useContext, useRef} from 'react';
import {View} from 'react-native';

import type {StickyCaretBackHeaderActions} from './StickyCaretBackHeaderContext';

import StickyCaretBackHeaderContext from './StickyCaretBackHeaderContext';

type StickyCaretBackHeaderProps = {
    onBackButtonPress?: () => void;
    shouldShowBackButton?: boolean;
};

type StickyCaretBackHeaderPlaceholderProps = StickyCaretBackHeaderProps & {
    actions: StickyCaretBackHeaderActions;
};

function StickyCaretBackHeaderPlaceholder({actions, onBackButtonPress, shouldShowBackButton = true}: StickyCaretBackHeaderPlaceholderProps) {
    const {setConfig, measurePlaceholder} = actions;
    const placeholderRef = useRef<View>(null);
    const isFocused = useIsFocused();
    const collapseOffset = useContext(CollapsibleHeaderOnKeyboardContext);

    useFocusEffect(
        useCallback(() => {
            const config = {shouldShowBackButton, onBackButtonPress, collapseOffset};
            setConfig(config);
            measurePlaceholder(placeholderRef.current);

            return () => setConfig((currentConfig) => (currentConfig === config ? undefined : currentConfig));
        }, [shouldShowBackButton, onBackButtonPress, collapseOffset, setConfig, measurePlaceholder]),
    );

    return (
        <View
            ref={placeholderRef}
            // Screens under the focused one can re-layout too (e.g. on rotation) and must not move the caret
            onLayout={() => isFocused && measurePlaceholder(placeholderRef.current)}
            collapsable={false}
        >
            <CaretBackHeader shouldShowBackButton={false} />
        </View>
    );
}

/**
 * Back caret header for a screen inside a stack.
 *
 * Under a StickyCaretBackHeaderHost it leaves an empty box of the same size in the screen's layout and lets the host
 * draw the caret, so the caret does not slide with the screen. Without a host it renders like a plain header.
 */
function StickyCaretBackHeader({onBackButtonPress, shouldShowBackButton}: StickyCaretBackHeaderProps) {
    const actions = useContext(StickyCaretBackHeaderContext);

    if (!actions) {
        return (
            <CaretBackHeader
                onBackButtonPress={onBackButtonPress}
                shouldShowBackButton={shouldShowBackButton}
            />
        );
    }

    return (
        <StickyCaretBackHeaderPlaceholder
            actions={actions}
            onBackButtonPress={onBackButtonPress}
            shouldShowBackButton={shouldShowBackButton}
        />
    );
}

export default StickyCaretBackHeader;
