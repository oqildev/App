import {act, render, screen} from '@testing-library/react-native';

import ActivityIndicator from '@components/ActivityIndicator';
import ComposeProviders from '@components/ComposeProviders';
import type {ImageOnLoadEvent} from '@components/Image/types';
import ImageWithLoading from '@components/ImageWithLoading';
import ThemeProvider from '@components/ThemeProvider';
import ThemeStylesProvider from '@components/ThemeStylesContextProvider';

import CONST from '@src/CONST';

import type ReactNative from 'react-native';

import React from 'react';
import {StyleSheet} from 'react-native';

const FULL_RES_URI = 'https://www.expensify.com/receipts/w_receipt.1024.jpg';
const PREVIEW_URI = 'https://www.expensify.com/receipts/w_receipt.320.jpg';
const PREVIEW_OVERLAY_TEST_ID = 'image-with-loading-preview';

type MockImageHandlers = {
    onLoad?: (event: ImageOnLoadEvent) => void;
    onLoadStart?: () => void;
    onError?: () => void;
    waitForSession?: () => void;
};

// The mocked <Image> records the callbacks of every layer it renders, keyed by the URI it was asked to load, so the
// tests can settle the full-resolution image and the low-resolution preview independently of one another.
const mockImageHandlers: Record<string, MockImageHandlers> = {};

// The callbacks as they were on the very first render. The real image element hands its load event to the callback it
// was mounted with, which can be a render behind the component's state, so a test can settle the image through these
// to reproduce that.
const mockFirstImageHandlers: Record<string, MockImageHandlers> = {};

// `withTiming` hands its callback back to the test instead of firing it right away, so the dissolve can be observed
// while it is still running - a hard swap and a dissolve are indistinguishable once the animation has finished.
const mockTimingCalls: Array<{toValue: number; duration?: number; callback?: (finished: boolean) => void}> = [];

jest.mock('@hooks/useNetwork', () => jest.fn(() => ({isOffline: false})));

jest.mock('@components/Image', () => {
    const MockReact = jest.requireActual<typeof React>('react');
    const {View} = jest.requireActual<typeof ReactNative>('react-native');

    function MockImage({source, onLoad, onLoadStart, onError, waitForSession}: {source?: {uri?: string}} & MockImageHandlers) {
        const uri = source?.uri ?? '';
        mockImageHandlers[uri] = {onLoad, onLoadStart, onError, waitForSession};
        mockFirstImageHandlers[uri] ??= mockImageHandlers[uri];
        return MockReact.createElement(View, {testID: uri});
    }

    return {__esModule: true, default: MockImage};
});

jest.mock('react-native-reanimated', () => {
    const reanimatedMock = jest.requireActual<Record<string, unknown>>('react-native-reanimated/mock');

    return {
        ...reanimatedMock,
        createAnimatedPropAdapter: jest.fn,
        useReducedMotion: jest.fn,
        useScrollViewOffset: jest.fn(() => 0),
        useAnimatedRef: jest.fn(() => jest.fn()),
        makeShareableCloneRecursive: jest.fn,
        withTiming: (toValue: number, config?: {duration?: number}, callback?: (finished: boolean) => void) => {
            mockTimingCalls.push({toValue, duration: config?.duration, callback});
            return toValue;
        },
    };
});

function ThemeProviderWithLight({children}: {children: React.ReactNode}) {
    return <ThemeProvider theme="light">{children}</ThemeProvider>;
}

function renderImageWithLoading({previewUri}: {previewUri?: string} = {previewUri: PREVIEW_URI}) {
    return render(
        <ComposeProviders components={[ThemeProviderWithLight, ThemeStylesProvider]}>
            <ImageWithLoading
                source={{uri: FULL_RES_URI}}
                previewUri={previewUri}
                isAuthTokenRequired
                shouldShowOfflineIndicator={false}
            />
        </ComposeProviders>,
    );
}

function getHandlers(uri: string) {
    return mockImageHandlers[uri] ?? {};
}

function startFullResLoad() {
    act(() => {
        getHandlers(FULL_RES_URI).onLoadStart?.();
    });
}

function settlePreview() {
    act(() => {
        getHandlers(PREVIEW_URI).onLoad?.({nativeEvent: {width: 320, height: 240}} as ImageOnLoadEvent);
    });
}

function settleFullRes() {
    act(() => {
        getHandlers(FULL_RES_URI).onLoad?.({nativeEvent: {width: 1024, height: 768}} as ImageOnLoadEvent);
    });
}

/** Report the dissolve as finished and let the hop back to the JS thread settle. */
async function finishTheDissolve() {
    await act(async () => {
        mockTimingCalls.at(0)?.callback?.(true);
        jest.advanceTimersByTime(0);
    });
}

/** Let the 200ms cache probe expire, which is what tells the component the full-resolution image is not cached. */
function waitOutTheCacheProbe() {
    act(() => {
        jest.advanceTimersByTime(200);
    });
}

function getOverlayStyle(): unknown {
    return StyleSheet.flatten(screen.getByTestId(PREVIEW_OVERLAY_TEST_ID).props.style ?? []);
}

describe('ImageWithLoading', () => {
    beforeAll(() => {
        // `jest/setupAfterEnv` opts the repo out of fake timers, and this component leans on a 200ms timer to tell a
        // cached image from a slow one
        jest.useFakeTimers();
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    beforeEach(() => {
        for (const uri of Object.keys(mockImageHandlers)) {
            delete mockImageHandlers[uri];
        }
        for (const uri of Object.keys(mockFirstImageHandlers)) {
            delete mockFirstImageHandlers[uri];
        }
        mockTimingCalls.length = 0;
    });

    it('shows the low-resolution preview from the first render, before the full-resolution image reports anything', () => {
        renderImageWithLoading();

        expect(screen.getByTestId(PREVIEW_URI)).toBeTruthy();
        expect(screen.getByTestId(FULL_RES_URI)).toBeTruthy();
    });

    it('draws the preview as an overlay sitting on top of the full-resolution image', () => {
        renderImageWithLoading();

        expect(getOverlayStyle()).toEqual(expect.objectContaining({position: 'absolute', opacity: 1}));
    });

    it('keeps the preview on screen when the full-resolution image fails to load', () => {
        renderImageWithLoading();
        startFullResLoad();
        settlePreview();
        waitOutTheCacheProbe();

        act(() => {
            getHandlers(FULL_RES_URI).onError?.();
        });

        expect(screen.getByTestId(PREVIEW_URI)).toBeTruthy();
        expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    });

    it('dissolves the preview away once the full-resolution image has really rendered', async () => {
        renderImageWithLoading();
        startFullResLoad();
        settlePreview();
        waitOutTheCacheProbe();

        settleFullRes();

        expect(mockTimingCalls).toHaveLength(1);
        // The preview is still on screen while it dissolves - it is not swapped out the moment the full image lands
        expect(screen.getByTestId(PREVIEW_URI)).toBeTruthy();
        expect(mockTimingCalls.at(0)?.toValue).toBe(0);
        expect(mockTimingCalls.at(0)?.duration).toBe(CONST.IMAGE_PREVIEW_FADE_OUT_DURATION);

        await finishTheDissolve();

        expect(screen.queryByTestId(PREVIEW_URI)).toBeNull();
        expect(screen.getByTestId(FULL_RES_URI)).toBeTruthy();
    });

    it('still dissolves when the image element reports its load through the callback it was mounted with', async () => {
        renderImageWithLoading();
        startFullResLoad();
        settlePreview();
        waitOutTheCacheProbe();

        // Deliberately the first render's callback, not the current one: the real element keeps the handler it mounted
        // with, so a decision read from component state there is a render stale
        act(() => {
            mockFirstImageHandlers[FULL_RES_URI]?.onLoad?.({nativeEvent: {width: 1024, height: 768}} as ImageOnLoadEvent);
        });

        expect(mockTimingCalls).toHaveLength(1);
        expect(screen.getByTestId(PREVIEW_URI)).toBeTruthy();

        await finishTheDissolve();

        expect(screen.queryByTestId(PREVIEW_URI)).toBeNull();
    });

    it('swaps a cached full-resolution image in without dissolving, so a cached receipt does not flicker', () => {
        renderImageWithLoading();
        startFullResLoad();
        settlePreview();

        settleFullRes();

        expect(mockTimingCalls).toHaveLength(0);
        expect(screen.queryByTestId(PREVIEW_URI)).toBeNull();
        expect(screen.getByTestId(FULL_RES_URI)).toBeTruthy();
    });

    it('leaves the readable preview and no loader when the full-resolution image settles neither way', () => {
        renderImageWithLoading();
        startFullResLoad();
        settlePreview();

        act(() => {
            jest.advanceTimersByTime(30000);
        });

        expect(screen.getByTestId(PREVIEW_URI)).toBeTruthy();
        expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
    });

    it('brings the preview back at full opacity when the image reloads after a session refresh', async () => {
        renderImageWithLoading();
        startFullResLoad();
        settlePreview();
        waitOutTheCacheProbe();
        settleFullRes();
        await finishTheDissolve();

        expect(screen.queryByTestId(PREVIEW_URI)).toBeNull();

        act(() => {
            getHandlers(FULL_RES_URI).waitForSession?.();
        });

        expect(screen.getByTestId(PREVIEW_URI)).toBeTruthy();
        expect(getOverlayStyle()).toEqual(expect.objectContaining({opacity: 1}));
    });

    it('renders nothing extra when there is no preview to show', () => {
        renderImageWithLoading({});
        startFullResLoad();

        expect(screen.queryByTestId(PREVIEW_OVERLAY_TEST_ID)).toBeNull();
        expect(screen.getByTestId(FULL_RES_URI)).toBeTruthy();
    });
});
