import React, {memo, useCallback, useEffect} from 'react';
import {useAttachmentCarouselPagerActions, useAttachmentCarouselPagerState} from '@components/Attachments/AttachmentCarousel/Pager/AttachmentCarouselPagerContext';
import PDFView from '@components/PDFView';
import type AttachmentViewPdfProps from './types';

function AttachmentViewPdf({
    file,
    encryptedSourceUrl,
    isFocused,
    onPress,
    onScaleChanged: onScaleChangedProp,
    onToggleKeyboard,
    onLoadComplete,
    style,
    isUsedAsChatAttachment,
    onLoadError,
    rotation,
}: AttachmentViewPdfProps) {
    const state = useAttachmentCarouselPagerState();
    const actions = useAttachmentCarouselPagerActions();

    // Make sure the pager starts in a non-zoomed (scrollable) state, matching the native wrapper.
    useEffect(() => {
        if (!actions) {
            return;
        }
        actions.onScaleChanged?.(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- we only want to call this when the component mounts
    }, []);

    // While the PDF is zoomed in, disable the carousel's horizontal swipe so panning the zoomed page
    // doesn't flip to the next/previous attachment.
    const onScaleChanged = useCallback(
        (newScale: number) => {
            onScaleChangedProp?.(newScale);

            if (state?.pagerRef && actions) {
                actions.onScaleChanged?.(newScale);
            }
        },
        [state?.pagerRef, actions, onScaleChangedProp],
    );

    return (
        <PDFView
            onPress={onPress}
            isFocused={isFocused}
            sourceURL={encryptedSourceUrl}
            fileName={file?.name}
            style={style}
            onToggleKeyboard={onToggleKeyboard}
            onScaleChanged={onScaleChanged}
            onLoadComplete={onLoadComplete}
            isUsedAsChatAttachment={isUsedAsChatAttachment}
            onLoadError={onLoadError}
            rotation={rotation}
        />
    );
}

export default memo(AttachmentViewPdf);
