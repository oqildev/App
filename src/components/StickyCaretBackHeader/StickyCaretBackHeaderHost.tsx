import CaretBackHeader from '@components/CaretBackHeader';

import useStyleUtils from '@hooks/useStyleUtils';
import useTheme from '@hooks/useTheme';
import useThemeStyles from '@hooks/useThemeStyles';

import type {ReactNode} from 'react';

import React, {useRef, useState} from 'react';
import {View} from 'react-native';
import Reanimated, {useAnimatedStyle} from 'react-native-reanimated';

import type {StickyCaretBackHeaderConfig} from './StickyCaretBackHeaderContext';

import StickyCaretBackHeaderContext from './StickyCaretBackHeaderContext';

type StickyCaretBackHeaderHostProps = {
    /** The stack navigator whose screens render a StickyCaretBackHeader */
    children: ReactNode;
};

type StickyCaretBackHeaderBarProps = {
    /** Config registered by the focused screen */
    config: StickyCaretBackHeaderConfig;

    /** Offset of the focused screen's placeholder inside the host */
    placeholderTop: number;
};

/**
 * The header bar drawn above the cards. It covers everything from the top of the host down to the bottom of the
 * placeholder with the card background, so the edges of sliding cards pass underneath it instead of through it.
 */
function StickyCaretBackHeaderBar({config, placeholderTop}: StickyCaretBackHeaderBarProps) {
    const styles = useThemeStyles();
    const StyleUtils = useStyleUtils();
    const theme = useTheme();
    const {collapseOffset} = config;

    // When the placeholder sits in a header that collapses over the keyboard, the bar moves up with it
    const collapseStyle = useAnimatedStyle(() => ({transform: [{translateY: collapseOffset?.get() ?? 0}]}), [collapseOffset]);

    return (
        <Reanimated.View
            pointerEvents="box-none"
            style={[styles.pAbsolute, styles.t0, styles.l0, styles.r0, styles.zIndex10, StyleUtils.getBackgroundColorStyle(theme.componentBG), {paddingTop: placeholderTop}, collapseStyle]}
        >
            <CaretBackHeader
                shouldShowBackButton={config.shouldShowBackButton}
                onBackButtonPress={config.onBackButtonPress}
            />
        </Reanimated.View>
    );
}

/**
 * Wrap a stack navigator with this to keep the back caret header still while its screens slide.
 *
 * Every screen keeps an empty placeholder of the header's size in its own layout, so nothing inside the
 * screens moves. The header itself is drawn once here, on top of the navigator and outside the animated cards,
 * at the offset where the focused screen's placeholder sits.
 */
function StickyCaretBackHeaderHost({children}: StickyCaretBackHeaderHostProps) {
    const styles = useThemeStyles();
    const hostRef = useRef<View>(null);
    const [config, setConfig] = useState<StickyCaretBackHeaderConfig>();
    const [top, setTop] = useState<number>();

    const measurePlaceholder = (placeholder: View | null) => {
        if (!placeholder || !hostRef.current) {
            return;
        }
        placeholder.measureLayout(hostRef.current, (_left, placeholderTop, _width, height) => {
            // A screen that has not been laid out yet reports an empty box. Keep the last offset instead of jumping to it.
            if (!height) {
                return;
            }
            setTop(placeholderTop);
        });
    };

    return (
        <StickyCaretBackHeaderContext.Provider value={{setConfig, measurePlaceholder}}>
            <View
                ref={hostRef}
                style={styles.flex1}
                collapsable={false}
            >
                {/* Rendered before the navigator so it stays first in focus and reading order, and raised so it paints above the cards */}
                {!!config && top !== undefined && (
                    <StickyCaretBackHeaderBar
                        config={config}
                        placeholderTop={top}
                    />
                )}
                {children}
            </View>
        </StickyCaretBackHeaderContext.Provider>
    );
}

export default StickyCaretBackHeaderHost;
