import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react-native';

import ComposeProviders from '@components/ComposeProviders';
import {LocaleContextProvider} from '@components/LocaleContextProvider';
import OnyxListItemProvider from '@components/OnyxListItemProvider';
import {KeyboardStateProvider} from '@components/withKeyboardState';

import useResponsiveLayout from '@hooks/useResponsiveLayout';

import ComposerInputArea from '@pages/inbox/report/ReportActionCompose/ComposerInputArea';
import ComposerProvider from '@pages/inbox/report/ReportActionCompose/ComposerProvider';
import type {ReportActionComposeProps} from '@pages/inbox/report/ReportActionCompose/ReportActionCompose';
import ReportActionCompose from '@pages/inbox/report/ReportActionCompose/ReportActionCompose';
import useComposerSubmit from '@pages/inbox/report/ReportActionCompose/useComposerSubmit';
import {ReportActionEditMessageContextProvider} from '@pages/inbox/report/ReportActionEditMessageContext';
import type {ReportActionItemMessageEditProps} from '@pages/inbox/report/ReportActionItemMessageEdit';
import ReportActionItemMessageEdit from '@pages/inbox/report/ReportActionItemMessageEdit';
import {draftMessageVideoAttributeCache} from '@pages/inbox/report/useDraftMessageVideoAttributeCache';

import {saveReportActionDraft} from '@userActions/Report';

import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';

import type * as NativeNavigation from '@react-navigation/native';
import type {PropsWithChildren} from 'react';

import React from 'react';
import {Pressable, Text} from 'react-native';
import Onyx from 'react-native-onyx';

import * as LHNTestUtils from '../utils/LHNTestUtils';
import * as TestHelper from '../utils/TestHelper';
import waitForBatchedUpdatesWithAct from '../utils/waitForBatchedUpdatesWithAct';

/**
 * Exercises where message edit appears on narrow (main @ReportActionCompose) vs wide (@ReportActionItemMessageEdit),
 * draft set/unset, and layout switching. TestIDs: CONST.COMPOSER.TEST_ID.*
 */

jest.mock('@hooks/useResponsiveLayout', () => ({
    __esModule: true,
    default: jest.fn(),
}));

const narrowLayout: ReturnType<typeof useResponsiveLayout> = {
    shouldUseNarrowLayout: true,
    isSmallScreenWidth: true,
    isInNarrowPaneModal: false,
    isExtraSmallScreenHeight: false,
    isExtraSmallScreenWidth: false,
    isMediumScreenWidth: false,
    onboardingIsMediumOrLargerScreenWidth: false,
    isLargeScreenWidth: false,
    isSmallScreen: true,
} as ReturnType<typeof useResponsiveLayout>;

const wideLayout: ReturnType<typeof useResponsiveLayout> = {
    shouldUseNarrowLayout: false,
    isSmallScreenWidth: false,
    isInNarrowPaneModal: false,
    isExtraSmallScreenHeight: false,
    isExtraSmallScreenWidth: false,
    isMediumScreenWidth: false,
    onboardingIsMediumOrLargerScreenWidth: true,
    isLargeScreenWidth: true,
    isSmallScreen: false,
} as ReturnType<typeof useResponsiveLayout>;

jest.mock('@libs/getPlatform', () => ({
    __esModule: true,
    default: () => 'web',
}));

jest.mock('@libs/ComponentUtils', () => ({
    forceClearInput: jest.fn(),
}));

jest.mock('@hooks/useLocalize', () =>
    jest.fn(() => ({
        translate: jest.fn((key: string) => key),
        numberFormat: jest.fn((num: number) => num.toString()),
    })),
);

jest.mock('@hooks/usePaginatedReportActions', () => jest.fn(() => ({reportActions: [], hasNewerActions: false, hasOlderActions: false})));
jest.mock('@hooks/useParentReportAction', () => jest.fn(() => null));
jest.mock('@hooks/useReportTransactionsCollection', () => jest.fn(() => ({})));
jest.mock('@hooks/useShortMentionsList', () => jest.fn(() => ({availableLoginsList: []})));
jest.mock('@hooks/useSidePanelState', () => jest.fn(() => ({sessionStartTime: null})));
jest.mock('@hooks/useCardFeedsForDisplay', () => jest.fn(() => ({defaultCardFeed: null, cardFeedsByPolicy: {}})));

jest.mock('@libs/actions/Report', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const actual = jest.requireActual('@libs/actions/Report');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return {
        ...actual,
        editReportComment: jest.fn(),
    };
});

jest.mock('@pages/inbox/report/ContextMenu/ReportActionContextMenu', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const actual = jest.requireActual('@pages/inbox/report/ContextMenu/ReportActionContextMenu');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return {
        ...actual,
        showDeleteModal: jest.fn(),
    };
});

jest.mock('@components/DropZone/DualDropZone', () => {
    const RN = jest.requireActual<Record<string, React.ComponentType<{testID?: string; children?: React.ReactNode}>>>('react-native');
    return ({shouldAcceptSingleReceipt}: {shouldAcceptSingleReceipt?: boolean}) => (
        <RN.Text testID="dual-drop-zone">{shouldAcceptSingleReceipt ? 'receipt-editable' : 'receipt-not-editable'}</RN.Text>
    );
});

const mockRouteReportID = {current: '1'};

jest.mock('@react-navigation/native', () => ({
    ...((): typeof NativeNavigation => {
        return jest.requireActual('@react-navigation/native');
    })(),
    useNavigation: jest.fn(() => ({
        navigate: jest.fn(),
        addListener: jest.fn(() => jest.fn()),
    })),
    useIsFocused: jest.fn(() => true),
    useRoute: jest.fn(() => ({key: '', name: '', params: {reportID: mockRouteReportID.current}})),
}));

TestHelper.setupGlobalFetchMock();

const mockUseResponsiveLayout = jest.mocked(useResponsiveLayout);

const defaultReport = LHNTestUtils.getFakeReport();
mockRouteReportID.current = defaultReport.reportID;

const defaultProps: ReportActionComposeProps = {
    reportID: defaultReport.reportID,
};

const commentAction: ReportActionItemMessageEditProps['action'] = {
    ...LHNTestUtils.getFakeReportAction(),
    actionName: CONST.REPORT.ACTIONS.TYPE.ADD_COMMENT,
};

/** A second editable comment in the same report, used to prove a finished edit cannot write over a newly started one. */
const otherCommentAction: ReportActionItemMessageEditProps['action'] = {
    ...LHNTestUtils.getFakeReportAction(),
    reportActionID: '9998887776',
    actionName: CONST.REPORT.ACTIONS.TYPE.ADD_COMMENT,
};

const testIds = CONST.COMPOSER.TEST_ID;

const rootChatReport = LHNTestUtils.getFakeReport();
const threadReport = LHNTestUtils.getFakeReport();
const nestedThreadReport = LHNTestUtils.getFakeReport();

const rootChatMessageAction: ReportActionItemMessageEditProps['action'] = {
    ...LHNTestUtils.getFakeReportAction(),
    actionName: CONST.REPORT.ACTIONS.TYPE.ADD_COMMENT,
    childReportID: threadReport.reportID,
};

const threadMessageAction: ReportActionItemMessageEditProps['action'] = {
    ...LHNTestUtils.getFakeReportAction(),
    actionName: CONST.REPORT.ACTIONS.TYPE.ADD_COMMENT,
    childReportID: nestedThreadReport.reportID,
};

function ReportActionEditMessageContextProviderForReport({children}: PropsWithChildren) {
    return <ReportActionEditMessageContextProvider reportID={defaultReport.reportID}>{children}</ReportActionEditMessageContextProvider>;
}

function ReportActionEditMessageContextProviderForNestedThread({children}: PropsWithChildren) {
    return <ReportActionEditMessageContextProvider reportID={nestedThreadReport.reportID}>{children}</ReportActionEditMessageContextProvider>;
}

function ReportActionEditMessageContextProviderForThread({children}: PropsWithChildren) {
    return <ReportActionEditMessageContextProvider reportID={threadReport.reportID}>{children}</ReportActionEditMessageContextProvider>;
}

function ReportScreenProviders({children}: PropsWithChildren) {
    return <ComposeProviders components={[OnyxListItemProvider, LocaleContextProvider, KeyboardStateProvider, ReportActionEditMessageContextProviderForReport]}>{children}</ComposeProviders>;
}

/**
 * Simulates the product split: on wide, inline @ReportActionItemMessageEdit is mounted (isEditingInline in ReportActionItem);
 * on narrow it is not and edit happens in the main composer.
 */
type LayoutMode = 'narrow' | 'wide';
function MessageEditLayoutHost({layout}: {layout: LayoutMode}) {
    const isWide = layout === 'wide';
    return (
        <ReportScreenProviders>
            <ReportActionCompose {...defaultProps} />
            {isWide && (
                <ReportActionItemMessageEdit
                    action={commentAction}
                    reportID={defaultReport.reportID}
                    originalReportID={defaultReport.reportID}
                />
            )}
        </ReportScreenProviders>
    );
}

async function seedReportAndActions() {
    await act(async () => {
        await Onyx.merge(`${ONYXKEYS.COLLECTION.REPORT}${defaultReport.reportID}`, defaultReport);
        await Onyx.merge(`${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${defaultReport.reportID}`, {
            [commentAction.reportActionID]: commentAction,
            [otherCommentAction.reportActionID]: otherCommentAction,
        });
    });
}

async function setReportActionDraftWithMessage(message: string) {
    await act(async () => {
        await Onyx.mergeCollection(ONYXKEYS.COLLECTION.REPORT_ACTIONS_DRAFTS, {
            [`${ONYXKEYS.COLLECTION.REPORT_ACTIONS_DRAFTS}${defaultReport.reportID}`]: {
                [commentAction.reportActionID]: {message},
            },
        });
    });
}

async function clearReportActionDraftsForReport() {
    await act(async () => {
        await Onyx.set(`${ONYXKEYS.COLLECTION.REPORT_ACTIONS_DRAFTS}${defaultReport.reportID}`, {});
    });
}

function renderNarrowMessageCompose() {
    mockUseResponsiveLayout.mockReturnValue(narrowLayout);
    return render(
        <ReportScreenProviders>
            <ReportActionCompose {...defaultProps} />
        </ReportScreenProviders>,
    );
}

async function seedNestedThreadHierarchyWithAncestorEditDraft(draftMessage: string) {
    await act(async () => {
        await Onyx.merge(`${ONYXKEYS.COLLECTION.REPORT}${rootChatReport.reportID}`, rootChatReport);
        await Onyx.merge(`${ONYXKEYS.COLLECTION.REPORT}${threadReport.reportID}`, {
            ...threadReport,
            parentReportID: rootChatReport.reportID,
            parentReportActionID: rootChatMessageAction.reportActionID,
        });
        await Onyx.merge(`${ONYXKEYS.COLLECTION.REPORT}${nestedThreadReport.reportID}`, {
            ...nestedThreadReport,
            parentReportID: threadReport.reportID,
            parentReportActionID: threadMessageAction.reportActionID,
        });

        await Onyx.merge(`${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${rootChatReport.reportID}`, {
            [rootChatMessageAction.reportActionID]: rootChatMessageAction,
        });
        await Onyx.merge(`${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${threadReport.reportID}`, {
            [threadMessageAction.reportActionID]: threadMessageAction,
        });

        await Onyx.merge(`${ONYXKEYS.COLLECTION.REPORT_ACTIONS_DRAFTS}${rootChatReport.reportID}`, {
            [rootChatMessageAction.reportActionID]: {message: draftMessage},
        });
    });
}

async function getReportActionDraftMessage(reportID: string, reportActionID: string) {
    let draftMessage: string | undefined;
    await TestHelper.getOnyxData({
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS_DRAFTS}${reportID}`,
        callback: (drafts) => {
            draftMessage = drafts?.[reportActionID]?.message;
        },
    });
    return draftMessage;
}

/**
 * Stands in for the real send button. The button itself is driven by a react-native-gesture-handler Tap
 * gesture, which RNTL cannot fire, so this calls the exact same entry point the button does.
 */
function SaveProbe({reportID}: {reportID: string}) {
    const {submitDraftAndClearComposer} = useComposerSubmit(reportID);
    return (
        <Pressable
            testID="messageEditSave_mainComposer"
            onPress={submitDraftAndClearComposer}
        >
            <Text>save</Text>
        </Pressable>
    );
}

function renderNarrowMessageComposeWithSaveButton() {
    mockUseResponsiveLayout.mockReturnValue(narrowLayout);
    return render(
        <ReportScreenProviders>
            <ComposerProvider reportID={defaultReport.reportID}>
                <ComposerInputArea />
                <SaveProbe reportID={defaultReport.reportID} />
            </ComposerProvider>
        </ReportScreenProviders>,
    );
}

function getNarrowComposerInput() {
    return within(screen.getByTestId(testIds.REPORT_ACTION_COMPOSE)).getByTestId(CONST.COMPOSER.NATIVE_ID);
}

async function getReportDraftComment(reportID: string) {
    let value: string | undefined;
    await TestHelper.getOnyxData({
        key: `${ONYXKEYS.COLLECTION.REPORT_DRAFT_COMMENT}${reportID}`,
        callback: (comment) => {
            value = comment;
        },
    });
    return value;
}

/**
 * Advances the clock by an exact amount and drains Onyx's `process.nextTick` notifications.
 * `waitForBatchedUpdatesWithAct` cannot be used for these cases because it calls `runOnlyPendingTimers`,
 * which would fire the very debounce whose timing is under test.
 */
async function settle(advanceMs = 0) {
    await act(async () => {
        if (advanceMs > 0) {
            jest.advanceTimersByTime(advanceMs);
        }
        for (let i = 0; i < 12; i++) {
            // eslint-disable-next-line no-await-in-loop
            await new Promise((resolve) => {
                process.nextTick(resolve);
            });
        }
    });
}

function renderNestedThreadNarrowMessageCompose() {
    mockUseResponsiveLayout.mockReturnValue(narrowLayout);
    mockRouteReportID.current = nestedThreadReport.reportID;
    return render(
        <ComposeProviders components={[OnyxListItemProvider, LocaleContextProvider, KeyboardStateProvider, ReportActionEditMessageContextProviderForNestedThread]}>
            <ReportActionCompose reportID={nestedThreadReport.reportID} />
        </ComposeProviders>,
    );
}

function renderThreadNarrowMessageCompose() {
    mockUseResponsiveLayout.mockReturnValue(narrowLayout);
    mockRouteReportID.current = threadReport.reportID;
    return render(
        <ComposeProviders components={[OnyxListItemProvider, LocaleContextProvider, KeyboardStateProvider, ReportActionEditMessageContextProviderForThread]}>
            <ReportActionCompose reportID={threadReport.reportID} />
        </ComposeProviders>,
    );
}

describe('ReportActionMessageEdit layout and draft (narrow vs wide)', () => {
    beforeAll(() => {
        Onyx.init({
            keys: ONYXKEYS,
            evictableKeys: [ONYXKEYS.COLLECTION.REPORT_ACTIONS],
        });
    });

    beforeEach(() => {
        mockUseResponsiveLayout.mockReturnValue(narrowLayout);
        mockRouteReportID.current = defaultReport.reportID;
        jest.useFakeTimers();
    });

    afterEach(async () => {
        jest.useRealTimers();
        await act(async () => {
            await Onyx.clear();
        });
        draftMessageVideoAttributeCache.clear();
    });

    it('with no report-action draft, main composer is in normal draft message mode (not message-edit action row)', async () => {
        await seedReportAndActions();
        await waitForBatchedUpdatesWithAct();

        renderNarrowMessageCompose();
        await waitForBatchedUpdatesWithAct();

        expect(screen.getByTestId(testIds.DRAFT_MESSAGE_ACTION_ROW)).toBeOnTheScreen();
        expect(screen.queryByTestId(testIds.EDITING_MESSAGE_ACTION_ROW)).toBeNull();
    });

    it('when a report-action draft is set on narrow, main composer enters message edit mode and edit-mode test IDs are used', async () => {
        await seedReportAndActions();
        await setReportActionDraftWithMessage('Narrow body');
        await waitForBatchedUpdatesWithAct();

        renderNarrowMessageCompose();
        await waitForBatchedUpdatesWithAct();

        expect(screen.getByTestId(testIds.EDITING_MESSAGE_ACTION_ROW)).toBeOnTheScreen();
        expect(screen.queryByTestId(testIds.DRAFT_MESSAGE_ACTION_ROW)).toBeNull();
        expect(screen.getByTestId(testIds.MESSAGE_EDIT_CANCEL_MAIN_COMPOSER)).toBeOnTheScreen();
        const mainCompose = screen.getByTestId(testIds.REPORT_ACTION_COMPOSE);
        expect(within(mainCompose).getByTestId(CONST.COMPOSER.NATIVE_ID).props.value).toBe('Narrow body');
    });

    it('when the draft is cleared, message edit mode ends and normal draft action row returns', async () => {
        await seedReportAndActions();
        await setReportActionDraftWithMessage('Then remove');
        await waitForBatchedUpdatesWithAct();

        const {unmount} = renderNarrowMessageCompose();
        await waitForBatchedUpdatesWithAct();
        expect(screen.getByTestId(testIds.EDITING_MESSAGE_ACTION_ROW)).toBeOnTheScreen();

        await clearReportActionDraftsForReport();
        await waitForBatchedUpdatesWithAct();

        unmount();
        renderNarrowMessageCompose();
        await waitForBatchedUpdatesWithAct();

        expect(screen.getByTestId(testIds.DRAFT_MESSAGE_ACTION_ROW)).toBeOnTheScreen();
        expect(screen.queryByTestId(testIds.EDITING_MESSAGE_ACTION_ROW)).toBeNull();
    });

    it('on wide, main composer stays in normal action row while the inline @ReportActionItemMessageEdit is used', async () => {
        await seedReportAndActions();
        await setReportActionDraftWithMessage('Wide inline');
        await waitForBatchedUpdatesWithAct();

        mockUseResponsiveLayout.mockReturnValue(wideLayout);
        render(<MessageEditLayoutHost layout="wide" />);
        await waitForBatchedUpdatesWithAct();

        const mainRoot = screen.getByTestId(testIds.REPORT_ACTION_COMPOSE);
        expect(within(mainRoot).getByTestId(testIds.DRAFT_MESSAGE_ACTION_ROW)).toBeOnTheScreen();
        expect(within(mainRoot).queryByTestId(testIds.EDITING_MESSAGE_ACTION_ROW)).toBeNull();

        expect(screen.getByTestId(testIds.REPORT_ACTION_ITEM_MESSAGE_EDIT)).toBeOnTheScreen();
        expect(screen.getByTestId(testIds.MESSAGE_EDIT_CANCEL_INLINE)).toBeOnTheScreen();
        expect(screen.queryByTestId(testIds.MESSAGE_EDIT_CANCEL_MAIN_COMPOSER)).toBeNull();
    });

    it('switches the editing surface from inline (wide) to main composer (narrow) when layout becomes narrow', async () => {
        await seedReportAndActions();
        await setReportActionDraftWithMessage('Shared draft');
        await waitForBatchedUpdatesWithAct();

        mockUseResponsiveLayout.mockReturnValue(wideLayout);
        const {unmount} = render(
            <MessageEditLayoutHost
                key="msg-edit-layout-1"
                layout="wide"
            />,
        );
        await waitForBatchedUpdatesWithAct();

        expect(screen.getByTestId(testIds.REPORT_ACTION_ITEM_MESSAGE_EDIT)).toBeOnTheScreen();
        expect(screen.getByTestId(testIds.MESSAGE_EDIT_CANCEL_INLINE)).toBeOnTheScreen();
        const mainWide = screen.getByTestId(testIds.REPORT_ACTION_COMPOSE);
        expect(within(mainWide).getByTestId(testIds.DRAFT_MESSAGE_ACTION_ROW)).toBeOnTheScreen();

        unmount();
        mockUseResponsiveLayout.mockReturnValue(narrowLayout);
        render(
            <MessageEditLayoutHost
                key="msg-edit-layout-2"
                layout="narrow"
            />,
        );
        await waitForBatchedUpdatesWithAct();

        expect(screen.queryByTestId(testIds.REPORT_ACTION_ITEM_MESSAGE_EDIT)).toBeNull();
        expect(screen.queryByTestId(testIds.MESSAGE_EDIT_CANCEL_INLINE)).toBeNull();
        expect(screen.getByTestId(testIds.EDITING_MESSAGE_ACTION_ROW)).toBeOnTheScreen();
        expect(screen.getByTestId(testIds.MESSAGE_EDIT_CANCEL_MAIN_COMPOSER)).toBeOnTheScreen();
    });

    it('switches the editing surface from main composer (narrow) to inline (wide) when layout becomes wide', async () => {
        await seedReportAndActions();
        await setReportActionDraftWithMessage('Back to wide');
        await waitForBatchedUpdatesWithAct();

        mockUseResponsiveLayout.mockReturnValue(narrowLayout);
        const {unmount} = render(
            <MessageEditLayoutHost
                key="msg-edit-layout-3"
                layout="narrow"
            />,
        );
        await waitForBatchedUpdatesWithAct();

        expect(screen.getByTestId(testIds.EDITING_MESSAGE_ACTION_ROW)).toBeOnTheScreen();
        expect(screen.getByTestId(testIds.MESSAGE_EDIT_CANCEL_MAIN_COMPOSER)).toBeOnTheScreen();
        expect(screen.queryByTestId(testIds.REPORT_ACTION_ITEM_MESSAGE_EDIT)).toBeNull();

        unmount();
        mockUseResponsiveLayout.mockReturnValue(wideLayout);
        render(
            <MessageEditLayoutHost
                key="msg-edit-layout-4"
                layout="wide"
            />,
        );
        await waitForBatchedUpdatesWithAct();

        const main = screen.getByTestId(testIds.REPORT_ACTION_COMPOSE);
        expect(within(main).getByTestId(testIds.DRAFT_MESSAGE_ACTION_ROW)).toBeOnTheScreen();
        expect(within(main).queryByTestId(testIds.EDITING_MESSAGE_ACTION_ROW)).toBeNull();
        expect(screen.getByTestId(testIds.REPORT_ACTION_ITEM_MESSAGE_EDIT)).toBeOnTheScreen();
        expect(screen.getByTestId(testIds.MESSAGE_EDIT_CANCEL_INLINE)).toBeOnTheScreen();
    });

    it('in narrow message-edit-in-composer mode, updateComment keeps the main composer value in sync (editingState + shouldUseNarrowLayout branch in ComposerWithSuggestions)', async () => {
        await seedReportAndActions();
        await setReportActionDraftWithMessage('Start');
        await waitForBatchedUpdatesWithAct();

        mockUseResponsiveLayout.mockReturnValue(narrowLayout);
        renderNarrowMessageCompose();
        await waitForBatchedUpdatesWithAct();

        const mainRoot = screen.getByTestId(testIds.REPORT_ACTION_COMPOSE);
        const composer = within(mainRoot).getByTestId(CONST.COMPOSER.NATIVE_ID);
        expect(screen.getByTestId(testIds.EDITING_MESSAGE_ACTION_ROW)).toBeOnTheScreen();

        fireEvent.changeText(composer, 'Start, edited');
        await waitFor(() => {
            expect(within(mainRoot).getByTestId(CONST.COMPOSER.NATIVE_ID).props.value).toBe('Start, edited');
        });
    });

    it('keeps a nested-thread ancestor edit draft on the report that owns the action when typing in the narrow main composer', async () => {
        await seedNestedThreadHierarchyWithAncestorEditDraft('Parent body');
        await waitForBatchedUpdatesWithAct();

        renderNestedThreadNarrowMessageCompose();
        await waitForBatchedUpdatesWithAct();

        const mainRoot = screen.getByTestId(testIds.REPORT_ACTION_COMPOSE);
        const composer = within(mainRoot).getByTestId(CONST.COMPOSER.NATIVE_ID);
        expect(screen.getByTestId(testIds.EDITING_MESSAGE_ACTION_ROW)).toBeOnTheScreen();
        expect(composer.props.value).toBe('Parent body');

        fireEvent.changeText(composer, 'Parent body, edited');
        await act(async () => {
            jest.advanceTimersByTime(CONST.TIMING.DRAFT_SAVE_DEBOUNCE_TIME + 1);
        });
        await waitForBatchedUpdatesWithAct();

        expect(await getReportActionDraftMessage(rootChatReport.reportID, rootChatMessageAction.reportActionID)).toBe('Parent body, edited');
        expect(await getReportActionDraftMessage(nestedThreadReport.reportID, rootChatMessageAction.reportActionID)).toBeUndefined();
    });

    it('keeps a direct-parent edit draft on the parent report when editing from inside its own thread', async () => {
        await seedNestedThreadHierarchyWithAncestorEditDraft('Parent body');
        await waitForBatchedUpdatesWithAct();

        renderThreadNarrowMessageCompose();
        await waitForBatchedUpdatesWithAct();

        const mainRoot = screen.getByTestId(testIds.REPORT_ACTION_COMPOSE);
        const composer = within(mainRoot).getByTestId(CONST.COMPOSER.NATIVE_ID);
        expect(screen.getByTestId(testIds.EDITING_MESSAGE_ACTION_ROW)).toBeOnTheScreen();
        expect(composer.props.value).toBe('Parent body');

        fireEvent.changeText(composer, 'Parent body, edited');
        await act(async () => {
            jest.advanceTimersByTime(CONST.TIMING.DRAFT_SAVE_DEBOUNCE_TIME + 1);
        });
        await waitForBatchedUpdatesWithAct();

        // The edited action's childReportID is the thread being viewed, so this is the shape that makes
        // getOriginalReportID's isThreadReportParentAction branch evaluable. The draft must still resolve
        // to the parent's own report, not to that report's parentReportID.
        expect(await getReportActionDraftMessage(rootChatReport.reportID, rootChatMessageAction.reportActionID)).toBe('Parent body, edited');
        expect(await getReportActionDraftMessage(threadReport.reportID, rootChatMessageAction.reportActionID)).toBeUndefined();
    });

    describe('a draft save left pending when the edit ends (#98580)', () => {
        it('does not resurrect the edit draft when Save happens inside the debounce window', async () => {
            await seedReportAndActions();
            await setReportActionDraftWithMessage('Original body');
            await waitForBatchedUpdatesWithAct();

            renderNarrowMessageComposeWithSaveButton();
            await waitForBatchedUpdatesWithAct();
            expect(screen.getByTestId(testIds.EDITING_MESSAGE_ACTION_ROW)).toBeOnTheScreen();

            // The last keystroke arms the debounced report-action draft save.
            fireEvent.changeText(getNarrowComposerInput(), 'Original body edited');
            await settle();

            // Save is tapped before DRAFT_SAVE_DEBOUNCE_TIME elapses, so that save is still pending.
            await settle(282);
            fireEvent.press(screen.getByTestId('messageEditSave_mainComposer'));
            // The edit submit is deferred one tick to let native autocorrection land.
            await settle(1);

            expect(await getReportActionDraftMessage(defaultReport.reportID, commentAction.reportActionID)).toBeUndefined();
            expect(screen.queryByTestId(testIds.EDITING_MESSAGE_ACTION_ROW)).toBeNull();

            // The pending save must not write the cleared draft back and re-open the editor.
            await settle(CONST.TIMING.DRAFT_SAVE_DEBOUNCE_TIME);

            expect(await getReportActionDraftMessage(defaultReport.reportID, commentAction.reportActionID)).toBeUndefined();
            expect(screen.queryByTestId(testIds.EDITING_MESSAGE_ACTION_ROW)).toBeNull();
            expect(screen.getByTestId(testIds.DRAFT_MESSAGE_ACTION_ROW)).toBeOnTheScreen();
        });

        it('does not bring discarded text back when Cancel happens inside the debounce window', async () => {
            await seedReportAndActions();
            await setReportActionDraftWithMessage('Original body');
            await waitForBatchedUpdatesWithAct();

            renderNarrowMessageComposeWithSaveButton();
            await waitForBatchedUpdatesWithAct();

            fireEvent.changeText(getNarrowComposerInput(), 'Typed then discarded');
            await settle();
            await settle(120);

            fireEvent.press(screen.getByTestId(testIds.MESSAGE_EDIT_CANCEL_MAIN_COMPOSER));
            await settle(1);
            await settle(CONST.TIMING.DRAFT_SAVE_DEBOUNCE_TIME);

            expect(await getReportActionDraftMessage(defaultReport.reportID, commentAction.reportActionID)).toBeUndefined();
            expect(screen.queryByTestId(testIds.EDITING_MESSAGE_ACTION_ROW)).toBeNull();
        });

        it('does not overwrite an edit started on another message right after saving', async () => {
            await seedReportAndActions();
            await setReportActionDraftWithMessage('Original body');
            await waitForBatchedUpdatesWithAct();

            renderNarrowMessageComposeWithSaveButton();
            await waitForBatchedUpdatesWithAct();

            fireEvent.changeText(getNarrowComposerInput(), 'Original body edited');
            await settle();
            await settle(282);
            fireEvent.press(screen.getByTestId('messageEditSave_mainComposer'));
            await settle(1);

            // The user immediately picks "Edit comment" on a different message.
            await act(async () => {
                saveReportActionDraft(defaultReport.reportID, otherCommentAction, {[otherCommentAction.reportActionID]: otherCommentAction}, 'Second message');
            });
            await settle(1);
            await settle(CONST.TIMING.DRAFT_SAVE_DEBOUNCE_TIME);

            // `saveReportActionDraft` writes with `Onyx.setCollection`, so a stale call would replace the
            // whole collection: the new edit would be lost and the finished one restored in its place.
            expect(await getReportActionDraftMessage(defaultReport.reportID, otherCommentAction.reportActionID)).toBe('Second message');
            expect(await getReportActionDraftMessage(defaultReport.reportID, commentAction.reportActionID)).toBeUndefined();
        });

        it('does not overwrite the new draft when the edit target is switched without saving', async () => {
            await seedReportAndActions();
            await setReportActionDraftWithMessage('Original body');
            await waitForBatchedUpdatesWithAct();

            renderNarrowMessageComposeWithSaveButton();
            await waitForBatchedUpdatesWithAct();

            fireEvent.changeText(getNarrowComposerInput(), 'Original body edited');
            await settle();
            await settle(282);

            // "Edit comment" on another message while the first edit is still open. The editing state never
            // returns to `off` here, so nothing that keys on the edit ending can help.
            await act(async () => {
                saveReportActionDraft(defaultReport.reportID, otherCommentAction, {[otherCommentAction.reportActionID]: otherCommentAction}, 'Second message');
            });
            await settle(1);
            await settle(CONST.TIMING.DRAFT_SAVE_DEBOUNCE_TIME);

            expect(await getReportActionDraftMessage(defaultReport.reportID, otherCommentAction.reportActionID)).toBe('Second message');
            expect(await getReportActionDraftMessage(defaultReport.reportID, commentAction.reportActionID)).toBeUndefined();
        });

        it('still persists the normal composer draft comment', async () => {
            await seedReportAndActions();
            await waitForBatchedUpdatesWithAct();

            renderNarrowMessageComposeWithSaveButton();
            await waitForBatchedUpdatesWithAct();
            expect(screen.getByTestId(testIds.DRAFT_MESSAGE_ACTION_ROW)).toBeOnTheScreen();

            fireEvent.changeText(getNarrowComposerInput(), 'An unsent message');
            await settle();
            await settle(CONST.TIMING.DRAFT_SAVE_DEBOUNCE_TIME + 1);

            expect(await getReportDraftComment(defaultReport.reportID)).toBe('An unsent message');
        });
    });

    it('cancel in narrow main composer returns to normal draft action row', async () => {
        await seedReportAndActions();
        await setReportActionDraftWithMessage('Cancel me');
        await waitForBatchedUpdatesWithAct();

        renderNarrowMessageCompose();
        await waitForBatchedUpdatesWithAct();

        fireEvent.press(screen.getByTestId(testIds.MESSAGE_EDIT_CANCEL_MAIN_COMPOSER));
        await waitForBatchedUpdatesWithAct();

        await waitFor(() => {
            expect(screen.getByTestId(testIds.DRAFT_MESSAGE_ACTION_ROW)).toBeOnTheScreen();
        });
        expect(screen.queryByTestId(testIds.EDITING_MESSAGE_ACTION_ROW)).toBeNull();
    });
});
