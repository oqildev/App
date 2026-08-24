import {act, fireEvent, render, screen, waitFor} from '@testing-library/react-native';

import ComposeProviders from '@components/ComposeProviders';
import {CurrentUserPersonalDetailsProvider} from '@components/CurrentUserPersonalDetailsProvider';
import {LocaleContextProvider} from '@components/LocaleContextProvider';
import OnyxListItemProvider from '@components/OnyxListItemProvider';
import {KeyboardStateProvider} from '@components/withKeyboardState';

import type {ReportActionComposeProps} from '@pages/inbox/report/ReportActionCompose/ReportActionCompose';
import ReportActionCompose from '@pages/inbox/report/ReportActionCompose/ReportActionCompose';
import useAttachmentPicker from '@pages/inbox/report/ReportActionCompose/useAttachmentPicker';
import {ReportActionEditMessageContextProvider} from '@pages/inbox/report/ReportActionEditMessageContext';

import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';

import type * as NativeNavigation from '@react-navigation/native';
import type {PropsWithChildren} from 'react';

import {getAgentZeroProcessingLabel} from '@selectors/ReportNameValuePairs';
import React from 'react';
import Onyx from 'react-native-onyx';

import getOnyxValue from '../utils/getOnyxValue';
import * as LHNTestUtils from '../utils/LHNTestUtils';
import * as TestHelper from '../utils/TestHelper';
import waitForBatchedUpdatesWithAct from '../utils/waitForBatchedUpdatesWithAct';

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

jest.mock('@pages/inbox/report/ReportActionCompose/useAttachmentPicker', () => jest.fn());
jest.mock('@pages/Share/getFileSize', () => jest.fn(() => Promise.resolve(100)));

// The composer ref rendered by the test renderer has no native `setSelection` implementation
jest.mock('@pages/inbox/report/ReportActionCompose/ReportActionComposeUtils', () => ({
    __esModule: true,
    default: {updateNativeSelectionValue: jest.fn()},
}));

jest.mock('@components/DropZone/DualDropZone', () => {
    const RN = jest.requireActual<Record<string, React.ComponentType<{testID?: string}>>>('react-native');
    return () => <RN.Text testID="dual-drop-zone" />;
});

jest.mock('@react-navigation/native', () => ({
    ...((): typeof NativeNavigation => jest.requireActual('@react-navigation/native'))(),
    useNavigation: jest.fn(() => ({navigate: jest.fn(), addListener: jest.fn(() => jest.fn())})),
    useIsFocused: jest.fn(() => true),
    useRoute: jest.fn(() => ({key: '', name: '', params: {reportID: '1'}})),
}));

TestHelper.setupGlobalFetchMock();

const conciergeReport = LHNTestUtils.getFakeReport();
const REPORT_ID = conciergeReport.reportID;
const PROCESSING_LABEL = 'Concierge is thinking…';

const defaultProps: ReportActionComposeProps = {reportID: REPORT_ID};

function ReportActionEditMessageContextProviderForReport({children}: PropsWithChildren) {
    return <ReportActionEditMessageContextProvider reportID={REPORT_ID}>{children}</ReportActionEditMessageContextProvider>;
}

function renderComposer() {
    return render(
        <ComposeProviders
            components={[OnyxListItemProvider, CurrentUserPersonalDetailsProvider, LocaleContextProvider, KeyboardStateProvider, ReportActionEditMessageContextProviderForReport]}
        >
            <ReportActionCompose {...defaultProps} />
        </ComposeProviders>,
    );
}

/** The composer submits by clearing the input, which hands the draft to validateAndSubmitDraft. */
async function submitMessage(text: string) {
    const composer = screen.getByTestId('composer');
    fireEvent.changeText(composer, text);
    await waitForBatchedUpdatesWithAct();
    fireEvent(composer, 'clear', {nativeEvent: {text}});
    await waitForBatchedUpdatesWithAct();
}

async function getConciergeLabel() {
    const nvp = await getOnyxValue(`${ONYXKEYS.COLLECTION.REPORT_NAME_VALUE_PAIRS}${REPORT_ID}` as const);
    return getAgentZeroProcessingLabel(nvp, CONST.ACCOUNT_ID.CONCIERGE);
}

describe('sending into Concierge while a pre-generated turn is reconciling (#97049)', () => {
    beforeAll(() => {
        Onyx.init({keys: ONYXKEYS, evictableKeys: [ONYXKEYS.COLLECTION.REPORT_ACTIONS]});
    });

    beforeEach(async () => {
        jest.mocked(useAttachmentPicker).mockReturnValue({pickAttachments: jest.fn(), PDFValidationComponent: undefined});
        await TestHelper.signInWithTestUser(1, 'user@domain.com');
        await act(async () => {
            await Onyx.set(`${ONYXKEYS.COLLECTION.REPORT}${REPORT_ID}`, conciergeReport);
            await Onyx.set(ONYXKEYS.CONCIERGE_REPORT_ID, REPORT_ID);
            // The server has told us Concierge is working on this report.
            await Onyx.set(`${ONYXKEYS.COLLECTION.REPORT_NAME_VALUE_PAIRS}${REPORT_ID}`, {
                agentZeroProcessingRequestIndicator: {[CONST.ACCOUNT_ID.CONCIERGE]: PROCESSING_LABEL},
            });
        });
        await waitForBatchedUpdatesWithAct();
    });

    afterEach(async () => {
        await act(async () => {
            await Onyx.clear();
        });
        jest.clearAllMocks();
    });

    it('keeps the indicator while a pre-generated reply is still waiting to be revealed', async () => {
        // Given the user clicked a follow-up whose reply has not been revealed yet
        await act(async () => {
            await Onyx.set(`${ONYXKEYS.COLLECTION.PENDING_CONCIERGE_RESPONSE}${REPORT_ID}`, {
                reportAction: {reportActionID: '200', created: '2026-06-29 10:00:00.100'},
                displayAfter: Date.now() + 4000,
            });
        });

        const {unmount} = renderComposer();
        await waitForBatchedUpdatesWithAct();

        // When they send another message before it lands
        await submitMessage('actually, what about Xero?');

        // Then the in-flight turn keeps its indicator — clearing it here is what left the chat with no
        // sign that anything was pending, and took the late-reply safety timer down with it.
        await waitFor(async () => {
            expect(await getConciergeLabel()).toBe(PROCESSING_LABEL);
        });

        unmount();
        await waitForBatchedUpdatesWithAct();
    });

    it('keeps the indicator while the revealed reply is still waiting for its follow-up buttons', async () => {
        // Given the reply has been revealed and its buttons have not arrived yet
        await act(async () => {
            await Onyx.set(`${ONYXKEYS.COLLECTION.CONCIERGE_PENDING_FOLLOWUP_LIST}${REPORT_ID}`, {reportActionID: '200', createdAt: Date.now()});
        });

        const {unmount} = renderComposer();
        await waitForBatchedUpdatesWithAct();

        await submitMessage('actually, what about Xero?');

        await waitFor(async () => {
            expect(await getConciergeLabel()).toBe(PROCESSING_LABEL);
        });

        unmount();
        await waitForBatchedUpdatesWithAct();
    });

    it('still clears a stale indicator when no Concierge turn is reconciling', async () => {
        // Given no pre-generated turn is in flight — the case the optimistic clear was written for
        // (e.g. a persisted "…is working on your chat" left over while a human handles the chat)
        const {unmount} = renderComposer();
        await waitForBatchedUpdatesWithAct();

        await submitMessage('hi');

        // Then the stale label still disappears the instant the user sends
        await waitFor(async () => {
            expect(await getConciergeLabel()).toBe('');
        });

        unmount();
        await waitForBatchedUpdatesWithAct();
    });
});
