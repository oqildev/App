import useNetwork from '@hooks/useNetwork';
import useThemeStyles from '@hooks/useThemeStyles';

import CONST from '@src/CONST';

import type {LayoutChangeEvent, StyleProp, ViewStyle} from 'react-native';

import delay from 'lodash/delay';
import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import Animated, {useAnimatedStyle, useSharedValue, withTiming} from 'react-native-reanimated';
import {scheduleOnRN} from 'react-native-worklets';

import type {ImageObjectPosition, ImageOnLoadEvent, ImageProps} from './Image/types';

import AttachmentOfflineIndicator from './AttachmentOfflineIndicator';
import Image from './Image';
import LoadingIndicator from './LoadingIndicator';

type ImageWithSizeLoadingProps = {
    /** Any additional styles to apply */
    containerStyles?: StyleProp<ViewStyle>;

    /** Whether the image requires an authToken */
    isAuthTokenRequired: boolean;

    /** The object position of image */
    objectPosition?: ImageObjectPosition;

    /** Whether to show offline indicator */
    shouldShowOfflineIndicator?: boolean;

    /** Invoked on mount and layout changes */
    onLayout?: (event: LayoutChangeEvent) => void;

    /** Low-resolution URI shown as a placeholder while the full image loads */
    previewUri?: string;
} & ImageProps;

function ImageWithLoading({
    onError,
    containerStyles,
    shouldShowOfflineIndicator = true,
    loadingIconSize,
    waitForSession,
    loadingIndicatorStyles,
    resizeMode,
    onLoad,
    onLayout,
    style,
    previewUri,
    ...rest
}: ImageWithSizeLoadingProps) {
    const styles = useThemeStyles();
    const isLoadedRef = useRef<boolean | null>(null);
    const [isImageCached, setIsImageCached] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    // The full-resolution image is not guaranteed to ever emit `onLoad`/`onError` (e.g. a receipt derivative that is
    // still being generated server-side), so `isLoading` can stay `true` indefinitely. Once the low-resolution preview
    // is on screen we have something readable to show, so the loading state must stop being visible at that point.
    const [isThumbnailLoading, setIsThumbnailLoading] = useState(!!previewUri);
    // The low-resolution preview is an overlay on top of the full-resolution image, and it is taken away by the
    // full-resolution image's own `onLoad` - never by `isLoading`. That keeps the receipt readable no matter how the
    // full-resolution load ends, including when it never emits `onLoad`/`onError` at all.
    const [shouldShowPreview, setShouldShowPreview] = useState(!!previewUri);
    // `imageLoadedSuccessfully` runs from the full-resolution image element's own load event, and that callback can be a
    // render behind the state above, so the two signals the transition depends on are mirrored into refs and the
    // decision is taken from those instead.
    const isImageCachedRef = useRef(true);
    const hasPreviewPaintedRef = useRef(false);
    const previewOpacity = useSharedValue(1);
    const previewAnimatedStyle = useAnimatedStyle(() => ({opacity: previewOpacity.get()}));
    const {isOffline} = useNetwork();

    const setImageCached = (value: boolean) => {
        isImageCachedRef.current = value;
        setIsImageCached(value);
    };

    const handleError = () => {
        onError?.();
        if (isLoadedRef.current) {
            isLoadedRef.current = false;
            setImageCached(false);
        }
        if (isOffline) {
            return;
        }
        setIsLoading(false);
    };

    const imageLoadedSuccessfully = (e: ImageOnLoadEvent) => {
        // Only dissolve the preview when it was actually on screen to be seen: a full-resolution image that came from
        // the cache (or a preview that never painted) has nothing to sharpen from, and fading there would read as a
        // flicker.
        const shouldDissolvePreview = !isImageCachedRef.current && hasPreviewPaintedRef.current;
        isLoadedRef.current = true;
        setIsLoading(false);
        setImageCached(true);
        if (shouldDissolvePreview) {
            previewOpacity.set(
                withTiming(0, {duration: CONST.IMAGE_PREVIEW_FADE_OUT_DURATION}, (finished) => {
                    if (!finished) {
                        return;
                    }
                    scheduleOnRN(setShouldShowPreview, false);
                }),
            );
        } else {
            setShouldShowPreview(false);
        }
        onLoad?.(e);
    };

    /** Delay the loader to detect whether the image is being loaded from the cache or the internet. */
    useEffect(() => {
        if (isLoadedRef.current ?? !isLoading) {
            return;
        }
        const timeout = delay(() => {
            if (!isLoading || isLoadedRef.current) {
                return;
            }
            setImageCached(false);
        }, 200);
        return () => clearTimeout(timeout);
    }, [isLoading]);

    return (
        <View
            style={[styles.w100, styles.h100, containerStyles]}
            onLayout={onLayout}
        >
            {/* eslint-disable-next-line react-native-a11y/has-valid-accessibility-ignores-invert-colors -- Custom Image wrapper does not support this prop. */}
            <Image
                {...rest}
                style={[styles.w100, styles.h100, style]}
                resizeMode={resizeMode}
                onLoadStart={() => {
                    if (isLoadedRef.current ?? isLoading) {
                        return;
                    }
                    setIsLoading(true);
                }}
                onError={handleError}
                onLoad={(e) => {
                    imageLoadedSuccessfully(e);
                }}
                waitForSession={() => {
                    // Called when the image should wait for a valid session to reload
                    // At the moment this function is called, the image is not in cache anymore
                    isLoadedRef.current = false;
                    setImageCached(false);
                    setIsLoading(true);
                    setIsThumbnailLoading(!!previewUri);
                    // The full-resolution image starts over after a re-authentication, so put the preview back on top
                    // and let the transition play again.
                    hasPreviewPaintedRef.current = false;
                    previewOpacity.set(1);
                    setShouldShowPreview(!!previewUri);
                    waitForSession?.();
                }}
                loadingIconSize={loadingIconSize}
                loadingIndicatorStyles={loadingIndicatorStyles}
            />
            {shouldShowPreview && !!previewUri && (
                <Animated.View
                    testID="image-with-loading-preview"
                    style={[StyleSheet.absoluteFill, previewAnimatedStyle]}
                    pointerEvents="none"
                >
                    {/* eslint-disable-next-line react-native-a11y/has-valid-accessibility-ignores-invert-colors -- Custom Image wrapper does not support this prop. */}
                    <Image
                        {...rest}
                        source={{uri: previewUri}}
                        style={[styles.w100, styles.h100, style]}
                        resizeMode={resizeMode}
                        onLoad={(e) => {
                            hasPreviewPaintedRef.current = true;
                            setIsThumbnailLoading(false);
                            onLoad?.(e);
                        }}
                        loadingIconSize={loadingIconSize}
                        loadingIndicatorStyles={loadingIndicatorStyles}
                    />
                </Animated.View>
            )}
            {isLoading && (!previewUri || isThumbnailLoading) && !isImageCached && !isOffline && (
                <LoadingIndicator
                    iconSize={loadingIconSize}
                    style={[styles.opacity1, styles.bgTransparent, loadingIndicatorStyles]}
                />
            )}
            {isLoading && shouldShowOfflineIndicator && !isImageCached && <AttachmentOfflineIndicator isPreview />}
        </View>
    );
}

ImageWithLoading.displayName = 'ImageWithLoading';

export default React.memo(ImageWithLoading);
export type {ImageWithSizeLoadingProps};
