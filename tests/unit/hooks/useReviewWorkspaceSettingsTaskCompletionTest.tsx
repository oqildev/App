import {act, renderHook} from '@testing-library/react-native';

import useReviewWorkspaceSettingsTaskCompletion from '@hooks/useReviewWorkspaceSettingsTaskCompletion';

import type {GuidedSetupTask} from '@libs/actions/Report';
import {WRITE_COMMANDS} from '@libs/API/types';
import type {ApiCommand} from '@libs/API/types';

import {updateGeneralSettings} from '@userActions/Policy/Policy';

import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import type {IntroSelected, Policy} from '@src/types/onyx';

import Onyx from 'react-native-onyx';

import getOnyxValue from '../../utils/getOnyxValue';
import * as TestHelper from '../../utils/TestHelper';
import waitForBatchedUpdates from '../../utils/waitForBatchedUpdates';
import waitForBatchedUpdatesWithAct from '../../utils/waitForBatchedUpdatesWithAct';

const ACCOUNT_ID = 1;
const LOGIN = 'admin@test.com';
const CONCIERGE_REPORT_ID = '100';
const POLICY: Policy = {
    id: 'POLICY_1',
    name: 'Workspace',
    role: CONST.POLICY.ROLE.ADMIN,
    type: CONST.POLICY.TYPE.TEAM,
    owner: 'owner@test.com',
    outputCurrency: CONST.CURRENCY.USD,
    isPolicyExpenseChatEnabled: true,
};
const PENDING_ADMIN_INVITE: IntroSelected = {
    choice: CONST.ONBOARDING_CHOICES.ADMIN,
    inviteType: CONST.ONBOARDING_INVITE_TYPES.WORKSPACE,
    isInviteOnboardingComplete: false,
};

jest.mock('@hooks/useCurrentUserPersonalDetails', () => jest.fn(() => ({accountID: 1})));

const mockFetch = TestHelper.setupGlobalFetchMock();

function getRequestParams(command: ApiCommand) {
    return mockFetch.mock.calls
        .filter((call) => call.at(0) === `https://www.expensify.com.dev/api/${command}?`)
        .map((call) => {
            const options = call.at(1);
            const body = options && typeof options === 'object' && 'body' in options ? options.body : undefined;
            const params: Record<string, string | undefined> = {};
            if (!(body instanceof FormData)) {
                return params;
            }
            for (const [key, value] of body) {
                if (typeof value === 'string') {
                    params[key] = value;
                }
            }
            return params;
        });
}

function getRequestIndex(command: ApiCommand) {
    return mockFetch.mock.calls.findIndex((call) => call.at(0) === `https://www.expensify.com.dev/api/${command}?`);
}

function isGuidedSetupTask(item: unknown): item is GuidedSetupTask {
    return !!item && typeof item === 'object' && 'type' in item && item.type === 'task';
}

function getReviewWorkspaceSettingsTask(guidedSetupData: string | undefined) {
    const parsed: unknown = JSON.parse(guidedSetupData ?? '[]');
    const tasks = Array.isArray(parsed) ? parsed.filter(isGuidedSetupTask) : [];
    return tasks.find((task) => task.task === CONST.ONBOARDING_TASK_TYPE.REVIEW_WORKSPACE_SETTINGS);
}

async function saveWorkspaceName(getCompletionData: () => ReturnType<ReturnType<typeof useReviewWorkspaceSettingsTaskCompletion>>, name: string) {
    await act(async () => {
        updateGeneralSettings(POLICY, name, CONST.CURRENCY.USD, getCompletionData());
        await waitForBatchedUpdates();
    });
}

describe('useReviewWorkspaceSettingsTaskCompletion', () => {
    beforeAll(() => {
        Onyx.init({keys: ONYXKEYS});
    });

    beforeEach(async () => {
        await TestHelper.signInWithTestUser(ACCOUNT_ID, LOGIN);
        await act(async () => {
            await Onyx.merge(`${ONYXKEYS.COLLECTION.REPORT}${CONCIERGE_REPORT_ID}`, {reportID: CONCIERGE_REPORT_ID, type: CONST.REPORT.TYPE.CHAT});
            await Onyx.set(ONYXKEYS.CONCIERGE_REPORT_ID, CONCIERGE_REPORT_ID);
            await Onyx.merge(`${ONYXKEYS.COLLECTION.POLICY}${POLICY.id}`, POLICY);
        });
        await waitForBatchedUpdatesWithAct();
        mockFetch.mockClear();
    });

    afterEach(async () => {
        await act(async () => {
            await Onyx.clear();
        });
    });

    it('completes the task created by the OpenReport it queues ahead of the settings write, when an invited admin saves before opening Concierge', async () => {
        // Given an invited admin whose onboarding tasks have not been created yet
        await act(async () => {
            await Onyx.merge(ONYXKEYS.NVP_INTRO_SELECTED, PENDING_ADMIN_INVITE);
        });
        const {result} = renderHook(() => useReviewWorkspaceSettingsTaskCompletion());

        // When they change the workspace name
        await saveWorkspaceName(result.current, 'Renamed workspace');

        // Then OpenReport creates the task and is sent before the settings write, without marking Concierge as read
        const openReportParams = getRequestParams(WRITE_COMMANDS.OPEN_REPORT);
        expect(openReportParams).toHaveLength(1);
        expect(openReportParams.at(0)?.clientLastReadTime).toBeUndefined();
        expect(getRequestIndex(WRITE_COMMANDS.OPEN_REPORT)).toBeLessThan(getRequestIndex(WRITE_COMMANDS.UPDATE_WORKSPACE_GENERAL_SETTINGS));

        const createdTaskReportID = getReviewWorkspaceSettingsTask(openReportParams.at(0)?.guidedSetupData)?.taskReportID;
        const completedTaskReportActionID = getRequestParams(WRITE_COMMANDS.UPDATE_WORKSPACE_GENERAL_SETTINGS).at(0)?.completedTaskReportActionID;
        expect(createdTaskReportID).toBeTruthy();
        expect(completedTaskReportActionID).toBeTruthy();

        // And the settings write completes that same task, not one that no request creates
        const taskReport = await getOnyxValue(`${ONYXKEYS.COLLECTION.REPORT}${createdTaskReportID}`);
        const taskReportActions = await getOnyxValue(`${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${createdTaskReportID}`);
        expect(taskReport?.stateNum).toBe(CONST.REPORT.STATE_NUM.APPROVED);
        expect(taskReport?.statusNum).toBe(CONST.REPORT.STATUS_NUM.APPROVED);
        const completedAction = Object.values(taskReportActions ?? {}).find((action) => action?.reportActionID === completedTaskReportActionID);
        expect(completedAction?.actionName).toBe(CONST.REPORT.ACTIONS.TYPE.TASK_COMPLETED);
    });

    it('does not queue a second OpenReport or complete the task twice on the next save', async () => {
        await act(async () => {
            await Onyx.merge(ONYXKEYS.NVP_INTRO_SELECTED, PENDING_ADMIN_INVITE);
        });
        const {result, rerender} = renderHook(() => useReviewWorkspaceSettingsTaskCompletion());
        await saveWorkspaceName(result.current, 'First name');
        rerender({});
        await waitForBatchedUpdatesWithAct();

        await saveWorkspaceName(result.current, 'Second name');

        expect(getRequestParams(WRITE_COMMANDS.OPEN_REPORT)).toHaveLength(1);
        const settingsWrites = getRequestParams(WRITE_COMMANDS.UPDATE_WORKSPACE_GENERAL_SETTINGS);
        expect(settingsWrites).toHaveLength(2);
        expect(settingsWrites.at(1)?.completedTaskReportActionID).toBeUndefined();
    });

    it('keeps completing an existing task through the settings write alone', async () => {
        const TASK_REPORT_ID = '200';
        await act(async () => {
            await Onyx.merge(ONYXKEYS.NVP_INTRO_SELECTED, {...PENDING_ADMIN_INVITE, isInviteOnboardingComplete: true, reviewWorkspaceSettings: TASK_REPORT_ID});
            await Onyx.merge(`${ONYXKEYS.COLLECTION.REPORT}${TASK_REPORT_ID}`, {
                reportID: TASK_REPORT_ID,
                type: CONST.REPORT.TYPE.TASK,
                parentReportID: CONCIERGE_REPORT_ID,
                managerID: ACCOUNT_ID,
                stateNum: CONST.REPORT.STATE_NUM.OPEN,
                statusNum: CONST.REPORT.STATUS_NUM.OPEN,
            });
        });
        const {result} = renderHook(() => useReviewWorkspaceSettingsTaskCompletion());
        await waitForBatchedUpdatesWithAct();

        await saveWorkspaceName(result.current, 'Renamed workspace');

        expect(getRequestParams(WRITE_COMMANDS.OPEN_REPORT)).toHaveLength(0);
        expect(getRequestParams(WRITE_COMMANDS.UPDATE_WORKSPACE_GENERAL_SETTINGS).at(0)?.completedTaskReportActionID).toBeTruthy();
        expect((await getOnyxValue(`${ONYXKEYS.COLLECTION.REPORT}${TASK_REPORT_ID}`))?.stateNum).toBe(CONST.REPORT.STATE_NUM.APPROVED);
    });

    it('queues nothing when no guided setup is pending', async () => {
        await act(async () => {
            await Onyx.merge(ONYXKEYS.NVP_INTRO_SELECTED, {...PENDING_ADMIN_INVITE, isInviteOnboardingComplete: true});
        });
        const {result} = renderHook(() => useReviewWorkspaceSettingsTaskCompletion());

        await saveWorkspaceName(result.current, 'Renamed workspace');

        expect(getRequestParams(WRITE_COMMANDS.OPEN_REPORT)).toHaveLength(0);
        expect(getRequestParams(WRITE_COMMANDS.UPDATE_WORKSPACE_GENERAL_SETTINGS).at(0)?.completedTaskReportActionID).toBeUndefined();
    });
});
