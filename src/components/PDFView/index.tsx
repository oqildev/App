// eslint-disable-next-line no-restricted-imports
import type {CSSProperties} from 'react';
import React, {memo, useCallback, useEffect, useState} from 'react';
import {PDFPreviewer} from 'react-fast-pdf';
import {View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Animated, {useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';
import LoadingIndicator from '@components/LoadingIndicator';
import PressableWithoutFeedback from '@components/Pressable/PressableWithoutFeedback';
import useLocalize from '@hooks/useLocalize';
import useOnyx from '@hooks/useOnyx';
import usePrevious from '@hooks/usePrevious';
import useResponsiveLayout from '@hooks/useResponsiveLayout';
import useStyleUtils from '@hooks/useStyleUtils';
import useThemeStyles from '@hooks/useThemeStyles';
import useWindowDimensions from '@hooks/useWindowDimensions';
import variables from '@styles/variables';
import {retrieveMaxCanvasArea, retrieveMaxCanvasHeight, retrieveMaxCanvasWidth} from '@userActions/CanvasSize';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import PDFPasswordForm from './PDFPasswordForm';
import type {PDFViewProps} from './types';

const LOADING_THUMBNAIL_HEIGHT = 250;
const LOADING_THUMBNAIL_WIDTH = 250;

const MIN_PDF_SCALE = 1;
const MAX_PDF_SCALE = 5;

function PDFView({onToggleKeyboard, fileName, onPress, onScaleChanged, isFocused, sourceURL, style, isUsedAsChatAttachment, onLoadError, rotation}: PDFViewProps) {
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
    const styles = useThemeStyles();
    const StyleUtils = useStyleUtils();
    const {windowHeight} = useWindowDimensions();
    const {shouldUseNarrowLayout} = useResponsiveLayout();
    const prevWindowHeight = usePrevious(windowHeight);
    const {translate} = useLocalize();

    const [maxCanvasArea] = useOnyx(ONYXKEYS.MAX_CANVAS_AREA);
    const [maxCanvasHeight] = useOnyx(ONYXKEYS.MAX_CANVAS_HEIGHT);
    const [maxCanvasWidth] = useOnyx(ONYXKEYS.MAX_CANVAS_WIDTH);

    // react-fast-pdf renders pages into a virtualized list with no built-in pinch-to-zoom, and the app
    // disables the browser's native pinch globally (touch-action + user-scalable in web/index.html). So we
    // add JS-driven pinch/pan zoom here, mirroring how images zoom via MultiGestureCanvas. The gesture is
    // captured in JS rather than by the browser, which is why it works on iOS mWeb Safari.
    const scale = useSharedValue(MIN_PDF_SCALE);
    const startScale = useSharedValue(MIN_PDF_SCALE);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const startX = useSharedValue(0);
    const startY = useSharedValue(0);

    const notifyScaleChanged = useCallback(
        (newScale: number) => {
            onScaleChanged?.(newScale);
        },
        [onScaleChanged],
    );

    const pinchGesture = Gesture.Pinch()
        .onStart(() => {
            startScale.set(scale.get());
        })
        .onUpdate((event) => {
            scale.set(Math.min(Math.max(startScale.get() * event.scale, MIN_PDF_SCALE), MAX_PDF_SCALE));
        })
        .onEnd(() => {
            scheduleOnRN(notifyScaleChanged, scale.get());
            if (scale.get() > MIN_PDF_SCALE) {
                return;
            }
            // Recenter once fully zoomed out so the virtualized list scrolls normally again
            translateX.set(withTiming(0));
            translateY.set(withTiming(0));
            startX.set(0);
            startY.set(0);
        });

    // Pan only activates after the user has zoomed in, so single-finger scroll/paging keeps working at 1x
    const panGesture = Gesture.Pan()
        .averageTouches(true)
        .manualActivation(true)
        .onTouchesMove((_event, stateManager) => {
            if (scale.get() > MIN_PDF_SCALE) {
                stateManager.activate();
            } else {
                stateManager.fail();
            }
        })
        .onStart(() => {
            startX.set(translateX.get());
            startY.set(translateY.get());
        })
        .onUpdate((event) => {
            translateX.set(startX.get() + event.translationX);
            translateY.set(startY.get() + event.translationY);
        });

    const zoomGesture = Gesture.Simultaneous(pinchGesture, panGesture);

    const animatedContainerStyle = useAnimatedStyle(() => ({
        transform: [{translateX: translateX.get()}, {translateY: translateY.get()}, {scale: scale.get()}],
    }));

    // While zoomed in we mark the subtree with `data-pdf-zoomed` so web/index.html can set `touch-action: none`
    // on it. Without that, Android Chrome honors the global `touch-action: pan-x pan-y` and runs its own native
    // pan alongside the JS pan, which makes dragging a zoomed page feel heavy/janky. At 1x the marker is removed
    // so the inner virtualized list scrolls/pages natively.
    const [isZoomedIn, setIsZoomedIn] = useState(false);
    useAnimatedReaction(
        () => scale.get() > MIN_PDF_SCALE,
        (zoomedIn, previous) => {
            if (zoomedIn === previous) {
                return;
            }
            scheduleOnRN(setIsZoomedIn, zoomedIn);
        },
    );

    /**
     * On small screens notify parent that the keyboard has opened or closed.
     *
     * @param isKBOpen True if keyboard is open
     */
    const toggleKeyboardOnSmallScreens = useCallback(
        (isKBOpen: boolean) => {
            if (!shouldUseNarrowLayout) {
                return;
            }
            setIsKeyboardOpen(isKBOpen);
            onToggleKeyboard?.(isKBOpen);
        },
        [shouldUseNarrowLayout, onToggleKeyboard],
    );

    /**
     * Verify that the canvas limits have been calculated already, if not calculate them and put them in Onyx
     */
    const retrieveCanvasLimits = () => {
        if (!maxCanvasArea) {
            retrieveMaxCanvasArea();
        }

        if (!maxCanvasHeight) {
            retrieveMaxCanvasHeight();
        }

        if (!maxCanvasWidth) {
            retrieveMaxCanvasWidth();
        }
    };

    useEffect(() => {
        retrieveCanvasLimits();
        // This rule needs to be applied so that this effect is executed only when the component is mounted
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        // Use window height changes to toggle the keyboard. To maintain keyboard state
        // on all platforms we also use focus/blur events. So we need to make sure here
        // that we avoid redundant keyboard toggling.
        // Minus 100px is needed to make sure that when the internet connection is
        // disabled in android chrome and a small 'No internet connection' text box appears,
        // we do not take it as a sign to open the keyboard
        if (!isKeyboardOpen && windowHeight < prevWindowHeight - 100) {
            toggleKeyboardOnSmallScreens(true);
        } else if (isKeyboardOpen && windowHeight > prevWindowHeight) {
            toggleKeyboardOnSmallScreens(false);
        }
    }, [isKeyboardOpen, prevWindowHeight, toggleKeyboardOnSmallScreens, windowHeight]);

    const renderPDFView = () => {
        const outerContainerStyle = [styles.w100, styles.h100, styles.justifyContentCenter, styles.alignItemsCenter];

        const previewer = (
            <PDFPreviewer
                contentContainerStyle={style as CSSProperties}
                file={sourceURL}
                pageMaxWidth={variables.pdfPageMaxWidth}
                isSmallScreen={shouldUseNarrowLayout}
                maxCanvasWidth={maxCanvasWidth}
                maxCanvasHeight={maxCanvasHeight}
                maxCanvasArea={maxCanvasArea}
                LoadingComponent={
                    <LoadingIndicator
                        style={
                            isUsedAsChatAttachment && [
                                styles.chatItemPDFAttachmentLoading,
                                StyleUtils.getWidthAndHeightStyle(LOADING_THUMBNAIL_WIDTH, LOADING_THUMBNAIL_HEIGHT),
                                styles.pRelative,
                            ]
                        }
                    />
                }
                shouldShowErrorComponent={false}
                onLoadError={onLoadError}
                rotation={rotation}
                renderPasswordForm={({isPasswordInvalid, onSubmit, onPasswordChange}) => (
                    <PDFPasswordForm
                        isFocused={!!isFocused}
                        isPasswordInvalid={isPasswordInvalid}
                        onSubmit={onSubmit}
                        onPasswordUpdated={onPasswordChange}
                    />
                )}
            />
        );

        // Inline chat thumbnails are not zoomable; only the full-screen viewer gets pinch-to-zoom.
        if (isUsedAsChatAttachment) {
            return (
                <View
                    style={outerContainerStyle}
                    tabIndex={0}
                >
                    {previewer}
                </View>
            );
        }

        return (
            <GestureDetector gesture={zoomGesture}>
                <Animated.View
                    style={[outerContainerStyle, animatedContainerStyle]}
                    dataSet={isZoomedIn ? {pdfZoomed: true} : undefined}
                    tabIndex={0}
                >
                    {previewer}
                </Animated.View>
            </GestureDetector>
        );
    };

    return onPress ? (
        <PressableWithoutFeedback
            onPress={() => onPress()}
            style={[styles.flex1, styles.flexRow, styles.alignSelfStretch]}
            accessibilityRole={CONST.ROLE.BUTTON}
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            accessibilityLabel={fileName || translate('attachmentView.unknownFilename')}
            sentryLabel={CONST.SENTRY_LABEL.PDF_VIEW.DOCUMENT}
        >
            {renderPDFView()}
        </PressableWithoutFeedback>
    ) : (
        renderPDFView()
    );
}

export default memo(PDFView);
