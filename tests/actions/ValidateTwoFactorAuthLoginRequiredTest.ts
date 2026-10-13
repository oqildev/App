import {afterEach, beforeEach, describe, expect, jest, test} from '@jest/globals';
import {act, renderHook} from '@testing-library/react-native';

import useIsAgentAccount from '@hooks/useIsAgentAccount';

import OnyxUpdateManager from '@libs/actions/OnyxUpdateManager';
import {validateTwoFactorAuth} from '@libs/actions/Session';
import {SIDE_EFFECT_REQUEST_COMMANDS, WRITE_COMMANDS} from '@libs/API/types';
import HttpUtils from '@libs/HttpUtils';
import registerMiddlewares from '@libs/Middleware/register';

import ONYXKEYS from '@src/ONYXKEYS';
import type Response from '@src/types/onyx/Response';

import Onyx from 'react-native-onyx';

import getOnyxValue from '../utils/getOnyxValue';
import waitForBatchedUpdates from '../utils/waitForBatchedUpdates';
import waitForBatchedUpdatesWithAct from '../utils/waitForBatchedUpdatesWithAct';

const CURRENT_USER_ACCOUNT_ID = 1;
const OTHER_ACCOUNT_ID = 2;
const CURRENT_USER_PERSONAL_DETAILS = {accountID: CURRENT_USER_ACCOUNT_ID, login: 'classic@user.com', displayName: 'Classic User'};
const STALE_REPORT_KEY = `${ONYXKEYS.COLLECTION.REPORT}123` as const;
const LAST_UPDATE_ID_APPLIED_TO_CLIENT = 100;
const POST_VALIDATE_AUTH_TOKEN = 'postValidateAuthToken';

const mockXhr = jest.fn<typeof HttpUtils.xhr<never>>();
HttpUtils.xhr = mockXhr;

Onyx.init({keys: ONYXKEYS});

// Responses have to go through SaveResponseInOnyx and the OnyxUpdateManager like they do in the app,
// because the reset under test races with how the validate response is applied.
registerMiddlewares();
OnyxUpdateManager();

let resolveOpenApp: (response: Response<never>) => void = () => {};

function getRequestedCommands() {
    return mockXhr.mock.calls.map(([command]) => command);
}

/** Answers TwoFactorAuth_Validate with the given response and keeps OpenApp in flight until resolveOpenApp is called */
function mockNetwork(validateResponse: Response<never>) {
    mockXhr.mockImplementation((command) => {
        if (command === SIDE_EFFECT_REQUEST_COMMANDS.TWO_FACTOR_AUTH_VALIDATE) {
            return Promise.resolve(validateResponse);
        }
        if (command === WRITE_COMMANDS.OPEN_APP) {
            return new Promise((resolve) => {
                resolveOpenApp = resolve;
            });
        }
        return Promise.resolve({jsonCode: 200});
    });
}

/** Resolves once the reset has finished and the openApp() that follows it has reached the network */
async function waitForOpenAppRequest() {
    for (let attempt = 0; attempt < 10 && !getRequestedCommands().includes(WRITE_COMMANDS.OPEN_APP); attempt++) {
        await waitForBatchedUpdates();
    }
    expect(getRequestedCommands()).toContain(WRITE_COMMANDS.OPEN_APP);
}

describe('validateTwoFactorAuth on the login-required path', () => {
    beforeEach(async () => {
        mockXhr.mockReset();
        await Onyx.clear();

        // A Classic user who was kept in NewDot to set up required 2FA and is on the verify step of the 2FA RHP
        await Onyx.multiSet({
            [ONYXKEYS.SESSION]: {accountID: CURRENT_USER_ACCOUNT_ID, email: CURRENT_USER_PERSONAL_DETAILS.login, authToken: 'preValidateAuthToken'},
            [ONYXKEYS.ACCOUNT]: {needsTwoFactorAuthSetup: true, requiresTwoFactorAuth: false, codesAreCopied: true, twoFactorAuthSecretKey: 'secretKey', recoveryCodes: 'codeOne, codeTwo'},
            [ONYXKEYS.NVP_TRY_NEW_DOT]: {classicRedirect: {dismissed: true, timestamp: new Date(), completedHybridAppOnboarding: true}},
            [ONYXKEYS.HAS_LOADED_APP]: true,
            [ONYXKEYS.IS_LOADING_APP]: false,
            [ONYXKEYS.PERSONAL_DETAILS_LIST]: {
                [CURRENT_USER_ACCOUNT_ID]: CURRENT_USER_PERSONAL_DETAILS,
                [OTHER_ACCOUNT_ID]: {accountID: OTHER_ACCOUNT_ID, login: 'other@user.com'},
            },
            [ONYXKEYS.ONYX_UPDATES_LAST_UPDATE_ID_APPLIED_TO_CLIENT]: LAST_UPDATE_ID_APPLIED_TO_CLIENT,
            [STALE_REPORT_KEY]: {reportID: '123'},
        });
        await waitForBatchedUpdates();
    });

    afterEach(async () => {
        // Let the OpenApp left in flight by the test finish, so the sequential queue is empty for the next test
        await act(async () => {
            resolveOpenApp({jsonCode: 200});
            await waitForBatchedUpdates();
        });
    });

    test('writes the confirmed 2FA state and keeps what the open 2FA flow reads when the validate response is deferred', async () => {
        // Given a validate response that is ahead of the Onyx updates the client has applied, so SaveResponseInOnyx
        // defers it and its successData (which clears the secret key and the loading state) is not applied
        mockNetwork({
            jsonCode: 200,
            authToken: POST_VALIDATE_AUTH_TOKEN,
            encryptedAuthToken: 'encryptedPostValidateAuthToken',
            previousUpdateID: LAST_UPDATE_ID_APPLIED_TO_CLIENT + 50,
            lastUpdateID: LAST_UPDATE_ID_APPLIED_TO_CLIENT + 51,
        });

        // When the code is validated on the login-required path and the following openApp() is still in flight
        validateTwoFactorAuth('123456', true);
        await waitForOpenAppRequest();
        await waitForBatchedUpdates();

        // Then the account says 2FA is enabled and no longer holds the secret key, which is what lets the verify page
        // advance to success on the first code, while the rest of the setup state the wizard reads is kept
        const account = await getOnyxValue(ONYXKEYS.ACCOUNT);
        expect(account).toMatchObject({requiresTwoFactorAuth: true, needsTwoFactorAuthSetup: false, isLoading: false, codesAreCopied: true, recoveryCodes: 'codeOne, codeTwo'});
        expect(account?.twoFactorAuthSecretKey).toBeUndefined();

        // Then the Classic preference survives the reset, because Got it on the success page reads it to return the user to OldDot
        expect(await getOnyxValue(ONYXKEYS.NVP_TRY_NEW_DOT)).toMatchObject({classicRedirect: {dismissed: true}});

        // Then the app still counts as loaded and still knows the current user while openApp() is loading,
        // because withAgentAccessDenied unmounts the 2FA screens when that identity is unknown
        expect(await getOnyxValue(ONYXKEYS.IS_LOADING_APP)).toBe(true);
        expect(await getOnyxValue(ONYXKEYS.HAS_LOADED_APP)).toBe(true);

        // Then it is still a full reset for everything else, so data fetched with the pre-2FA token does not linger
        expect(await getOnyxValue(ONYXKEYS.PERSONAL_DETAILS_LIST)).toStrictEqual({[CURRENT_USER_ACCOUNT_ID]: CURRENT_USER_PERSONAL_DETAILS});
        expect(await getOnyxValue(STALE_REPORT_KEY)).toBeUndefined();

        // Then openApp() runs with the post-validate auth token
        expect((await getOnyxValue(ONYXKEYS.SESSION))?.authToken).toBe(POST_VALIDATE_AUTH_TOKEN);
    });

    test('keeps the agent identity resolved through the reset so the guarded 2FA screens stay mounted', async () => {
        // Given a 2FA screen behind withAgentAccessDenied, which renders null while useIsAgentAccount is undefined
        mockNetwork({jsonCode: 200, authToken: POST_VALIDATE_AUTH_TOKEN, encryptedAuthToken: 'encryptedPostValidateAuthToken'});
        const identityStates: Array<boolean | undefined> = [];
        renderHook(() => {
            const isAgent = useIsAgentAccount();
            identityStates.push(isAgent);
            return isAgent;
        });
        await waitForBatchedUpdatesWithAct();
        expect(identityStates.at(-1)).toBe(false);
        identityStates.length = 0;

        // When the code is validated, Onyx is reset and openApp() sets the loading state while it is in flight
        await act(async () => {
            validateTwoFactorAuth('123456', true);
            await waitForOpenAppRequest();
            await waitForBatchedUpdates();
        });

        // Then the identity never goes back to unknown, because that is what blanked the RHP and remounted the verify page empty
        expect(await getOnyxValue(ONYXKEYS.IS_LOADING_APP)).toBe(true);
        expect(identityStates).not.toContain(undefined);
        expect(identityStates.at(-1)).toBe(false);
    });
});
